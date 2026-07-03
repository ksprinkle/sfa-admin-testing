from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable

from api.services.circuit_breaker import (
    CircuitEvaluationContext,
    ProviderHealthTracker,
)
from api.services.execution_pipeline import (
    ExecutionContext,
    PipelineResultStatus,
    PipelineStage,
    PipelineStageError,
)
from api.services.execution_observability import emit_observability_event
from api.services.execution_outcomes import ExecutionOutcome, OutcomeClassifier
from api.services.failover_execution import (
    FailoverExecutionContext,
    FailoverResult,
    ProviderCandidateSelector,
)
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


@dataclass
class CircuitBreakerStage(PipelineStage):
    dispatcher: Callable[[ExecutionContext], ExecutionContext]
    tracker: ProviderHealthTracker = field(default_factory=ProviderHealthTracker)

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        provider_name = (context.provider_name or "").strip().lower()
        if not provider_name:
            raise PipelineStageError(
                "Circuit evaluation requires a resolved provider",
                status=PipelineResultStatus.FAILED,
            )

        decision = self.tracker.evaluate(CircuitEvaluationContext(provider_name=provider_name))
        context.circuit_decision = decision
        context.metadata["circuit_state"] = decision.state.value
        emit_observability_event(
            context,
            "circuit_evaluated",
            payload={
                "provider": provider_name,
                "state": decision.state.value,
                "dispatch_allowed": decision.dispatch_allowed,
                "reason": decision.reason,
            },
        )

        if not decision.dispatch_allowed:
            context.execution_state = "suppressed_open_circuit"
            context.error_message = "Dispatch suppressed by open circuit"
            context.retryable = True
            context.skipped = False
            emit_observability_event(
                context,
                "circuit_blocked",
                payload={"provider": provider_name, "state": decision.state.value},
            )
            return context

        context = self.dispatcher(context)
        succeeded = (context.execution_state or "").strip().lower() == "succeeded"
        state = self.tracker.record_result(provider_name=provider_name, succeeded=succeeded)
        context.metadata["circuit_state"] = state.value
        emit_observability_event(
            context,
            "circuit_closed" if state.value == "closed" else "circuit_open",
            payload={"provider": provider_name, "state": state.value, "dispatch_succeeded": succeeded},
        )
        return context


class RecordResultStage(PipelineStage):
    def __init__(self, classifier: OutcomeClassifier | None = None):
        self.classifier = classifier or OutcomeClassifier()

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        if context.execution_outcome is None:
            context.execution_outcome = self.classifier.classify_from_context(context)
            emit_observability_event(
                context,
                "outcome_classified",
                payload={"execution_outcome": context.execution_outcome.value},
            )

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
            emit_observability_event(
                context,
                "retry_evaluated",
                payload={
                    "should_retry": context.retry_decision.should_retry,
                    "decision": context.retry_decision.decision.value,
                    "reason": context.retry_decision.reason,
                },
            )
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
        emit_observability_event(
            context,
            "retry_evaluated",
            payload={
                "should_retry": context.retry_decision.should_retry,
                "decision": context.retry_decision.decision.value,
                "reason": context.retry_decision.reason,
            },
        )
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
            emit_observability_event(
                context,
                "retry_executed",
                payload={
                    "attempt_number": attempts_executed,
                    "attempt_count": int(context.metadata.get("attempt_count", attempt_count) or attempt_count),
                    "max_attempts": max_attempts,
                },
            )

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
        if exhausted:
            emit_observability_event(
                context,
                "retry_exhausted",
                payload={"attempt_count": attempt_count, "max_attempts": max_attempts},
            )
        return context


@dataclass
class FailoverDecisionStage(PipelineStage):
    candidate_selector: Callable[[ExecutionContext], str | None]
    executor: Callable[[ExecutionContext, str], ExecutionContext]

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        if context.failover_result is not None:
            return context

        retry_result = context.retry_execution_result
        retry_exhausted = bool(retry_result and retry_result.exhausted)
        if not retry_exhausted:
            context.failover_result = FailoverResult(
                eligible=False,
                attempted=False,
                selected_provider=None,
                succeeded=False,
                exhausted=False,
                reason="retry_not_exhausted",
                final_execution_state=context.execution_state,
            )
            emit_observability_event(
                context,
                "failover_evaluated",
                payload={"eligible": False, "reason": "retry_not_exhausted"},
            )
            return context

        failover_depth = int(context.metadata.get("failover_depth", 0) or 0)
        if failover_depth >= 1:
            context.retryable = False
            context.error_message = context.error_message or "Failover chain blocked"
            context.result_status = None
            context.execution_outcome = None
            context = RecordResultStage().execute(context)
            context.failover_result = FailoverResult(
                eligible=True,
                attempted=False,
                selected_provider=None,
                succeeded=False,
                exhausted=True,
                reason="failover_chain_blocked",
                final_execution_state=context.execution_state,
            )
            emit_observability_event(
                context,
                "failover_evaluated",
                payload={"eligible": True, "attempted": False, "reason": "failover_chain_blocked"},
            )
            return context

        selected_provider = self.candidate_selector(context)
        if not selected_provider:
            context.retryable = False
            context.error_message = context.error_message or "No failover provider candidate available"
            context.result_status = None
            context.execution_outcome = None
            context = RecordResultStage().execute(context)
            context.failover_result = FailoverResult(
                eligible=True,
                attempted=False,
                selected_provider=None,
                succeeded=False,
                exhausted=True,
                reason="no_candidate_available",
                final_execution_state=context.execution_state,
            )
            emit_observability_event(
                context,
                "failover_evaluated",
                payload={"eligible": True, "attempted": False, "reason": "no_candidate_available"},
            )
            return context

        emit_observability_event(
            context,
            "failover_evaluated",
            payload={"eligible": True, "attempted": True, "selected_provider": selected_provider},
        )

        context.metadata["failover_depth"] = failover_depth + 1
        attempted_providers = list(context.metadata.get("failover_attempted_providers", []))
        attempted_providers.append(selected_provider)
        context.metadata["failover_attempted_providers"] = attempted_providers

        context.provider_name = selected_provider
        context.result_status = None
        context.execution_outcome = None
        context.retry_decision = None
        context = self.executor(context, selected_provider)

        if context.execution_state != "succeeded":
            context.retryable = False
            if not context.error_message:
                context.error_message = "Failover dispatch did not succeed"

        context = RecordResultStage().execute(context)
        context.failover_result = FailoverResult(
            eligible=True,
            attempted=True,
            selected_provider=selected_provider,
            succeeded=context.execution_state == "succeeded",
            exhausted=context.execution_state != "succeeded",
            reason=None if context.execution_state == "succeeded" else "alternate_dispatch_failed",
            final_execution_state=context.execution_state,
        )
        emit_observability_event(
            context,
            "failover_executed",
            payload={
                "selected_provider": selected_provider,
                "succeeded": context.execution_state == "succeeded",
                "final_execution_state": context.execution_state,
            },
        )
        return context


class RegistryProviderCandidateSelector(ProviderCandidateSelector):
    def __init__(self, providers: Iterable[str]):
        self.providers = tuple(providers)

    def select_for_context(self, context: ExecutionContext) -> str | None:
        failover_context = FailoverExecutionContext(
            execution_id=context.execution_id,
            current_provider=context.provider_name,
            retry_exhausted=bool(context.retry_execution_result and context.retry_execution_result.exhausted),
            candidate_providers=self.providers,
            metadata=context.metadata,
        )

        attempted_providers = {
            (provider or "").strip().lower()
            for provider in context.metadata.get("failover_attempted_providers", [])
            if isinstance(provider, str)
        }

        selected = super().select(failover_context)
        if not selected:
            return None
        if selected in attempted_providers:
            return None
        return selected
