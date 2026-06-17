import unittest

from api.services.execution_pipeline import ExecutionContext, PipelineResultStatus, PipelineStageError
from api.services.circuit_breaker import ProviderHealthTracker
from api.services.execution_outcomes import ExecutionOutcome
from api.services.execution_pipeline_stages import (
    CircuitBreakerStage,
    DispatchExecutionStage,
    FailoverDecisionStage,
    RecordResultStage,
    ResolveProviderStage,
    RetryExecutionStage,
    RetryDecisionStage,
    ValidateExecutionStage,
)
from api.services.retry_decision import RetryDecision


class ExecutionPipelineStageTests(unittest.TestCase):
    def test_validate_execution_stage_accepts_valid_context(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        stage = ValidateExecutionStage(required_fields=("execution_id",))

        result = stage.execute(context)

        self.assertEqual(result.execution_id, "exec-1")

    def test_validate_execution_stage_rejects_invalid_context(self) -> None:
        context = ExecutionContext(execution_id=None)
        stage = ValidateExecutionStage(required_fields=("execution_id",))

        with self.assertRaises(PipelineStageError):
            stage.execute(context)

    def test_resolve_provider_stage_provider_found(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        stage = ResolveProviderStage(resolver=lambda _: "email.noop")

        result = stage.execute(context)

        self.assertEqual(result.provider_name, "email.noop")

    def test_resolve_provider_stage_provider_not_found(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        stage = ResolveProviderStage(resolver=lambda _: "")

        with self.assertRaises(PipelineStageError):
            stage.execute(context)

    def test_dispatch_execution_stage_success(self) -> None:
        context = ExecutionContext(execution_id="exec-1")

        def _dispatch(ctx: ExecutionContext) -> ExecutionContext:
            ctx.metadata["dispatched"] = True
            return ctx

        stage = DispatchExecutionStage(dispatcher=_dispatch)
        result = stage.execute(context)

        self.assertTrue(result.metadata["dispatched"])

    def test_dispatch_execution_stage_transport_failure(self) -> None:
        context = ExecutionContext(execution_id="exec-1")

        def _dispatch(_: ExecutionContext) -> ExecutionContext:
            raise RuntimeError("transport failure")

        stage = DispatchExecutionStage(dispatcher=_dispatch)

        with self.assertRaises(RuntimeError):
            stage.execute(context)

    def test_circuit_breaker_stage_suppresses_when_open(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=1, recovery_after_suppressions=2)
        tracker.record_result(provider_name="email.noop", succeeded=False)

        context = ExecutionContext(execution_id="exec-1", provider_name="email.noop")

        def _dispatch(_: ExecutionContext) -> ExecutionContext:
            raise AssertionError("dispatch should be suppressed when circuit is open")

        result = CircuitBreakerStage(dispatcher=_dispatch, tracker=tracker).execute(context)

        self.assertEqual(result.execution_state, "suppressed_open_circuit")
        self.assertTrue(result.retryable)
        self.assertEqual(result.metadata.get("circuit_state"), "open")

    def test_circuit_breaker_stage_allows_recovery_dispatch(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=1, recovery_after_suppressions=2)
        tracker.record_result(provider_name="email.noop", succeeded=False)

        context = ExecutionContext(execution_id="exec-1", provider_name="email.noop")

        def _dispatch(ctx: ExecutionContext) -> ExecutionContext:
            ctx.execution_state = "succeeded"
            ctx.error_message = None
            ctx.retryable = False
            return ctx

        stage = CircuitBreakerStage(dispatcher=_dispatch, tracker=tracker)
        stage.execute(context)  # First evaluation is suppressed while open.
        result = stage.execute(context)

        self.assertEqual(result.execution_state, "succeeded")
        self.assertEqual(result.metadata.get("circuit_state"), "closed")

    def test_record_result_stage_success_normalization(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        stage = RecordResultStage()

        result = stage.execute(context)

        self.assertEqual(result.execution_outcome, ExecutionOutcome.SUCCESS)
        self.assertEqual(result.result_status, PipelineResultStatus.SUCCESS)

    def test_record_result_stage_failure_normalization(self) -> None:
        context = ExecutionContext(execution_id="exec-1", error_message="failed")
        stage = RecordResultStage()

        result = stage.execute(context)

        self.assertEqual(result.execution_outcome, ExecutionOutcome.PERMANENT_FAILURE)
        self.assertEqual(result.result_status, PipelineResultStatus.FAILED)

    def test_record_result_stage_retryable_normalization(self) -> None:
        context = ExecutionContext(execution_id="exec-1", error_message="temporary", retryable=True)
        stage = RecordResultStage()

        result = stage.execute(context)

        self.assertEqual(result.execution_outcome, ExecutionOutcome.RETRYABLE_FAILURE)
        self.assertEqual(result.result_status, PipelineResultStatus.RETRYABLE_FAILURE)

    def test_record_result_stage_skipped_normalization(self) -> None:
        context = ExecutionContext(execution_id="exec-1", skipped=True)
        stage = RecordResultStage()

        result = stage.execute(context)

        self.assertEqual(result.execution_outcome, ExecutionOutcome.SKIPPED)
        self.assertEqual(result.result_status, PipelineResultStatus.SKIPPED)

    def test_retry_decision_stage_recommends_retry_for_retryable_failure(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            execution_outcome=ExecutionOutcome.RETRYABLE_FAILURE,
        )
        stage = RetryDecisionStage()

        result = stage.execute(context)

        self.assertIsNotNone(result.retry_decision)
        self.assertEqual(result.retry_decision.decision, RetryDecision.SHOULD_RETRY)
        self.assertTrue(result.retry_decision.should_retry)

    def test_retry_decision_stage_rejects_permanent_failure(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            execution_outcome=ExecutionOutcome.PERMANENT_FAILURE,
        )
        stage = RetryDecisionStage()

        result = stage.execute(context)

        self.assertIsNotNone(result.retry_decision)
        self.assertEqual(result.retry_decision.decision, RetryDecision.SHOULD_NOT_RETRY)
        self.assertFalse(result.retry_decision.should_retry)

    def test_retry_execution_stage_executes_retry_until_success(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            execution_outcome=ExecutionOutcome.RETRYABLE_FAILURE,
            retryable=True,
            error_message="temporary",
            execution_state="retry_scheduled",
            metadata={"attempt_count": 1, "max_attempts": 3},
        )

        def _executor(ctx: ExecutionContext) -> ExecutionContext:
            ctx.execution_state = "succeeded"
            ctx.retryable = False
            ctx.error_message = None
            ctx.metadata["attempt_count"] = 2
            return ctx

        context = RetryDecisionStage().execute(context)
        result = RetryExecutionStage(executor=_executor).execute(context)

        self.assertIsNotNone(result.retry_execution_result)
        self.assertTrue(result.retry_execution_result.executed)
        self.assertEqual(result.retry_execution_result.attempts_executed, 1)
        self.assertFalse(result.retry_execution_result.exhausted)
        self.assertEqual(result.execution_outcome, ExecutionOutcome.SUCCESS)
        self.assertEqual(result.retry_decision.decision, RetryDecision.SHOULD_NOT_RETRY)

    def test_retry_execution_stage_marks_exhaustion_without_retry(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            execution_outcome=ExecutionOutcome.RETRYABLE_FAILURE,
            retryable=True,
            error_message="temporary",
            execution_state="retry_scheduled",
            metadata={"attempt_count": 3, "max_attempts": 3},
        )

        def _executor(ctx: ExecutionContext) -> ExecutionContext:
            raise AssertionError("executor should not run when attempts are exhausted")

        context = RetryDecisionStage().execute(context)
        result = RetryExecutionStage(executor=_executor).execute(context)

        self.assertIsNotNone(result.retry_execution_result)
        self.assertFalse(result.retry_execution_result.executed)
        self.assertEqual(result.retry_execution_result.attempts_executed, 0)
        self.assertTrue(result.retry_execution_result.exhausted)

    def test_failover_decision_stage_dispatches_alternate_provider_after_retry_exhaustion(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            provider_name="email.noop",
            execution_state="retry_scheduled",
            retryable=True,
            error_message="temporary",
            metadata={"attempt_count": 3, "max_attempts": 3},
        )
        context = RecordResultStage().execute(context)
        context = RetryDecisionStage().execute(context)

        def _executor(ctx: ExecutionContext, provider_name: str) -> ExecutionContext:
            self.assertEqual(provider_name, "email.smtp")
            ctx.provider_name = provider_name
            ctx.execution_state = "succeeded"
            ctx.retryable = False
            ctx.error_message = None
            return ctx

        context = RetryExecutionStage(executor=lambda c: c).execute(context)
        result = FailoverDecisionStage(
            candidate_selector=lambda _: "email.smtp",
            executor=_executor,
        ).execute(context)

        self.assertIsNotNone(result.failover_result)
        self.assertTrue(result.failover_result.attempted)
        self.assertTrue(result.failover_result.succeeded)
        self.assertEqual(result.failover_result.selected_provider, "email.smtp")
        self.assertEqual(result.execution_outcome, ExecutionOutcome.SUCCESS)

    def test_failover_decision_stage_sets_exhausted_when_no_candidate(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            provider_name="email.noop",
            execution_state="retry_scheduled",
            retryable=True,
            error_message="temporary",
            metadata={"attempt_count": 3, "max_attempts": 3},
        )
        context = RecordResultStage().execute(context)
        context = RetryDecisionStage().execute(context)
        context = RetryExecutionStage(executor=lambda c: c).execute(context)

        result = FailoverDecisionStage(
            candidate_selector=lambda _: None,
            executor=lambda c, _: c,
        ).execute(context)

        self.assertIsNotNone(result.failover_result)
        self.assertTrue(result.failover_result.eligible)
        self.assertFalse(result.failover_result.attempted)
        self.assertTrue(result.failover_result.exhausted)
        self.assertEqual(result.failover_result.reason, "no_candidate_available")
        self.assertEqual(result.result_status, PipelineResultStatus.FAILED)
        self.assertEqual(result.execution_outcome, ExecutionOutcome.PERMANENT_FAILURE)


if __name__ == "__main__":
    unittest.main()
