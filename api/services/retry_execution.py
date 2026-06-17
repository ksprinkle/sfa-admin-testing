from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RetryExecutionContext:
    execution_id: str | None = None
    should_retry: bool = False
    attempt_count: int = 0
    max_attempts: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RetryExecutionResult:
    executed: bool
    attempts_executed: int
    exhausted: bool
    final_execution_state: str | None = None


class RetryAttemptTracker:
    def can_retry(self, *, attempt_count: int, max_attempts: int) -> bool:
        if max_attempts <= 0:
            return False
        return attempt_count < max_attempts
