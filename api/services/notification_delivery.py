from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class NotificationRequest:
    channel: str
    recipient: str
    subject: str | None
    body: str
    context: dict[str, Any] | None = None


@dataclass
class NotificationResult:
    status: str
    provider_message_id: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] | None = None


class NotificationProvider(Protocol):
    key: str

    def send(self, request: NotificationRequest) -> NotificationResult:
        ...


class NoopNotificationProvider:
    key = "noop"

    def send(self, request: NotificationRequest) -> NotificationResult:
        provider_message_id = f"noop-{request.channel}-{abs(hash((request.recipient, request.body))) % 10_000_000}"
        return NotificationResult(
            status="accepted",
            provider_message_id=provider_message_id,
            metadata={"provider": self.key},
        )


_PROVIDERS: dict[str, NotificationProvider] = {
    NoopNotificationProvider.key: NoopNotificationProvider(),
}


def register_notification_provider(provider: NotificationProvider) -> None:
    _PROVIDERS[provider.key] = provider


def get_notification_provider(provider_key: str) -> NotificationProvider:
    key = (provider_key or "noop").strip().lower()
    return _PROVIDERS.get(key, _PROVIDERS["noop"])


def list_notification_provider_keys() -> list[str]:
    return sorted(_PROVIDERS.keys())