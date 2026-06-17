from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable

from api.services.execution_pipeline import (
    ExecutionContext,
    PipelineResultStatus,
    PipelineStage,
    PipelineStageError,
)
from api.services.execution_outcomes import ExecutionOutcome, OutcomeClassifier
from api.services.retry_decision import (
    DefaultRetryStrategyAdapter,
    RetryEvaluationContext,
    RetryStrategyAdapter,
)
from api.services.retry_execution import (
    RetryAttemptTracker,
    RetryExecutionResult,
)


@dataclass
class ValidateExecutionStage(PipelineStage):
    required_fields: Iterable[str] = ("execution_id",)

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        for field_name in self.required_fields:
            value = getattr(context, field_name, None)
            if value is None or (isinstance(value, str) and not value.strip()):
                raise PipelineStageError(
                    f"Missing required execution context field: {field_name}",
                    status=PipelineResultStatus.FAILED,
                )
        return context


@dataclass
class ResolveProviderStage(PipelineStage):
    resolver: Callable[[ExecutionContext], str]

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        provider_name = (self.resolver(context) or "").strip().lower()
        if not provider_name:
            raise PipelineStageError(
                "Provider resolution failed",
                status=PipelineResultStatus.FAILED,
            )
        context.provider_name = provider_name
        return context


@dataclass
class DispatchExecutionStage(PipelineStage):
    dispatcher: Callable[[ExecutionContext], ExecutionContext]

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        return self.dispatcher(context)


class RecordResultStage(PipelineStage):
    def __init__(self, classifier: OutcomeClassifier | None = None):
        self.classifier = classifier or OutcomeClassifier()

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        if context.execution_outcome is None:
            context.execution_outcome = self.classifier.classify_from_context(context)

        if context.result_status is not None:
            return context

        if context.execution_outcome == ExecutionOutcome.SKIPPED:
            context.result_status = PipelineResultStatus.SKIPPED
        elif context.execution_outcome == ExecutionOutcome.RETRYABLE_FAILURE:
            context.result_status = PipelineResultStatus.RETRYABLE_FAILURE
        elif context.execution_outcome == ExecutionOutcome.PERMANENT_FAILURE:
            context.result_status = PipelineResultStatus.FAILED
        else:
            context.result_status = PipelineResultStatus.SUCCESS

        return context


@dataclass
class RetryDecisionStage(PipelineStage):
    strategy: RetryStrategyAdapter = field(default_factory=DefaultRetryStrategyAdapter)

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        if context.retry_decision is not None:
            return context

        evaluation_context = RetryEvaluationContext(
            execution_id=context.execution_id,
            execution_outcome=context.execution_outcome,
            retryable=context.retryable,
            skipped=context.skipped,
            error_message=context.error_message,
            metadata=context.metadata,
        )
        context.retry_decision = self.strategy.evaluate(evaluation_context)
        return context


@dataclass
class RetryExecutionStage(PipelineStage):
    executor: Callable[[ExecutionContext], ExecutionContext]
    strategy: RetryStrategyAdapter = field(default_factory=DefaultRetryStrategyAdapter)
    tracker: RetryAttemptTracker = field(default_factory=RetryAttemptTracker)

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        if context.retry_decision is None:
            context = RetryDecisionStage(strategy=self.strategy).execute(context)

        attempt_count = int(context.metadata.get("attempt_count", 0) or 0)
        max_attempts = int(context.metadata.get("max_attempts", 0) or 0)
        attempts_executed = 0

        while context.retry_decision and context.retry_decision.should_retry:
            if not self.tracker.can_retry(attempt_count=attempt_count, max_attempts=max_attempts):
                break

            previous_attempt_count = attempt_count
            context = self.executor(context)
            attempts_executed += 1

            updated_attempt_count = int(context.metadata.get("attempt_count", attempt_count) or attempt_count)
            # Guard against non-advancing attempt counters to avoid infinite retry loops.
            if updated_attempt_count <= previous_attempt_count:
                updated_attempt_count = previous_attempt_count + 1
                context.metadata["attempt_count"] = updated_attempt_count

            attempt_count = updated_attempt_count
            max_attempts = int(context.metadata.get("max_attempts", max_attempts) or max_attempts)

            context.result_status = None
            context.execution_outcome = None
            context.retry_decision = None
            context = RecordResultStage().execute(context)
            context = RetryDecisionStage(strategy=self.strategy).execute(context)

        exhausted = bool(
            context.retry_decision
            and context.retry_decision.should_retry
            and not self.tracker.can_retry(attempt_count=attempt_count, max_attempts=max_attempts)
        )

        context.retry_execution_result = RetryExecutionResult(
            executed=attempts_executed > 0,
            attempts_executed=attempts_executed,
            exhausted=exhausted,
            final_execution_state=context.execution_state,
        )
        return context
