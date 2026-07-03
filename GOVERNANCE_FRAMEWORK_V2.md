# Governance Framework v2
Date: 2026-07-03
Status: Proposed
Scope: Future phases only
Historical record policy: Phase 1 through Phase 11 governance artifacts remain immutable

## 1. Design Principles
1. Architecture first: no implementation authorization before architecture intent, boundaries, and interfaces are explicit.
2. Evidence based decisions: every gate decision must reference objective evidence, not narrative confidence alone.
3. Scope control by default: approved scope is explicit, bounded, and frozen before implementation begins.
4. Deferred-scope integrity: deferred items are explicit, tracked, and protected from partial or implicit activation.
5. Baseline discipline: canonical baseline updates are explicit, separate, and auditable.
6. Single-source governance records: one authoritative record per gate decision, no duplicated approval artifacts.
7. Concision and repeatability: templates are standardized, short, and optimized for low-friction execution.
8. Additive change model: backward compatibility and boundary preservation are default expectations.
9. Auditability over verbosity: each artifact must contain enough traceability to reconstruct decisions without redundant text.

## 2. Governance Lifecycle
Governance v2 uses a fixed eight-gate lifecycle with minimal artifact churn.

1. Gate A: Phase Architecture Authorization
2. Gate B: Increment Planning and Scope Freeze
3. Gate C: Implementation Start Authorization
4. Gate D: Implementation Progress Checkpoint
5. Gate E: Implementation Completion Decision
6. Gate F: Increment Closeout Review and Approval
7. Gate G: Baseline Advancement Decision
8. Gate H: Baseline Advancement Execution Record

Execution cadence:
1. Gates A and G-H are phase-level.
2. Gates B-F are increment-level and repeat per increment.
3. Gate D repeats only when materially needed, not by default per session.

## 3. Consolidated Document Set
Governance v1 pattern observed through Phase 11 generated many near-duplicate artifacts per increment.
Governance v2 consolidates to reduce count by approximately 50 percent while preserving control strength.

Implementation package location:
1. docs/governance_v2/GOVERNANCE_V2_TRANSITION_GUIDE.md
2. docs/governance_v2/PHASEXX_GOVERNANCE_LEDGER.md
3. docs/governance_v2/PHASEXX_ARCHITECTURE_AUTHORIZATION.md
4. docs/governance_v2/PHASEXX_INCREMENTY_EXECUTION_PACKET.md
5. docs/governance_v2/PHASEXX_INCREMENTY_PROGRESS_AND_DECISIONS.md
6. docs/governance_v2/PHASEXX_BASELINE_ADVANCEMENT.md

### 3.1 Phase-level documents (future phases)
1. PHASEXX_GOVERNANCE_LEDGER.md
2. PHASEXX_ARCHITECTURE_AUTHORIZATION.md
3. PHASEXX_BASELINE_ADVANCEMENT.md

### 3.2 Increment-level documents (future increments)
1. PHASEXX_INCREMENTY_EXECUTION_PACKET.md
2. PHASEXX_INCREMENTY_PROGRESS_AND_DECISIONS.md

### 3.3 Approximate reduction model
Typical v1 increment-level set often included:
1. implementation plan
2. scope freeze packet
3. implementation start checklist
4. progress review
5. completion readiness assessment
6. completion declaration decision
7. completion declaration
8. closeout review

v2 increment-level set replaces these with:
1. execution packet
2. progress and decisions

Expected reduction:
1. about 75 percent fewer increment documents
2. about 50 percent fewer total governance artifacts across a full phase when phase-level consolidation is included

## 4. Standard Document Templates
All future governance artifacts use concise fixed headings.

### 4.1 Template: PHASEXX_GOVERNANCE_LEDGER.md
Required sections:
1. canonical baseline and current authority
2. active phase and increment status table
3. deferred scope register
4. gate decision index with links
5. open risks and controls
6. required next gate

Rules:
1. this is the single living status index for the phase
2. all gate outputs must be referenced here

### 4.2 Template: PHASEXX_ARCHITECTURE_AUTHORIZATION.md
Required sections:
1. governance context
2. architecture scope and boundaries
3. approved and deferred capabilities
4. contract and integration constraints
5. authorization decision for implementation planning
6. conditions and required evidence for Gate B

### 4.3 Template: PHASEXX_INCREMENTY_EXECUTION_PACKET.md
This replaces plan plus scope freeze plus start checklist.
Required sections:
1. increment objective and approved scope
2. explicit non-goals and deferred protections
3. architecture and contract integration points
4. implementation tasks and deliverables
5. test plan and validation matrix
6. readiness checklist
7. start authorization decision
8. required evidence links

### 4.4 Template: PHASEXX_INCREMENTY_PROGRESS_AND_DECISIONS.md
This replaces progress review plus readiness assessment plus completion decision plus completion declaration plus closeout review.
Required sections:
1. governance context
2. progress summary
3. completed work and remaining work
4. validation status
5. risks and controls
6. implementation completion decision
7. closeout determination
8. post-decision governance status
9. next recommended gate action

Rules:
1. each new checkpoint appends a dated entry block in this same file
2. prior entries are immutable after decision is issued

### 4.5 Template: PHASEXX_BASELINE_ADVANCEMENT.md
This replaces baseline readiness assessment plus baseline decision plus execution record.
Required sections:
1. previous baseline
2. proposed baseline
3. advancement evidence summary
4. readiness criteria check
5. advancement decision
6. execution statement
7. authoritative post-execution baseline status

Rules:
1. decision and execution are separate sub-sections with timestamps
2. execution cannot be recorded before decision approval

## 5. Decision Gates
### Gate A: Architecture Authorization
Decision options:
1. approve
2. approve with conditions
3. do not approve

### Gate B: Increment Planning and Scope Freeze
Decision options:
1. approve packet and freeze scope
2. approve with bounded revisions
3. do not approve

### Gate C: Implementation Start Authorization
Decision options:
1. authorize implementation start
2. authorize with conditions
3. do not authorize

### Gate D: Progress Checkpoint
Decision options:
1. continue implementation
2. continue with corrective actions
3. pause and remediate

### Gate E: Implementation Completion Decision
Decision options:
1. approve completion declaration
2. approve with non-blocking corrective actions
3. do not approve

### Gate F: Increment Closeout Approval
Decision options:
1. closeout approved
2. closeout approved with conditions
3. closeout not approved

### Gate G: Baseline Advancement Decision
Decision options:
1. approve advancement
2. approve with conditions
3. do not approve

### Gate H: Baseline Advancement Execution
Decision options:
1. execute and record
2. hold pending condition closure

## 6. Required Evidence for Each Gate
### Gate A evidence
1. architecture boundary statement
2. contract map
3. deferred scope register seed

### Gate B evidence
1. increment scope definition
2. explicit exclusions
3. validation matrix draft
4. integration points and constraints

### Gate C evidence
1. readiness checklist complete
2. scope freeze confirmation
3. risk controls active

### Gate D evidence
1. implemented component inventory
2. test results to date
3. risk and corrective action log

### Gate E evidence
1. deliverable completion map
2. validation results with command and outcome
3. scope compliance verification

### Gate F evidence
1. completion decision output
2. residual risk disposition
3. deferred-scope integrity confirmation

### Gate G evidence
1. closeout approval record
2. cumulative validation summary
3. baseline impact statement

### Gate H evidence
1. approved advancement decision
2. execution timestamp and recorder
3. updated authoritative baseline reference

## 7. Baseline Advancement Process
1. confirm closeout approval exists
2. verify no open blocking obligations
3. verify validation completeness for approved scope
4. issue explicit advancement decision
5. execute advancement and record new authoritative baseline
6. update phase governance ledger and downstream references

Controls:
1. advancement decision and execution are distinct steps
2. migration authorization is never implied by advancement
3. deferred scope remains out of scope unless separately authorized

## 8. Copilot Prompt Conventions
Prompt format standard:
1. artifact name
2. update scope with explicit allowed sections
3. unchanged constraints list
4. required decision statement
5. required evidence references

Prompt optimization rules:
1. use one artifact per prompt whenever possible
2. specify update only sections to avoid full-file rewrites
3. include required decision sentence verbatim
4. avoid repeating historical context unless needed for a gate
5. keep prompts under a short bounded structure to minimize token use

Recommended concise prompt skeleton:
1. create or update artifact name
2. update only list
3. determine decision line
4. reference key evidence line
5. keep everything else unchanged

Credit minimization practices:
1. prefer append-only checkpoint sections in consolidated files
2. avoid generating parallel duplicate artifacts for the same gate
3. avoid re-summarizing unchanged governance context
4. run targeted validation commands only for affected increment scope plus compact regression set

## 9. Transition Plan from Governance v1 to Governance v2
Scope boundary:
1. Phase 1 through Phase 11 artifacts are immutable historical record
2. Governance v2 starts with the next future phase only

Authoritative v2 location:
1. docs/governance_v2/
2. Governance v2 artifacts are the only allowed governance artifacts for future phases

### 9.1 Transition steps
1. Freeze v1 archive posture:
- no retroactive edits to historical governance artifacts
2. Initialize v2 phase scaffolding:
- create PHASEXX_GOVERNANCE_LEDGER.md
- create PHASEXX_ARCHITECTURE_AUTHORIZATION.md
3. For first v2 increment:
- create PHASEXX_INCREMENT1_EXECUTION_PACKET.md
- create PHASEXX_INCREMENT1_PROGRESS_AND_DECISIONS.md
4. At phase closeout:
- create PHASEXX_BASELINE_ADVANCEMENT.md

### 9.2 Mapping from v1 artifacts to v2 artifacts
1. implementation plan plus scope freeze plus start checklist map to execution packet
2. progress review plus readiness plus completion decision plus declaration plus closeout review map to progress and decisions
3. baseline readiness plus baseline decision plus execution record map to baseline advancement
4. all status rollups map to governance ledger

### 9.3 Adoption guardrails
1. do not migrate or rewrite v1 files
2. ledger must reference v1 baseline as inherited starting point for v2 phase
3. first v2 phase kickoff must explicitly declare governance model switch
4. all future prompts should request v2 artifacts by standard names

## 10. Success Criteria for Governance v2
1. document count reduced by approximately 50 percent or better over a full phase
2. no loss of gate-level auditability
3. no increase in scope drift incidents
4. baseline transitions remain explicit, separate, and traceable
5. copilot prompt length and artifact churn measurably reduced
