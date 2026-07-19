from __future__ import annotations

import json
from base64 import b64decode
import smtplib
import socket
import ssl
from dataclasses import asdict, dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from hashlib import sha256
from enum import StrEnum
from typing import Any, Iterable, Protocol

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.config import settings
from api.services.message_template_rendering import RenderedMessage
from api.services.notification_pipeline import DeliveryQueueRequest, queue_notification_delivery


EMAIL_CHANNEL = "email"
EMAIL_PROVIDER_KEY = (settings.EMAIL_PROVIDER_KEY or "email.noop").strip().lower() or "email.noop"
EMAIL_DEFAULT_SENDER = settings.EMAIL_DEFAULT_SENDER


def _default_provider_key() -> str:
    return (settings.EMAIL_PROVIDER_KEY or EMAIL_PROVIDER_KEY).strip().lower() or EMAIL_PROVIDER_KEY


@dataclass
class Attachment:
    filename: str
    content_type: str
    content_base64: str
    disposition: str = "attachment"
    content_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EmailRequest:
    to: list[str]
    cc: list[str] = field(default_factory=list)
    bcc: list[str] = field(default_factory=list)
    sender: str = EMAIL_DEFAULT_SENDER
    reply_to: str | None = None
    subject: str = ""
    html: str | None = None
    text: str | None = None
    attachments: list[Attachment] = field(default_factory=list)
    headers: dict[str, str] = field(default_factory=dict)
    metadata: dict[str, str] = field(default_factory=dict)


class DeliveryStatus(StrEnum):
    SUCCESS = "success"
    REJECTED = "rejected"
    FAILED = "failed"
    TEMPORARY_FAILURE = "temporary_failure"


@dataclass
class DeliveryResult:
    status: DeliveryStatus
    provider: str
    message_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class EmailProvider(Protocol):
    key: str

    def send(self, request: EmailRequest) -> DeliveryResult:
        ...


class EmailDeliveryError(Exception):
    """Raised by callers that want fail-loud semantics around a non-success
    DeliveryResult, instead of the default (send() returns a result, doesn't
    raise). Carries only what DeliveryResult itself exposes - status/error
    code/error message - never request or provider credentials."""

    def __init__(self, result: DeliveryResult):
        self.result = result
        super().__init__(
            f"Email delivery failed via {result.provider}: {result.status.value}"
            + (f" ({result.error_message})" if result.error_message else "")
        )


def _normalize_provider_key(value: str | None) -> str:
    return (value or _default_provider_key()).strip().lower() or _default_provider_key()


def _normalize_channel(value: str | None) -> str:
    return (value or EMAIL_CHANNEL).strip().lower()


def _normalize_source_domain(value: str | None) -> str:
    return (value or "email").strip().lower()


def _normalize_source_id(value: str | None) -> str | None:
    return (value or "").strip() or None


def _normalize_header_mapping(values: dict[str, Any] | None) -> dict[str, str]:
    if not values:
        return {}

    normalized: dict[str, str] = {}
    for key, value in values.items():
        header_key = str(key).strip()
        if not header_key:
            continue
        normalized[header_key] = "" if value is None else str(value)
    return normalized


def _normalize_metadata_mapping(values: dict[str, Any] | None) -> dict[str, str]:
    if not values:
        return {}

    normalized: dict[str, str] = {}
    for key, value in values.items():
        metadata_key = str(key).strip()
        if not metadata_key:
            continue
        normalized[metadata_key] = "" if value is None else str(value)
    return normalized


def _normalize_email_list(values: Iterable[str] | None, *, field_name: str, required: bool = False) -> list[str]:
    normalized: list[str] = []
    if values is not None:
        for value in values:
            normalized.append(validate_email_recipient(value))

    if required and not normalized:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    deduped: list[str] = []
    seen: set[str] = set()
    for value in normalized:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


def validate_email_recipient(recipient: str) -> str:
    candidate = (recipient or "").strip()
    if not candidate:
        raise HTTPException(status_code=400, detail="Email recipient is required")

    try:
        validated = validate_email(candidate, check_deliverability=False)
    except EmailNotValidError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid email recipient: {exc}") from exc

    return validated.normalized


def _normalize_email_request(request: EmailRequest) -> EmailRequest:
    sender = validate_email_recipient(request.sender)
    reply_to = validate_email_recipient(request.reply_to) if request.reply_to else None
    return EmailRequest(
        to=_normalize_email_list(request.to, field_name="to", required=True),
        cc=_normalize_email_list(request.cc, field_name="cc"),
        bcc=_normalize_email_list(request.bcc, field_name="bcc"),
        sender=sender,
        reply_to=reply_to,
        subject=(request.subject or "").strip(),
        html=request.html,
        text=request.text,
        attachments=list(request.attachments or []),
        headers=_normalize_header_mapping(request.headers),
        metadata=_normalize_metadata_mapping(request.metadata),
    )


def _smtp_configuration_error() -> str | None:
    if not settings.SMTP_HOST:
        return "SMTP_HOST is required for the SMTP provider"

    if settings.SMTP_PORT <= 0:
        return "SMTP_PORT must be greater than 0"

    if settings.SMTP_USE_SSL and settings.SMTP_USE_TLS:
        return "SMTP_USE_SSL and SMTP_USE_TLS cannot both be enabled"

    if settings.SMTP_REQUIRE_AUTH and (not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD):
        return "SMTP_USERNAME and SMTP_PASSWORD are required when SMTP_REQUIRE_AUTH is enabled"

    return None


def _attachment_filename(attachment: Attachment) -> str:
    return attachment.filename.strip() or "attachment"


def _build_email_message(request: EmailRequest) -> EmailMessage:
    message = EmailMessage()
    # Display name (if configured) only ever affects this header, never the
    # envelope sender used for SMTP MAIL FROM (SMTPEmailProvider.send() uses
    # request.sender directly, unchanged) - request.sender itself stays a
    # plain, validated address throughout.
    message["From"] = (
        formataddr((settings.EMAIL_SENDER_DISPLAY_NAME, request.sender))
        if settings.EMAIL_SENDER_DISPLAY_NAME
        else request.sender
    )
    message["To"] = ", ".join(request.to)
    if request.cc:
        message["Cc"] = ", ".join(request.cc)
    if request.reply_to:
        message["Reply-To"] = request.reply_to
    message["Subject"] = request.subject
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid()

    for header_name, header_value in request.headers.items():
        if header_name.lower() in {"from", "to", "cc", "bcc", "reply-to", "subject", "date", "message-id"}:
            continue
        message[header_name] = header_value

    if request.text is not None:
        message.set_content(request.text)
    else:
        message.set_content("")

    if request.html is not None:
        message.add_alternative(request.html, subtype="html")

    for attachment in request.attachments:
        try:
            content = b64decode(attachment.content_base64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid attachment encoding for {attachment.filename!r}: {exc}") from exc

        maintype, _, subtype = (attachment.content_type or "application/octet-stream").partition("/")
        if not subtype:
            maintype = "application"
            subtype = "octet-stream"

        message.add_attachment(
            content,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=_attachment_filename(attachment),
            disposition=attachment.disposition,
            cid=attachment.content_id,
        )

    return message


class SMTPEmailProvider:
    key = "email.smtp"

    def send(self, request: EmailRequest) -> DeliveryResult:
        try:
            normalized_request = _normalize_email_request(request)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            return DeliveryResult(
                status=DeliveryStatus.REJECTED,
                provider=self.key,
                error_code="invalid_request",
                error_message=detail,
                metadata={"provider": self.key},
            )

        configuration_error = _smtp_configuration_error()
        if configuration_error:
            return DeliveryResult(
                status=DeliveryStatus.FAILED,
                provider=self.key,
                error_code="configuration_error",
                error_message=configuration_error,
                metadata={"provider": self.key},
            )

        try:
            message = _build_email_message(normalized_request)
            recipients = normalized_request.to + normalized_request.cc + normalized_request.bcc
            if settings.SMTP_USE_SSL:
                smtp_factory = smtplib.SMTP_SSL
                smtp_context = None
            else:
                smtp_factory = smtplib.SMTP
                smtp_context = ssl.create_default_context() if settings.SMTP_USE_TLS else None

            with smtp_factory(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=settings.SMTP_TIMEOUT_SECONDS,
            ) as smtp:
                if smtp_context is not None:
                    smtp.starttls(context=smtp_context)

                if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                    smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

                refused = smtp.send_message(message, from_addr=normalized_request.sender, to_addrs=recipients)
                if refused:
                    return DeliveryResult(
                        status=DeliveryStatus.REJECTED,
                        provider=self.key,
                        message_id=message.get("Message-ID"),
                        error_code="recipient_rejected",
                        error_message="One or more recipients were rejected by the SMTP server",
                        metadata={"provider": self.key, "refused": refused},
                    )

                return DeliveryResult(
                    status=DeliveryStatus.SUCCESS,
                    provider=self.key,
                    message_id=message.get("Message-ID"),
                    metadata={
                        "provider": self.key,
                        "recipient_count": len(recipients),
                        "has_html": normalized_request.html is not None,
                        "has_text": normalized_request.text is not None,
                        "attachment_count": len(normalized_request.attachments),
                    },
                )

        except smtplib.SMTPAuthenticationError as exc:
            return DeliveryResult(
                status=DeliveryStatus.FAILED,
                provider=self.key,
                error_code="authentication_failed",
                error_message=str(exc),
                metadata={"provider": self.key},
            )
        except smtplib.SMTPRecipientsRefused as exc:
            return DeliveryResult(
                status=DeliveryStatus.REJECTED,
                provider=self.key,
                error_code="recipient_rejected",
                error_message=str(exc),
                metadata={"provider": self.key, "refused": exc.recipients},
            )
        except (socket.timeout, TimeoutError, smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, ConnectionError) as exc:
            return DeliveryResult(
                status=DeliveryStatus.TEMPORARY_FAILURE,
                provider=self.key,
                error_code="temporary_failure",
                error_message=str(exc),
                metadata={"provider": self.key},
            )
        except (smtplib.SMTPException, OSError, UnicodeError, ValueError) as exc:
            return DeliveryResult(
                status=DeliveryStatus.FAILED,
                provider=self.key,
                error_code="smtp_failure",
                error_message=str(exc),
                metadata={"provider": self.key},
            )


def _extract_rendered_bodies(rendered_message: RenderedMessage) -> tuple[str | None, str | None]:
    rendering_metadata = rendered_message.rendering_metadata or {}
    html_body = rendering_metadata.get("html_body") or rendering_metadata.get("html")
    text_body = rendering_metadata.get("text_body") or rendered_message.body
    return (
        str(html_body) if html_body is not None else None,
        str(text_body) if text_body is not None else None,
    )


def _request_fingerprint(request: EmailRequest, *, source_domain: str, source_id: str | None) -> str:
    normalized_request = _normalize_email_request(request)
    payload = {
        "source_domain": _normalize_source_domain(source_domain),
        "source_id": _normalize_source_id(source_id),
        "request": asdict(normalized_request),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def build_email_delivery_key(
    request: EmailRequest,
    *,
    source_domain: str,
    source_id: str | None = None,
) -> str:
    digest = sha256(_request_fingerprint(request, source_domain=source_domain, source_id=source_id).encode("utf-8")).hexdigest()
    return f"email:{digest}"


def build_email_request(
    rendered_message: RenderedMessage,
    *,
    recipient: str,
    sender: str | None = None,
    reply_to: str | None = None,
    cc: Iterable[str] | None = None,
    bcc: Iterable[str] | None = None,
    source_domain: str,
    source_id: str | None = None,
    headers: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> EmailRequest:
    html_body, text_body = _extract_rendered_bodies(rendered_message)
    request = EmailRequest(
        to=[validate_email_recipient(recipient)],
        cc=_normalize_email_list(cc, field_name="cc"),
        bcc=_normalize_email_list(bcc, field_name="bcc"),
        sender=validate_email_recipient(sender or EMAIL_DEFAULT_SENDER),
        reply_to=validate_email_recipient(reply_to) if reply_to else None,
        subject=(rendered_message.subject or "").strip(),
        html=html_body,
        text=text_body,
        headers=_normalize_header_mapping(headers),
        metadata=_normalize_metadata_mapping(metadata),
    )
    return _normalize_email_request(request)


def build_email_notification_request(
    rendered_message: RenderedMessage,
    *,
    recipient: str,
    sender: str | None = None,
    reply_to: str | None = None,
    cc: Iterable[str] | None = None,
    bcc: Iterable[str] | None = None,
    headers: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> EmailRequest:
    return build_email_request(
        rendered_message,
        recipient=recipient,
        sender=sender,
        reply_to=reply_to,
        cc=cc,
        bcc=bcc,
        source_domain="email",
        headers=headers,
        metadata=metadata,
    )


class EmailNoopProvider:
    # A fixed literal, matching SMTPEmailProvider.key's pattern - not the
    # dynamic EMAIL_PROVIDER_KEY module constant (that's the *selected*
    # provider key, derived from settings at import time; binding it here
    # meant EmailNoopProvider.key silently became "email.smtp" whenever
    # EMAIL_PROVIDER_KEY=email.smtp was set, colliding with
    # SMTPEmailProvider.key in the _PROVIDERS registry below).
    key = "email.noop"

    def send(self, request: EmailRequest) -> DeliveryResult:
        try:
            normalized_request = _normalize_email_request(request)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            return DeliveryResult(
                status=DeliveryStatus.REJECTED,
                provider=self.key,
                error_code="invalid_request",
                error_message=detail,
                metadata={"provider": self.key},
            )

        provider_message_id = sha256(
            json.dumps(
                {
                    "sender": normalized_request.sender,
                    "to": normalized_request.to,
                    "cc": normalized_request.cc,
                    "bcc": normalized_request.bcc,
                    "subject": normalized_request.subject,
                    "html": normalized_request.html,
                    "text": normalized_request.text,
                    "headers": normalized_request.headers,
                    "metadata": normalized_request.metadata,
                },
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            ).encode("utf-8")
        ).hexdigest()[:24]
        return DeliveryResult(
            status=DeliveryStatus.SUCCESS,
            provider=self.key,
            message_id=f"email-noop-{provider_message_id}",
            metadata={
                "provider": self.key,
                "to_count": len(normalized_request.to),
                "cc_count": len(normalized_request.cc),
                "bcc_count": len(normalized_request.bcc),
                "attachment_count": len(normalized_request.attachments),
            },
        )


_PROVIDERS: dict[str, EmailProvider] = {
    EmailNoopProvider.key: EmailNoopProvider(),
    SMTPEmailProvider.key: SMTPEmailProvider(),
}


def register_email_provider(provider: EmailProvider) -> None:
    _PROVIDERS[_normalize_provider_key(provider.key)] = provider


def get_email_provider(provider_key: str | None = None) -> EmailProvider:
    key = _normalize_provider_key(provider_key or settings.EMAIL_PROVIDER_KEY)
    return _PROVIDERS.get(key, _PROVIDERS[EMAIL_PROVIDER_KEY])


def list_email_provider_keys() -> list[str]:
    return sorted(_PROVIDERS.keys())


def queue_rendered_email_delivery(
    db: Session,
    *,
    rendered_message: RenderedMessage,
    recipient: str,
    source_domain: str,
    source_id: str | None = None,
    provider_key: str | None = None,
    delivery_key: str | None = None,
    actor_user_id: str | None = None,
    execution_queue_item_id: str | None = None,
    headers: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Any:
    if _normalize_channel(rendered_message.channel) != EMAIL_CHANNEL:
        raise HTTPException(status_code=400, detail="Rendered message channel must be email")

    email_request = build_email_request(
        rendered_message,
        recipient=recipient,
        sender=EMAIL_DEFAULT_SENDER,
        source_domain=source_domain,
        source_id=source_id,
        reply_to=None,
        cc=None,
        bcc=None,
        headers=headers,
        metadata=metadata,
    )
    normalized_source_domain = _normalize_source_domain(source_domain)
    normalized_source_id = _normalize_source_id(source_id)
    request_key = delivery_key or build_email_delivery_key(
        email_request,
        source_domain=normalized_source_domain,
        source_id=normalized_source_id,
    )

    delivery_request = DeliveryQueueRequest(
        delivery_key=request_key,
        source_domain=normalized_source_domain,
        source_id=normalized_source_id,
        execution_queue_item_id=execution_queue_item_id,
        channel=EMAIL_CHANNEL,
        recipient=email_request.to[0],
        provider_key=_normalize_provider_key(provider_key or settings.EMAIL_PROVIDER_KEY),
        delivery_payload={
            "email_request": asdict(email_request),
            "subject": email_request.subject,
            "body": email_request.text,
            "context": {
                "rendered_message": asdict(rendered_message),
                "headers": email_request.headers,
                "metadata": email_request.metadata,
            },
        },
        actor_user_id=actor_user_id,
        metadata={
            "template_key": rendered_message.template_key,
            "version_number": rendered_message.version_number,
            "resolved_variables": rendered_message.resolved_variables,
            "rendering_metadata": rendered_message.rendering_metadata,
            "email_request": asdict(email_request),
        },
    )
    return queue_notification_delivery(db, delivery_request)
