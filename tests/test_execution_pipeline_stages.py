import unittest

from api.services.execution_pipeline import ExecutionContext, PipelineResultStatus, PipelineStageError
from api.services.execution_pipeline_stages import (
    DispatchExecutionStage,
    RecordResultStage,
    ResolveProviderStage,
    ValidateExecutionStage,
)


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

        self.assertEqual(result.result_status, PipelineResultStatus.SUCCESS)

    def test_record_result_stage_failure_normalization(self) -> None:
        context = ExecutionContext(execution_id="exec-1", error_message="failed")
        stage = RecordResultStage()

        result = stage.execute(context)

        self.assertEqual(result.result_status, PipelineResultStatus.FAILED)


if __name__ == "__main__":
    unittest.main()
