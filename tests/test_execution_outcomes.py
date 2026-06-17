import unittest

from api.services.execution_outcomes import ExecutionOutcome, OutcomeClassifier


class OutcomeClassifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.classifier = OutcomeClassifier()

    def test_classifies_success(self) -> None:
        outcome = self.classifier.classify(skipped=False, error_message=None, retryable=False)
        self.assertEqual(outcome, ExecutionOutcome.SUCCESS)

    def test_classifies_retryable_failure(self) -> None:
        outcome = self.classifier.classify(
            skipped=False,
            error_message="temporary transport issue",
            retryable=True,
        )
        self.assertEqual(outcome, ExecutionOutcome.RETRYABLE_FAILURE)

    def test_classifies_permanent_failure(self) -> None:
        outcome = self.classifier.classify(
            skipped=False,
            error_message="invalid request",
            retryable=False,
        )
        self.assertEqual(outcome, ExecutionOutcome.PERMANENT_FAILURE)

    def test_classifies_skipped(self) -> None:
        outcome = self.classifier.classify(
            skipped=True,
            error_message="disabled",
            retryable=False,
        )
        self.assertEqual(outcome, ExecutionOutcome.SKIPPED)

    def test_classifies_timeout_exception_as_retryable(self) -> None:
        outcome = self.classifier.classify_exception(TimeoutError("timed out"))
        self.assertEqual(outcome, ExecutionOutcome.RETRYABLE_FAILURE)

    def test_classifies_validation_exception_as_permanent(self) -> None:
        outcome = self.classifier.classify_exception(ValueError("invalid"))
        self.assertEqual(outcome, ExecutionOutcome.PERMANENT_FAILURE)


if __name__ == "__main__":
    unittest.main()
