from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class DeliveryRequest:
    channel: str
    recipient: str
    subject: str | None
    body: str


@dataclass
class DeliveryResult:
    status: str
    provider_message_id: str | None = None
    error_message: str | None = None
    metadata: dict | None = None


class DeliveryProvider(Protocol):
    key: str

    def send(self, request: DeliveryRequest) -> DeliveryResult:
        ...


class NoopDeliveryProvider:
    key = "noop"

    def send(self, request: DeliveryRequest) -> DeliveryResult:
        provider_message_id = f"noop-{request.channel}-{abs(hash((request.recipient, request.body))) % 10_000_000}"
        return DeliveryResult(
            status="accepted",
            provider_message_id=provider_message_id,
            metadata={"provider": self.key},
        )


_PROVIDERS: dict[str, DeliveryProvider] = {
    NoopDeliveryProvider.key: NoopDeliveryProvider(),
}


def register_delivery_provider(provider: DeliveryProvider) -> None:
    _PROVIDERS[provider.key] = provider


def get_delivery_provider(provider_key: str) -> DeliveryProvider:
    key = (provider_key or "noop").strip().lower()
    return _PROVIDERS.get(key, _PROVIDERS["noop"])


def list_delivery_provider_keys() -> list[str]:
    return sorted(_PROVIDERS.keys())