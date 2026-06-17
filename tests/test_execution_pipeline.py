import unittest

from api.services.execution_pipeline import (
    ExecutionContext,
    ExecutionPipeline,
    PipelineResultStatus,
    PipelineStage,
    PipelineStageError,
)
from api.services.circuit_breaker import ProviderHealthTracker
from api.services.execution_outcomes import ExecutionOutcome
from api.services.execution_pipeline_stages import CircuitBreakerStage, RecordResultStage, RetryDecisionStage
from api.services.execution_pipeline_stages import FailoverDecisionStage, RetryExecutionStage
from api.services.retry_decision import RetryDecision


class _NamedStage(PipelineStage):
    def __init__(self, name: str, fail: bool = False):
        self.name = name
        self.fail = fail

    def execute(self, context: ExecutionContext) -> ExecutionContext:
        order = context.metadata.setdefault("order", [])
        order.append(self.name)
        if self.fail:
            raise PipelineStageError("stage failed", status=PipelineResultStatus.FAILED)
        context.metadata[self.name] = True
        return context


class ExecutionPipelineTests(unittest.TestCase):
    def test_executes_stages_in_order(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        pipeline = ExecutionPipeline([
            _NamedStage("stage1"),
            _NamedStage("stage2"),
            _NamedStage("stage3"),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.SUCCESS)
        self.assertEqual(result.context.metadata["order"], ["stage1", "stage2", "stage3"])

    def test_stops_on_failure(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        pipeline = ExecutionPipeline([
            _NamedStage("stage1"),
            _NamedStage("stage2", fail=True),
            _NamedStage("stage3"),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.FAILED)
        self.assertEqual(result.context.metadata["order"], ["stage1", "stage2"])

    def test_context_mutation_is_preserved(self) -> None:
        context = ExecutionContext(execution_id="exec-1")
        pipeline = ExecutionPipeline([_NamedStage("stage1")])

        result = pipeline.execute(context)

        self.assertTrue(result.context.metadata["stage1"])

    def test_result_status_mapping(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            error_message="retry later",
            retryable=True,
        )
        pipeline = ExecutionPipeline([])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.RETRYABLE_FAILURE)

    def test_outcome_mapping_success(self) -> None:
        context = ExecutionContext(execution_id="exec-1", execution_outcome=ExecutionOutcome.SUCCESS)
        pipeline = ExecutionPipeline([])
        result = pipeline.execute(context)
        self.assertEqual(result.status, PipelineResultStatus.SUCCESS)

    def test_outcome_mapping_retryable_failure(self) -> None:
        context = ExecutionContext(execution_id="exec-1", execution_outcome=ExecutionOutcome.RETRYABLE_FAILURE)
        pipeline = ExecutionPipeline([])
        result = pipeline.execute(context)
        self.assertEqual(result.status, PipelineResultStatus.RETRYABLE_FAILURE)

    def test_outcome_mapping_permanent_failure(self) -> None:
        context = ExecutionContext(execution_id="exec-1", execution_outcome=ExecutionOutcome.PERMANENT_FAILURE)
        pipeline = ExecutionPipeline([])
        result = pipeline.execute(context)
        self.assertEqual(result.status, PipelineResultStatus.FAILED)

    def test_outcome_mapping_skipped(self) -> None:
        context = ExecutionContext(execution_id="exec-1", execution_outcome=ExecutionOutcome.SKIPPED)
        pipeline = ExecutionPipeline([])
        result = pipeline.execute(context)
        self.assertEqual(result.status, PipelineResultStatus.SKIPPED)

    def test_pipeline_sets_retry_decision_for_retryable_failure(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            error_message="retry later",
            retryable=True,
        )
        pipeline = ExecutionPipeline([RecordResultStage(), RetryDecisionStage()])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.RETRYABLE_FAILURE)
        self.assertIsNotNone(result.retry_decision)
        self.assertEqual(result.retry_decision.decision, RetryDecision.SHOULD_RETRY)
        self.assertTrue(result.retry_decision.should_retry)

    def test_pipeline_does_not_recommend_retry_for_permanent_failure(self) -> None:
        context = ExecutionContext(execution_id="exec-1", error_message="invalid", retryable=False)
        pipeline = ExecutionPipeline([RecordResultStage(), RetryDecisionStage()])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.FAILED)
        self.assertIsNotNone(result.retry_decision)
        self.assertEqual(result.retry_decision.decision, RetryDecision.SHOULD_NOT_RETRY)
        self.assertFalse(result.retry_decision.should_retry)

    def test_pipeline_executes_retry_and_finishes_success(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            error_message="retry later",
            retryable=True,
            execution_state="retry_scheduled",
            metadata={"attempt_count": 1, "max_attempts": 3},
        )

        def _retry_executor(ctx: ExecutionContext) -> ExecutionContext:
            ctx.retryable = False
            ctx.error_message = None
            ctx.execution_state = "succeeded"
            ctx.metadata["attempt_count"] = 2
            return ctx

        pipeline = ExecutionPipeline([
            RecordResultStage(),
            RetryDecisionStage(),
            RetryExecutionStage(executor=_retry_executor),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.SUCCESS)
        self.assertIsNotNone(result.retry_execution_result)
        self.assertTrue(result.retry_execution_result.executed)
        self.assertFalse(result.retry_execution_result.exhausted)

    def test_pipeline_executes_failover_after_retry_exhaustion(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            provider_name="email.noop",
            error_message="retry later",
            retryable=True,
            execution_state="retry_scheduled",
            metadata={"attempt_count": 3, "max_attempts": 3},
        )

        def _failover_executor(ctx: ExecutionContext, provider_name: str) -> ExecutionContext:
            self.assertEqual(provider_name, "email.smtp")
            ctx.provider_name = provider_name
            ctx.retryable = False
            ctx.error_message = None
            ctx.execution_state = "succeeded"
            return ctx

        pipeline = ExecutionPipeline([
            RecordResultStage(),
            RetryDecisionStage(),
            RetryExecutionStage(executor=lambda c: c),
            FailoverDecisionStage(
                candidate_selector=lambda _: "email.smtp",
                executor=_failover_executor,
            ),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.SUCCESS)
        self.assertIsNotNone(result.retry_execution_result)
        self.assertTrue(result.retry_execution_result.exhausted)
        self.assertIsNotNone(result.failover_result)
        self.assertTrue(result.failover_result.attempted)
        self.assertTrue(result.failover_result.succeeded)
        self.assertEqual(result.context.provider_name, "email.smtp")

    def test_pipeline_fails_when_no_failover_candidate_is_available(self) -> None:
        context = ExecutionContext(
            execution_id="exec-1",
            provider_name="email.noop",
            error_message="retry later",
            retryable=True,
            execution_state="retry_scheduled",
            metadata={"attempt_count": 3, "max_attempts": 3},
        )

        pipeline = ExecutionPipeline([
            RecordResultStage(),
            RetryDecisionStage(),
            RetryExecutionStage(executor=lambda c: c),
            FailoverDecisionStage(
                candidate_selector=lambda _: None,
                executor=lambda c, _: c,
            ),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.FAILED)
        self.assertIsNotNone(result.failover_result)
        self.assertTrue(result.failover_result.eligible)
        self.assertFalse(result.failover_result.attempted)
        self.assertTrue(result.failover_result.exhausted)
        self.assertEqual(result.failover_result.reason, "no_candidate_available")

    def test_pipeline_suppresses_dispatch_for_open_circuit(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=1, recovery_after_suppressions=2)
        tracker.record_result(provider_name="email.noop", succeeded=False)

        context = ExecutionContext(execution_id="exec-1", provider_name="email.noop")

        pipeline = ExecutionPipeline([
            CircuitBreakerStage(dispatcher=lambda c: c, tracker=tracker),
            RecordResultStage(),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.RETRYABLE_FAILURE)
        self.assertIsNotNone(result.circuit_decision)
        self.assertFalse(result.circuit_decision.dispatch_allowed)
        self.assertEqual(result.context.execution_state, "suppressed_open_circuit")

    def test_pipeline_allows_failover_when_primary_circuit_is_open(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=1, recovery_after_suppressions=2)
        tracker.record_result(provider_name="email.noop", succeeded=False)

        context = ExecutionContext(
            execution_id="exec-1",
            provider_name="email.noop",
            metadata={"attempt_count": 0, "max_attempts": 0},
        )

        def _dispatcher(ctx: ExecutionContext) -> ExecutionContext:
            if ctx.provider_name == "email.smtp":
                ctx.execution_state = "succeeded"
                ctx.error_message = None
                ctx.retryable = False
                return ctx
            raise AssertionError("primary provider dispatch should be suppressed")

        def _failover_executor(ctx: ExecutionContext, provider_name: str) -> ExecutionContext:
            ctx.provider_name = provider_name
            return _dispatcher(ctx)

        pipeline = ExecutionPipeline([
            CircuitBreakerStage(dispatcher=_dispatcher, tracker=tracker),
            RecordResultStage(),
            RetryDecisionStage(),
            RetryExecutionStage(executor=lambda c: c),
            FailoverDecisionStage(
                candidate_selector=lambda _: "email.smtp",
                executor=_failover_executor,
            ),
        ])

        result = pipeline.execute(context)

        self.assertEqual(result.status, PipelineResultStatus.SUCCESS)
        self.assertIsNotNone(result.failover_result)
        self.assertTrue(result.failover_result.attempted)
        self.assertTrue(result.failover_result.succeeded)


if __name__ == "__main__":
    unittest.main()
