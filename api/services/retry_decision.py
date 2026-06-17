from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from api.services.execution_outcomes import ExecutionOutcome, OutcomeClassifier


class RetryDecision(Enum):
    SHOULD_RETRY = "should_retry"
    SHOULD_NOT_RETRY = "should_not_retry"


@dataclass(frozen=True)
class RetryEvaluationContext:
    execution_id: str | None = None
    execution_outcome: ExecutionOutcome | None = None
    retryable: bool = False
    skipped: bool = False
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RetryDecisionResult:
    decision: RetryDecision
    reason: str
    retry_after_seconds: int | None = None

    @property
    def should_retry(self) -> bool:
        return self.decision == RetryDecision.SHOULD_RETRY


class RetryStrategyAdapter(ABC):
    @abstractmethod
    def evaluate(self, context: RetryEvaluationContext) -> RetryDecisionResult:
        raise NotImplementedError


class DefaultRetryStrategyAdapter(RetryStrategyAdapter):
    def __init__(self, classifier: OutcomeClassifier | None = None):
        self.classifier = classifier or OutcomeClassifier()

    def evaluate(self, context: RetryEvaluationContext) -> RetryDecisionResult:
        outcome = context.execution_outcome
        if outcome is None:
            outcome = self.classifier.classify(
                skipped=context.skipped,
                error_message=context.error_message,
                retryable=context.retryable,
            )

        if outcome == ExecutionOutcome.RETRYABLE_FAILURE:
            return RetryDecisionResult(
                decision=RetryDecision.SHOULD_RETRY,
                reason="retryable_failure",
            )

        if outcome == ExecutionOutcome.SKIPPED:
            return RetryDecisionResult(
                decision=RetryDecision.SHOULD_NOT_RETRY,
                reason="skipped_execution",
            )

        if outcome == ExecutionOutcome.PERMANENT_FAILURE:
            return RetryDecisionResult(
                decision=RetryDecision.SHOULD_NOT_RETRY,
                reason="permanent_failure",
            )

        return RetryDecisionResult(
            decision=RetryDecision.SHOULD_NOT_RETRY,
            reason="successful_execution",
        )
