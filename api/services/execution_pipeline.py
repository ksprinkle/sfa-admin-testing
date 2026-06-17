from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Iterable


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
    result_status: PipelineResultStatus | None = None


@dataclass
class PipelineResult:
    status: PipelineResultStatus
    context: ExecutionContext


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
                return PipelineResult(status=status, context=current)
            except Exception as exc:
                current.error_message = str(exc)
                return PipelineResult(status=PipelineResultStatus.FAILED, context=current)

        return PipelineResult(status=self._status_from_context(current), context=current)

    def _status_from_context(self, context: ExecutionContext) -> PipelineResultStatus:
        if context.result_status is not None:
            return context.result_status
        if context.skipped:
            return PipelineResultStatus.SKIPPED
        if context.error_message and context.retryable:
            return PipelineResultStatus.RETRYABLE_FAILURE
        if context.error_message:
            return PipelineResultStatus.FAILED
        return PipelineResultStatus.SUCCESS
