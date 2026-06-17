import unittest

from api.services.circuit_breaker import (
    CircuitEvaluationContext,
    CircuitState,
    ProviderHealthTracker,
)


class CircuitBreakerTests(unittest.TestCase):
    def test_circuit_opens_after_failure_threshold(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=2, recovery_after_suppressions=2)

        state_1 = tracker.record_result(provider_name="email.noop", succeeded=False)
        state_2 = tracker.record_result(provider_name="email.noop", succeeded=False)

        self.assertEqual(state_1, CircuitState.CLOSED)
        self.assertEqual(state_2, CircuitState.OPEN)

    def test_open_circuit_suppresses_dispatch(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=1, recovery_after_suppressions=2)
        tracker.record_result(provider_name="email.noop", succeeded=False)

        decision = tracker.evaluate(CircuitEvaluationContext(provider_name="email.noop"))

        self.assertFalse(decision.dispatch_allowed)
        self.assertEqual(decision.state, CircuitState.OPEN)
        self.assertEqual(decision.reason, "circuit_open")

    def test_recovery_evaluation_closes_circuit_and_allows_dispatch(self) -> None:
        tracker = ProviderHealthTracker(failure_threshold=1, recovery_after_suppressions=2)
        tracker.record_result(provider_name="email.noop", succeeded=False)

        first = tracker.evaluate(CircuitEvaluationContext(provider_name="email.noop"))
        second = tracker.evaluate(CircuitEvaluationContext(provider_name="email.noop"))

        self.assertFalse(first.dispatch_allowed)
        self.assertEqual(first.state, CircuitState.OPEN)
        self.assertTrue(second.dispatch_allowed)
        self.assertEqual(second.state, CircuitState.CLOSED)
        self.assertEqual(second.reason, "recovery_evaluation_passed")


if __name__ == "__main__":
    unittest.main()