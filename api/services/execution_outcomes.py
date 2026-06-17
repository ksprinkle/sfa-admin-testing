from __future__ import annotations

from enum import Enum
from typing import Any


class ExecutionOutcome(Enum):
    SUCCESS = "success"
    RETRYABLE_FAILURE = "retryable_failure"
    PERMANENT_FAILURE = "permanent_failure"
    SKIPPED = "skipped"


class OutcomeClassifier:
    """Normalizes dispatch/provider signals into provider-agnostic execution outcomes."""

    RETRYABLE_EXCEPTIONS = (
        TimeoutError,
        ConnectionError,
    )

    def classify(
        self,
        *,
        skipped: bool,
        error_message: str | None,
        retryable: bool,
    ) -> ExecutionOutcome:
        if skipped:
            return ExecutionOutcome.SKIPPED
        if error_message:
            if retryable:
                return ExecutionOutcome.RETRYABLE_FAILURE
            return ExecutionOutcome.PERMANENT_FAILURE
        return ExecutionOutcome.SUCCESS

    def classify_exception(self, exc: Exception) -> ExecutionOutcome:
        if isinstance(exc, self.RETRYABLE_EXCEPTIONS):
            return ExecutionOutcome.RETRYABLE_FAILURE
        return ExecutionOutcome.PERMANENT_FAILURE

    def classify_from_context(self, context: Any) -> ExecutionOutcome:
        skipped = bool(getattr(context, "skipped", False))
        retryable = bool(getattr(context, "retryable", False))
        error_message = getattr(context, "error_message", None)
        if error_message is not None:
            error_message = str(error_message)
        return self.classify(skipped=skipped, error_message=error_message, retryable=retryable)
