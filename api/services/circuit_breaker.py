from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"


@dataclass(frozen=True)
class CircuitEvaluationContext:
    provider_name: str


@dataclass(frozen=True)
class CircuitDecisionResult:
    dispatch_allowed: bool
    state: CircuitState
    reason: str | None = None


@dataclass
class _ProviderCircuitStatus:
    state: CircuitState = CircuitState.CLOSED
    consecutive_failures: int = 0
    open_suppression_count: int = 0


class ProviderHealthTracker:
    """In-memory circuit state for provider dispatch eligibility decisions."""

    def __init__(self, *, failure_threshold: int = 2, recovery_after_suppressions: int = 2):
        self.failure_threshold = max(1, failure_threshold)
        self.recovery_after_suppressions = max(1, recovery_after_suppressions)
        self._status_by_provider: dict[str, _ProviderCircuitStatus] = {}

    def evaluate(self, context: CircuitEvaluationContext) -> CircuitDecisionResult:
        key = self._normalize_provider_key(context.provider_name)
        status = self._status_by_provider.setdefault(key, _ProviderCircuitStatus())

        if status.state == CircuitState.OPEN:
            status.open_suppression_count += 1
            if status.open_suppression_count < self.recovery_after_suppressions:
                return CircuitDecisionResult(
                    dispatch_allowed=False,
                    state=CircuitState.OPEN,
                    reason="circuit_open",
                )

            # Bounded recovery evaluation: close after deterministic suppression count.
            status.state = CircuitState.CLOSED
            status.consecutive_failures = 0
            status.open_suppression_count = 0
            return CircuitDecisionResult(
                dispatch_allowed=True,
                state=CircuitState.CLOSED,
                reason="recovery_evaluation_passed",
            )

        return CircuitDecisionResult(dispatch_allowed=True, state=CircuitState.CLOSED)

    def record_result(self, *, provider_name: str, succeeded: bool) -> CircuitState:
        key = self._normalize_provider_key(provider_name)
        status = self._status_by_provider.setdefault(key, _ProviderCircuitStatus())

        if succeeded:
            status.state = CircuitState.CLOSED
            status.consecutive_failures = 0
            status.open_suppression_count = 0
            return status.state

        status.consecutive_failures += 1
        if status.consecutive_failures >= self.failure_threshold:
            status.state = CircuitState.OPEN
            status.open_suppression_count = 0

        return status.state

    def get_state(self, provider_name: str) -> CircuitState:
        key = self._normalize_provider_key(provider_name)
        status = self._status_by_provider.setdefault(key, _ProviderCircuitStatus())
        return status.state

    @staticmethod
    def _normalize_provider_key(provider_name: str | None) -> str:
        return (provider_name or "").strip().lower()
