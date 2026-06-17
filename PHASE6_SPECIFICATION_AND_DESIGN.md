# PWA 31 Phase 6 Specification and Design Document

## Document Information
- Phase: 6
- Status: Draft - Implementation Specification
- Baseline Reference: `v1.10.0-phase5.9-async-dispatch-architecture`
- Baseline Commit: `8c84f11fbe5734b5673fd49325c9ce856abb6e89`

---

## 1. Purpose
Phase 6 transitions the project from establishing the asynchronous dispatch architectural boundary to implementing modular, production-ready capabilities that operate within that architecture.

The primary objective is to introduce new functionality through incremental changes while preserving the stability and governance established in Phase 5.9.

---

## 2. Design Principles
Phase 6 shall adhere to the following principles:

- Incremental implementation
- Backward compatibility with the Phase 5.9 baseline
- Clear separation of concerns
- Minimal coupling between components
- Testability
- Extensibility
- Reversible changes where practical

No implementation should require unnecessary modification of previously stabilized architecture.

---

## 3. Architectural Goals
The architecture should support:

- Independent dispatch execution
- Modular service boundaries
- Configurable execution policies
- Observable execution lifecycle
- Future scalability
- Improved fault isolation

---

## 4. Phase 6 Increment Strategy
Implementation will proceed through sequential architectural increments.

Each increment shall include:

- Objective
- Scope
- Dependencies
- Design
- Implementation
- Validation
- Closeout

No subsequent increment should begin until the current increment has been reviewed and validated.

---

## 5. Increment 1 - Execution Pipeline Foundation

### Objective
Create the foundational execution pipeline that coordinates asynchronous dispatch operations through well-defined interfaces.

### Scope
Included:

- Execution coordinator
- Pipeline abstraction
- Stage interface definitions
- Execution context model
- Error propagation strategy

Excluded:

- UI enhancements
- Storage redesign
- Analytics features
- External integrations
- Performance optimizations beyond correctness

---

## 6. Functional Requirements
The execution pipeline shall:

1. Accept a dispatch request.
2. Validate required inputs.
3. Construct an execution context.
4. Execute defined stages in order.
5. Capture execution status.
6. Return standardized results.
7. Handle failures consistently.

---

## 7. Non-Functional Requirements
The implementation should provide:

- Deterministic execution
- Clear logging boundaries
- Maintainable interfaces
- Low coupling
- High cohesion
- Unit-testable components

---

## 8. Dependency Analysis
Depends on:

- Phase 5.9 asynchronous dispatch architecture
- Existing dispatch interfaces
- Existing project governance

Does not depend on:

- Future analytics modules
- Future administrative tooling
- Future reporting systems

---

## 9. Risks
Potential risks include:

- Interface drift
- Hidden coupling
- Duplicate execution paths
- Inconsistent error handling

Mitigation:

- Small incremental changes
- Interface documentation
- Validation after each increment

---

## 10. Acceptance Criteria
Increment 1 is complete when:

- Execution pipeline is defined.
- Component responsibilities are documented.
- Interfaces are established.
- Validation strategy is documented.
- Architecture remains compatible with the Phase 5.9 baseline.

---

## 11. Increment 3 - Retry Strategy Pipeline Integration

### Status
Design review packet drafted. Implementation not authorized.

### Candidate Selected
Retry Strategy Pipeline Integration

### Objective
Integrate retry decision-making into the execution pipeline while preserving the established execution pipeline boundary, normalized outcome model, provider abstraction, provider registry behavior, and asynchronous dispatch boundary.

### Dependency Verification
Confirmed dependencies:

- Execution Pipeline Foundation: complete
- Execution Outcome Classification: complete
- Retry Strategy Abstraction: complete
- Provider Abstraction: complete

Dependency interpretation:

- Increment 1 provides the execution orchestration boundary.
- Increment 2 provides normalized outcome semantics, including `RETRYABLE_FAILURE`.
- Phase 5 retry abstractions remain the policy source but are not yet executed by the pipeline.
- Provider resolution and async dispatch remain external boundaries to the retry decision layer.

### Architectural Intent
Expected architecture before Increment 3:

```text
ExecutionPipeline
	↓
Outcome Classification
	↓
Pipeline Result
```

Candidate architecture after Increment 3:

```text
ExecutionPipeline
	↓
Outcome Classification
	↓
Retry Decision Stage
	↓
Pipeline Result
```

The retry decision layer should evaluate whether an execution is retryable without performing retries, scheduling workers, or altering provider execution behavior.

### Proposed Components
The following components should be evaluated for the design packet:

- `RetryDecisionStage`
- `RetryDecisionResult`
- `RetryEvaluationContext`
- `RetryStrategy integration adapter`

Component intent:

- `RetryDecisionStage` should consume normalized execution outcomes and derive a deterministic retry decision.
- `RetryDecisionResult` should represent the decision outcome without initiating execution loops.
- `RetryEvaluationContext` should carry the minimum state needed to decide retryability.
- `RetryStrategy integration adapter` should bridge existing retry policy abstractions into the pipeline boundary without rewriting the policy layer.

### Non-Goals
Explicitly out of scope for Increment 3:

- No retry loops
- No provider failover
- No circuit breakers
- No workers
- No queue processing changes
- No persistence changes
- No metrics
- No observability expansion

### Acceptance Criteria
Increment 3 design review should be considered ready only if the packet can demonstrate:

- Retryability evaluation occurs at the pipeline boundary.
- Retry decisions are deterministic for the same normalized outcome/context.
- Provider contracts remain unchanged.
- Public execution APIs remain unchanged.
- The retry strategy boundary remains policy-driven rather than execution-driven.
- The design can be validated without introducing queue, worker, or failover semantics.

### Risk Analysis
Primary risks for the proposed increment:

- Architectural risk: retry decision logic could drift into execution-policy ownership or provider selection if the boundary is underspecified.
- Regression risk: changes to pipeline result normalization may alter behavior for non-retryable outcomes if mapping rules are broadened too early.
- Dependency readiness: the candidate depends on stable outcome classification and existing retry abstractions being sufficiently expressive for deterministic decisions.
- Future extensibility impact: this increment should improve the path to future retry execution and failover, but only if the decision layer remains provider-agnostic.

### Design Review Notes
This packet intentionally stops short of implementation authorization.

Implementation boundaries remain blocked until:

1. The design-review packet is reviewed.
2. Scope boundaries are approved.
3. Implementation authorization is explicitly granted.

## 12. Increment 3 Implementation Planning

### Status
Design review approved. Implementation planning review approved. Authorization not granted.

### Planning Objective
Prepare an exact, file-bounded implementation plan for Retry Strategy Pipeline Integration without changing code or broadening scope.

### Implementation Planning Scope
The implementation plan should enumerate the minimum files and behavioral changes required to support retry decisioning at the pipeline boundary.

Likely implementation touchpoints to evaluate:

- `api/services/execution_pipeline.py`
- `api/services/execution_pipeline_stages.py`
- `api/services/reminder_execution.py`
- `tests/test_execution_pipeline.py`
- `tests/test_execution_pipeline_stages.py`

The planning packet should confirm whether any new helper module is required or whether existing abstractions are sufficient.

### Planned Behavioral Changes
The implementation plan should define how the retry decision layer will:

- consume normalized execution outcomes
- produce deterministic retry decisions
- preserve provider contracts and provider registry behavior
- preserve public execution APIs
- remain policy-driven rather than execution-driven

### Retry Decision Mapping Definitions
The implementation plan should specify the deterministic mapping from normalized outcomes to retry decision states.

At minimum, the mapping should address:

- `SUCCESS` -> no retry decision
- `SKIPPED` -> no retry decision
- `PERMANENT_FAILURE` -> no retry decision
- `RETRYABLE_FAILURE` -> retry-eligible decision state

If the design requires additional context-sensitive distinctions, they must remain within the decision layer and must not trigger retry execution.

### Test Matrix Definition
The implementation plan should include tests for:

- success path remains unchanged
- skipped path remains unchanged
- permanent failure remains non-retryable
- retryable failure produces a retry-eligible decision
- deterministic results for repeated evaluation of the same context
- provider contracts remain unchanged
- public API compatibility remains unchanged

### Regression Validation Plan
The implementation plan should require validation for:

- existing pipeline tests
- existing stage tests
- retry decision unit coverage
- baseline smoke behavior for execution pipeline context mutation
- diagnostics on modified files

### Authorization Review Gate
The implementation planning packet does not authorize code changes.

Implementation may begin only after:

1. The implementation planning packet is reviewed.
2. The file-by-file implementation plan is approved.
3. The retry decision mapping is approved.
4. The test matrix is approved.
5. Explicit implementation authorization is granted.

### Planning Review Decision
Status: Approved

Review outcome:

- File-by-file implementation plan approved.
- Retry decision mappings approved.
- Test matrix approved.
- Regression validation plan approved.

Next gate:

- Increment 3 Implementation Authorization Review
- Implementation remains blocked until authorization is granted.

### Implementation Authorization Decision
Status: Approved

Authorization scope:

- Retry decision evaluation only
- Retry strategy integration at pipeline boundary
- Deterministic retry recommendation generation

Explicitly unauthorized during Increment 3:

- retry execution loops
- provider failover
- circuit breakers
- queue/worker or scheduling changes
- persistence/schema changes
- metrics/observability expansion

### Increment 3 Closeout
Status: Closed

Implementation summary:

- Introduced retry decision boundary and adapter abstraction.
- Integrated retry decision stage into pipeline flow after outcome classification.
- Preserved provider contracts, provider registry behavior, and public execution APIs.

Validation summary:

- `RETRYABLE_FAILURE` yields retry recommendation.
- `PERMANENT_FAILURE` yields no retry recommendation.
- `python -m unittest tests.test_retry_decision tests.test_execution_pipeline tests.test_execution_pipeline_stages tests.test_execution_outcomes` -> 31 tests, OK.

Next gate:

- Increment 4 Design Review (pending)

## 13. Increment 4 - Retry Execution Orchestration

### Status
Design review packet drafted. Implementation not authorized.

### Candidate Selected
Retry Execution Orchestration

### Objective
Define how retry execution is orchestrated after retry recommendations are generated, while preserving existing execution pipeline boundaries, retry strategy ownership, provider abstraction boundaries, provider registry behavior, and public execution entry points.

Expected transition:

```text
ExecutionOutcome
	↓
Retry Decision
	↓
Retry Execution
```

### Dependency Verification
Confirmed dependencies:

- Execution Pipeline Foundation: complete
- Execution Outcome Classification: complete
- Retry Decision Integration: complete
- Retry Strategy Abstraction: complete
- Provider Abstraction: complete

Dependency interpretation:

- Increment 1 provides orchestration boundaries.
- Increment 2 provides normalized outcome semantics.
- Increment 3 provides deterministic retry recommendations.
- Existing retry abstractions remain authoritative for retry policy.

### Architectural Intent
Current architecture:

```text
ExecutionPipeline
	↓
Outcome Classification
	↓
Retry Decision
	↓
Pipeline Result
```

Candidate architecture:

```text
ExecutionPipeline
	↓
Outcome Classification
	↓
Retry Decision
	↓
Retry Execution
	↓
Pipeline Result
```

### Proposed Components
The design review evaluates responsibilities and boundaries for:

- `RetryExecutionStage`
- `RetryExecutionResult`
- `RetryAttemptTracker`
- `RetryExecutionContext`

Boundary intent:

- `RetryExecutionStage` orchestrates retry attempts based on prior retry recommendations.
- `RetryExecutionResult` captures terminal retry execution disposition.
- `RetryAttemptTracker` enforces attempt-limit containment and deterministic attempt accounting.
- `RetryExecutionContext` carries retry-execution state without changing provider contracts.

### Explicit Non-Goals
Out of scope for Increment 4:

- Provider failover
- Circuit breakers
- Observability expansion
- Worker execution
- Queue processing changes
- Persistence/schema changes
- Provider contract changes
- Public API changes

### Acceptance Criteria
Design review should be considered ready only if the packet can demonstrate:

- Retry execution occurs through pipeline orchestration.
- Retry attempt limits are honored deterministically.
- Retry strategy abstraction remains authoritative.
- Provider implementations remain unchanged.
- Public APIs remain unchanged.
- Retry outcomes are deterministic and testable.

### Risk Analysis
Primary risks for this candidate:

- Orchestration complexity risk: retry stage could over-assume provider behavior if contracts are not explicit.
- Retry loop containment risk: incorrect attempt tracking may create unintended repeat execution.
- Regression risk: retry execution could alter current terminal result semantics if status transitions are not constrained.
- Future integration risk: design choices should leave a clean seam for later failover integration.

### Design Review Notes
This packet is planning-only and does not authorize implementation.

Implementation remains blocked until:

1. Increment 4 design review is approved.
2. Increment 4 implementation planning is completed and approved.
3. Increment 4 implementation authorization is explicitly granted.

### Design Review Decision
Status: Approved

Review outcome:

- Objective approved: retry execution orchestration from established retry decisions.
- Dependency chain approved: Increments 1 through 3 plus retry/provider abstractions.
- Boundary model approved: pipeline orchestration, retry strategy authority, provider isolation.
- Non-goal deferrals approved: failover, observability expansion, queue/worker changes, persistence changes.

Next gate:

- Increment 4 Implementation Planning
- Implementation remains blocked until planning review and explicit authorization are complete.

## 14. Increment 4 Implementation Planning

### Status
Implementation-planning packet drafted. Planning review pending. Implementation not authorized.

### Planning Objective
Translate approved Increment 4 design into a bounded implementation plan for retry execution orchestration without introducing deferred concerns.

### File-Level Scope
Planned implementation boundaries:

- New modules: retry-execution boundary components only (if required by design)
- Modified modules: execution pipeline orchestration and reminder execution integration points only
- Test modules: retry-execution unit and integration tests plus existing pipeline regression coverage
- Governance updates: planning/roadmap/decision records only

Expected implementation touchpoints to evaluate:

- `api/services/execution_pipeline.py`
- `api/services/execution_pipeline_stages.py`
- `api/services/reminder_execution.py`
- `api/services/retry_decision.py`
- `tests/test_execution_pipeline.py`
- `tests/test_execution_pipeline_stages.py`
- `tests/test_retry_decision.py`

### Retry Execution Mapping Definitions
Planning mapping chain:

```text
Retry Recommendation
	↓
Retry Execution Decision
	↓
Attempt Lifecycle Transition
	↓
Final Execution Outcome
```

Mapping intent:

- Retry recommendation drives retry execution eligibility.
- Retry execution decision enforces max-attempt policy from retry strategy.
- Attempt lifecycle transitions are deterministic and bounded.
- Final execution outcome preserves existing outcome and result semantics.

### Retry Attempt Lifecycle Definition
Planned lifecycle:

```text
Initial Attempt
	↓
Retryable Failure
	↓
Retry Execution
	↓
Attempt Count Update
	↓
Success or Exhaustion
```

Lifecycle constraints:

- No provider failover branching.
- No unbounded retry loops.
- No queue/worker model changes.
- No persistence/schema redesign.

### Test Matrix Definition
The implementation plan should include explicit tests for:

- Successful retry path
- Retry exhaustion path
- Permanent failure non-retry path
- Maximum-attempt enforcement
- Pipeline integration sequencing with retry execution stage

### Regression Validation Plan
The implementation plan should verify unchanged behavior for:

- Provider contracts
- Provider implementations
- Public APIs
- Pipeline stage ordering
- Outcome classification behavior
- Retry decision behavior

### Planning Review Exit Criteria
Implementation planning review is complete only when:

- File boundaries are explicit.
- Retry lifecycle is fully specified.
- Attempt-limit behavior is deterministic.
- Test coverage expectations are defined.
- Regression checks are documented.
- Deferred items remain deferred.

### Authorization Gate
This implementation-planning packet does not authorize code changes.

Implementation may begin only after:

1. Increment 4 implementation planning review is approved.
2. Increment 4 implementation authorization is explicitly granted.

### Planning Review Decision
Status: Approved

Review outcome:

- File-level scope boundaries approved.
- Retry execution mapping approved.
- Retry-attempt lifecycle approved.
- Test matrix approved.
- Regression validation plan approved.
- Exit criteria and authorization gate approved.

Next gate:

- Increment 4 Implementation Authorization Review
- Implementation remains blocked until authorization is explicitly granted.

### Implementation Authorization Decision
Status: Approved

Authorization scope:

- Retry execution orchestration through pipeline stages
- Retry-attempt tracking and max-attempt enforcement
- Deterministic retry exhaustion behavior

Explicitly unauthorized during Increment 4:

- provider failover
- circuit breakers
- observability expansion
- worker/queue redesign
- persistence/schema changes
- provider contract and public API changes

### Implementation Summary (Pending Closeout)
Status: Implemented and validated; closeout review pending

Implemented behavior:

- Added retry execution boundary primitives (`RetryExecutionContext`, `RetryExecutionResult`, `RetryAttemptTracker`).
- Added `RetryExecutionStage` to orchestrate retries from retry recommendations.
- Integrated retry execution stage into reminder dispatch pipeline.
- Added attempt-progression guard to ensure retry-loop containment.

Validation summary:

- Targeted retry-execution tests: 3 tests, OK.
- Focused suite: 34 tests, OK.

Next gate:

- Increment 4 Closeout Review
- No implementation commit or baseline tag before closeout approval.

### Increment 4 Closeout Decision
Status: Approved

Closeout outcome:

- Retry execution orchestration scope accepted.
- Attempt lifecycle management and maximum-attempt enforcement accepted.
- Retry exhaustion behavior accepted.
- Regression invariants and test evidence accepted.

Canonical baseline recommendation:

- `v1.15.0-phase6-increment4-retry-execution-orchestration`

Next gate:

- Increment 5 Design Review (pending)

## 15. Future Increments (Provisional)

- Increment 4: Retry and recovery policies
- Increment 5: Observability and metrics
- Increment 6: Performance optimization

These items are provisional and may be refined before implementation.

---

## 16. Governance
Every implementation increment shall follow:

1. Design
2. Review
3. Implementation
4. Validation
5. Closeout

Only validated increments become part of the project baseline.

This establishes the Phase 6 specification and provides a clear foundation for Increment 1: Execution Pipeline Foundation, after which each subsequent increment can be executed in order.
