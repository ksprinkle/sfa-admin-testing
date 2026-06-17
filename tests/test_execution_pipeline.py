import unittest

from api.services.execution_pipeline import (
    ExecutionContext,
    ExecutionPipeline,
    PipelineResultStatus,
    PipelineStage,
    PipelineStageError,
)


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


if __name__ == "__main__":
    unittest.main()
