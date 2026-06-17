from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FailoverExecutionContext:
    execution_id: str | None = None
    current_provider: str | None = None
    retry_exhausted: bool = False
    candidate_providers: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FailoverResult:
    eligible: bool
    attempted: bool
    selected_provider: str | None
    succeeded: bool
    exhausted: bool
    reason: str | None = None
    final_execution_state: str | None = None


class ProviderCandidateSelector:
    def select(self, context: FailoverExecutionContext) -> str | None:
        normalized_current = (context.current_provider or "").strip().lower()
        for candidate in context.candidate_providers:
            normalized_candidate = (candidate or "").strip().lower()
            if not normalized_candidate:
                continue
            if normalized_candidate == normalized_current:
                continue
            return normalized_candidate
        return None
