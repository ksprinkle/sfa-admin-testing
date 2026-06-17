import unittest

from api.services.execution_pipeline import ExecutionContext, PipelineResultStatus, PipelineStageError
from api.services.execution_outcomes import ExecutionOutcome
from api.services.execution_pipeline_stages import (
    DispatchExecutionStage,
    RecordResultStage,
    ResolveProviderStage,
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


if __name__ == "__main__":
    unittest.main()
