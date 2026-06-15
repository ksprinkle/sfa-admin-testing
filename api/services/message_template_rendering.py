from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.message_templates import MessageTemplate
from api.models.message_template_versions import MessageTemplateVersion


# ---------------------------------------------------------------------------
# Placeholder syntax: {{variable_name}}
# Variable names may contain letters, digits, and underscores.
# ---------------------------------------------------------------------------
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")

_IMMUTABLE_STATUSES = {MessageTemplateVersion.STATUS_PUBLISHED, MessageTemplateVersion.STATUS_RETIRED}


# ---------------------------------------------------------------------------
# Public data contracts
# ---------------------------------------------------------------------------

@dataclass
class RenderedMessage:
    """Channel-neutral rendered message produced by the template renderer.

    This is the object that the notification delivery pipeline consumes.
    It carries no provider-specific formatting; that is the responsibility
    of a future provider adapter.
    """

    template_key: str
    version_number: int
    channel: str
    subject: str | None
    body: str
    resolved_variables: dict[str, Any]
    rendering_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TemplateRenderRequest:
    template_key: str
    channel: str
    variables: dict[str, Any]
    version_number: int | None = None  # None → use active version


@dataclass
class VariableDefinition:
    name: str
    required: bool
    description: str | None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now_utc_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _normalize_key(value: str | None) -> str:
    return (value or "").strip().lower()


def _extract_placeholders(text: str | None) -> set[str]:
    if not text:
        return set()
    return {m.group(1) for m in _PLACEHOLDER_RE.finditer(text)}


def _substitute(pattern: str | None, variables: dict[str, Any]) -> str | None:
    if pattern is None:
        return None

    def replacer(match: re.Match) -> str:
        name = match.group(1)
        value = variables.get(name)
        return "" if value is None else str(value)

    return _PLACEHOLDER_RE.sub(replacer, pattern)


def _parse_variable_definitions(raw: list[dict[str, Any]] | None) -> list[VariableDefinition]:
    if not raw:
        return []
    result = []
    for item in raw:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        result.append(
            VariableDefinition(
                name=name,
                required=bool(item.get("required", False)),
                description=(item.get("description") or "").strip() or None,
            )
        )
    return result


def _load_template(db: Session, template_key: str) -> MessageTemplate:
    key = _normalize_key(template_key)
    template = (
        db.query(MessageTemplate)
        .filter(MessageTemplate.template_key == key)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail=f"Message template not found: {key!r}")
    return template


def _load_version(
    db: Session,
    template: MessageTemplate,
    version_number: int | None,
) -> MessageTemplateVersion:
    if version_number is not None:
        version = (
            db.query(MessageTemplateVersion)
            .filter(
                MessageTemplateVersion.template_id == template.id,
                MessageTemplateVersion.version_number == version_number,
            )
            .first()
        )
        if not version:
            raise HTTPException(
                status_code=404,
                detail=f"Template version {version_number} not found for {template.template_key!r}",
            )
        return version

    # Resolve active version via the FK on the template.
    if template.active_version_id:
        version = (
            db.query(MessageTemplateVersion)
            .filter(MessageTemplateVersion.id == template.active_version_id)
            .first()
        )
        if version:
            return version

    raise HTTPException(
        status_code=409,
        detail=f"No active version for template {template.template_key!r}",
    )


def _validate_render_request(
    version: MessageTemplateVersion,
    channel: str,
    template: MessageTemplate,
    variables: dict[str, Any],
) -> None:
    # Channel support
    supported = template.supported_channels or []
    if channel not in supported:
        raise HTTPException(
            status_code=400,
            detail=f"Channel {channel!r} is not supported by template {template.template_key!r}. "
                   f"Supported: {sorted(supported)}",
        )

    # Version must be published to render
    if not version.is_published:
        raise HTTPException(
            status_code=409,
            detail=f"Template version {version.version_number} is not published and cannot be rendered.",
        )

    # Required variables
    var_defs = _parse_variable_definitions(version.variable_definitions)
    missing_required = [
        vd.name for vd in var_defs
        if vd.required and (variables.get(vd.name) is None)
    ]
    if missing_required:
        raise HTTPException(
            status_code=400,
            detail="Missing required template variables: " + ", ".join(sorted(missing_required)),
        )

    # Unknown placeholders (variables referenced in the pattern but not declared)
    declared_names = {vd.name for vd in var_defs}
    used_in_subject = _extract_placeholders(version.subject_pattern)
    used_in_body = _extract_placeholders(version.body_pattern)
    all_used = used_in_subject | used_in_body
    undeclared = all_used - declared_names
    if undeclared:
        raise HTTPException(
            status_code=422,
            detail="Template contains undeclared placeholders: " + ", ".join(sorted(undeclared)),
        )


# ---------------------------------------------------------------------------
# Public rendering interface
# ---------------------------------------------------------------------------

def render_template(
    db: Session,
    request: TemplateRenderRequest,
) -> RenderedMessage:
    """Resolve a template, validate it, substitute variables, and return a
    channel-neutral RenderedMessage ready for the delivery pipeline."""

    template = _load_template(db, request.template_key)
    version = _load_version(db, template, request.version_number)
    _validate_render_request(version, request.channel, template, request.variables)

    rendered_subject = _substitute(version.subject_pattern, request.variables)
    rendered_body = _substitute(version.body_pattern, request.variables) or ""

    resolved_variables = {
        vd.name: request.variables.get(vd.name)
        for vd in _parse_variable_definitions(version.variable_definitions)
    }

    return RenderedMessage(
        template_key=template.template_key,
        version_number=version.version_number,
        channel=request.channel,
        subject=rendered_subject,
        body=rendered_body,
        resolved_variables=resolved_variables,
        rendering_metadata={
            "template_id": str(template.id),
            "version_id": str(version.id),
            "rendered_at": _now_utc_naive().isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Template and version lifecycle helpers
# ---------------------------------------------------------------------------

def create_template(
    db: Session,
    *,
    template_key: str,
    name: str,
    category: str,
    supported_channels: list[str],
    actor_user_id: str | None,
) -> MessageTemplate:
    key = _normalize_key(template_key)
    if not key:
        raise HTTPException(status_code=400, detail="template_key is required")

    existing = db.query(MessageTemplate).filter(MessageTemplate.template_key == key).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Template key already exists: {key!r}")

    normalized_channels = sorted({(c or "").strip().lower() for c in (supported_channels or []) if (c or "").strip()})
    if not normalized_channels:
        raise HTTPException(status_code=400, detail="At least one supported channel is required")

    template = MessageTemplate(
        template_key=key,
        name=name.strip(),
        category=(category or "").strip().lower(),
        supported_channels=normalized_channels,
        status=MessageTemplate.STATUS_DRAFT,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def create_template_version(
    db: Session,
    *,
    template_key: str,
    subject_pattern: str | None,
    body_pattern: str,
    variable_definitions: list[dict[str, Any]] | None,
    rendering_hints: dict[str, Any] | None,
    actor_user_id: str | None,
) -> MessageTemplateVersion:
    template = _load_template(db, template_key)

    if not (body_pattern or "").strip():
        raise HTTPException(status_code=400, detail="body_pattern is required")

    # Validate variable_definitions for duplicate names.
    var_defs = _parse_variable_definitions(variable_definitions or [])
    seen: set[str] = set()
    for vd in var_defs:
        if vd.name in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate variable definition: {vd.name!r}")
        seen.add(vd.name)

    # Next version number.
    latest = (
        db.query(MessageTemplateVersion)
        .filter(MessageTemplateVersion.template_id == template.id)
        .order_by(MessageTemplateVersion.version_number.desc())
        .first()
    )
    next_version = (latest.version_number + 1) if latest else 1

    version = MessageTemplateVersion(
        template_id=template.id,
        version_number=next_version,
        status=MessageTemplateVersion.STATUS_DRAFT,
        subject_pattern=(subject_pattern or "").strip() or None,
        body_pattern=body_pattern.strip(),
        variable_definitions=[
            {"name": vd.name, "required": vd.required, "description": vd.description}
            for vd in var_defs
        ],
        rendering_hints=rendering_hints,
        is_published=False,
        created_by_user_id=actor_user_id,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def publish_template_version(
    db: Session,
    *,
    template_key: str,
    version_number: int,
    actor_user_id: str | None,
) -> MessageTemplateVersion:
    template = _load_template(db, template_key)
    version = _load_version(db, template, version_number)

    if version.is_published:
        raise HTTPException(
            status_code=409,
            detail=f"Version {version_number} is already published.",
        )

    # Validate that all placeholders used in patterns are declared.
    var_defs = _parse_variable_definitions(version.variable_definitions)
    declared_names = {vd.name for vd in var_defs}
    all_used = _extract_placeholders(version.subject_pattern) | _extract_placeholders(version.body_pattern)
    undeclared = all_used - declared_names
    if undeclared:
        raise HTTPException(
            status_code=422,
            detail="Cannot publish: template contains undeclared placeholders: " + ", ".join(sorted(undeclared)),
        )

    now = _now_utc_naive()
    version.is_published = True
    version.status = MessageTemplateVersion.STATUS_PUBLISHED
    version.published_at = now

    # Activate this version on the template and set the template to active.
    template.active_version_id = version.id
    template.status = MessageTemplate.STATUS_ACTIVE
    template.updated_by_user_id = actor_user_id
    template.updated_at = now

    db.commit()
    db.refresh(version)
    db.refresh(template)
    return version


def retire_template_version(
    db: Session,
    *,
    template_key: str,
    version_number: int,
    actor_user_id: str | None,
) -> MessageTemplateVersion:
    template = _load_template(db, template_key)
    version = _load_version(db, template, version_number)

    if version.status == MessageTemplateVersion.STATUS_RETIRED:
        raise HTTPException(status_code=409, detail="Version is already retired.")

    if not version.is_published:
        raise HTTPException(
            status_code=409,
            detail="Only published versions can be retired.",
        )

    version.status = MessageTemplateVersion.STATUS_RETIRED

    # If this was the active version, clear the active pointer and set
    # template back to draft so operators know attention is needed.
    now = _now_utc_naive()
    if template.active_version_id == version.id:
        template.active_version_id = None
        template.status = MessageTemplate.STATUS_DRAFT
        template.updated_by_user_id = actor_user_id
        template.updated_at = now

    db.commit()
    db.refresh(version)
    return version


def get_template(db: Session, template_key: str) -> MessageTemplate:
    return _load_template(db, template_key)


def list_templates(
    db: Session,
    *,
    category: str | None = None,
    status: str | None = None,
) -> list[MessageTemplate]:
    query = db.query(MessageTemplate)
    if category:
        query = query.filter(MessageTemplate.category == category.strip().lower())
    if status:
        query = query.filter(MessageTemplate.status == status.strip().lower())
    return query.order_by(MessageTemplate.created_at.desc()).all()


def list_template_versions(
    db: Session,
    *,
    template_key: str,
) -> list[MessageTemplateVersion]:
    template = _load_template(db, template_key)
    return (
        db.query(MessageTemplateVersion)
        .filter(MessageTemplateVersion.template_id == template.id)
        .order_by(MessageTemplateVersion.version_number.desc())
        .all()
    )
