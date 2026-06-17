from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable

from api.services.execution_pipeline import (
    ExecutionContext,
    PipelineResultStatus,
    PipelineStage,
    PipelineStageError,
)
from api.services.execution_outcomes import ExecutionOutcome, OutcomeClassifier


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
