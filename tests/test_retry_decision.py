import unittest

from api.services.execution_outcomes import ExecutionOutcome
from api.services.retry_decision import (
    DefaultRetryStrategyAdapter,
    RetryDecision,
    RetryEvaluationContext,
)


class RetryDecisionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.strategy = DefaultRetryStrategyAdapter()

    def test_recommends_retry_for_retryable_failure(self) -> None:
        context = RetryEvaluationContext(execution_outcome=ExecutionOutcome.RETRYABLE_FAILURE)

        result = self.strategy.evaluate(context)

        self.assertEqual(result.decision, RetryDecision.SHOULD_RETRY)
        self.assertTrue(result.should_retry)
        self.assertEqual(result.reason, "retryable_failure")

    def test_does_not_recommend_retry_for_permanent_failure(self) -> None:
        context = RetryEvaluationContext(execution_outcome=ExecutionOutcome.PERMANENT_FAILURE)

        result = self.strategy.evaluate(context)

        self.assertEqual(result.decision, RetryDecision.SHOULD_NOT_RETRY)
        self.assertFalse(result.should_retry)
        self.assertEqual(result.reason, "permanent_failure")

    def test_does_not_recommend_retry_for_skipped(self) -> None:
        context = RetryEvaluationContext(execution_outcome=ExecutionOutcome.SKIPPED)

        result = self.strategy.evaluate(context)

        self.assertEqual(result.decision, RetryDecision.SHOULD_NOT_RETRY)
        self.assertEqual(result.reason, "skipped_execution")
