from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Iterable

from api.services.execution_outcomes import ExecutionOutcome, OutcomeClassifier
from api.services.failover_execution import FailoverResult
from api.services.retry_decision import RetryDecisionResult
from api.services.retry_execution import RetryExecutionResult


class PipelineResultStatus(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    RETRYABLE_FAILURE = "retryable_failure"
    SKIPPED = "skipped"


@dataclass
class ExecutionContext:
    reminder_id: str | None = None
    execution_id: str | None = None
    channel: str | None = None
    provider_name: str | None = None
    execution_state: str | None = None
    error_message: str | None = None
    retryable: bool = False
    skipped: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)
    execution_outcome: ExecutionOutcome | None = None
    result_status: PipelineResultStatus | None = None
    retry_decision: RetryDecisionResult | None = None
    retry_execution_result: RetryExecutionResult | None = None
    failover_result: FailoverResult | None = None


@dataclass
class PipelineResult:
    status: PipelineResultStatus
    context: ExecutionContext
    retry_decision: RetryDecisionResult | None = None
    retry_execution_result: RetryExecutionResult | None = None
    failover_result: FailoverResult | None = None


class PipelineStageError(Exception):
    def __init__(self, message: str, *, status: PipelineResultStatus | None = None):
        super().__init__(message)
        self.status = status


class PipelineStage(ABC):
    @abstractmethod
    def execute(self, context: ExecutionContext) -> ExecutionContext:
        raise NotImplementedError


class ExecutionPipeline:
    def __init__(self, stages: Iterable[PipelineStage]):
        self.stages = list(stages)

    def execute(self, context: ExecutionContext) -> PipelineResult:
        current = context
        for stage in self.stages:
            try:
                current = stage.execute(current)
            except PipelineStageError as exc:
                current.error_message = str(exc)
                status = exc.status or self._status_from_context(current)
                return PipelineResult(
                    status=status,
                    context=current,
                    retry_decision=current.retry_decision,
                    retry_execution_result=current.retry_execution_result,
                    failover_result=current.failover_result,
                )
            except Exception as exc:
                current.error_message = str(exc)
                return PipelineResult(
                    status=PipelineResultStatus.FAILED,
                    context=current,
                    retry_decision=current.retry_decision,
                    retry_execution_result=current.retry_execution_result,
                    failover_result=current.failover_result,
                )

        return PipelineResult(
            status=self._status_from_context(current),
            context=current,
            retry_decision=current.retry_decision,
            retry_execution_result=current.retry_execution_result,
            failover_result=current.failover_result,
        )

    def _status_from_context(self, context: ExecutionContext) -> PipelineResultStatus:
        if context.result_status is not None:
            return context.result_status
        if context.execution_outcome is None:
            context.execution_outcome = OutcomeClassifier().classify(
                skipped=context.skipped,
                error_message=context.error_message,
                retryable=context.retryable,
            )
        return self._map_execution_outcome_to_result_status(context.execution_outcome)

    def _map_execution_outcome_to_result_status(self, outcome: ExecutionOutcome) -> PipelineResultStatus:
        if outcome == ExecutionOutcome.SUCCESS:
            return PipelineResultStatus.SUCCESS
        if outcome == ExecutionOutcome.RETRYABLE_FAILURE:
            return PipelineResultStatus.RETRYABLE_FAILURE
        if outcome == ExecutionOutcome.SKIPPED:
            return PipelineResultStatus.SKIPPED
        return PipelineResultStatus.FAILED
