# Architecture Decisions

This document records architectural and release-governance decisions that are binding through v1.0.0.

## ADR-001: Release Baseline and Tagging Rule
Date: 2026-06-08
Status: Accepted

Decision:
- Define release baseline as current HEAD at deployment start.
- Deploy that commit.
- Verify deployment against that commit.
- Tag v1.0.0-rc2 only after deployment verification.
- If verification passes, tag v1.0.0 on the exact same commit.

Rationale:
- Production tags must point to the exact deployed and verified commit for auditability and rollback confidence.

## ADR-002: Waiver as Separate Entity
Date: 2026-06-08
Status: Accepted

Decision:
- Model waiver as a separate entity (participant_waivers) with a 1:1 relation to participant.
- Keep participant waiver booleans for backward compatibility during transition.

Rationale:
- Waiver is a business object with its own lifecycle and metadata.
- Backward compatibility avoids destabilizing current release workflows.

## ADR-003: Check-In Gate Rule
Date: 2026-06-08
Status: Accepted

Decision:
- Participant check-in requires a verified waiver.

Rationale:
- Aligns with operational safety/legal requirement for event-day flow.

## ADR-004: Waiver Audit Fields
Date: 2026-06-08
Status: Accepted

Decision:
- Track waiver source values as:
  - `digital`
  - `paper`
  - `staff_override`
- Track audit metadata:
  - verification timestamp
  - verifying user
  - optional notes
  - `waiver_version` (legal form/version accepted)

Rationale:
- Removes ambiguity and provides operational/legal traceability.
- `waiver_version` enables future legal text changes without schema redesign.

## ADR-005: Scope Freeze Through v1.0.0
Date: 2026-06-08
Status: Accepted

Decision:
- Declare feature freeze through v1.0.0.
- Only the following commit categories are allowed before v1.0.0:
  - deployment fixes
  - bug fixes
  - documentation
  - critical release issues

Allowed before v1.0.0:
- Bug fixes
- Deployment fixes
- Documentation
- Minor UI polish

Not allowed before v1.0.0:
- Digital signature implementation
- Email workflows
- PDF generation
- Additional waiver states
- Schema redesign

Rationale:
- Protect release stability and keep validation surface bounded.

## Immutable v1.0 Architectural Decisions
- Authentication architecture is locked.
- Deployment architecture is locked.
- Import architecture is locked.
- Waiver is a separate entity.
- Participant remains backward compatible.
- Check-in requires verified waiver.
- waiver_source values are locked to:
  - digital
  - paper
  - staff_override
- waiver_version records the legal form accepted.

## Post-v1.0 Planned Enhancements (Not Release Blockers)
- Digital signature capture
- Email and SMS waiver delivery
- PDF generation and storage
- Additional waiver lifecycle states
- Enhanced reporting

## Post-1.0 Roadmap Priorities
1. Digital Waiver System
- Parent link
- Mobile signing
- Automatic verification
- PDF generation
- Full audit trail

2. Registration Communications
- Email
- SMS
- Reminder workflow

3. Volunteer Enhancements
- Assignment improvements
- Capacity planning
- Reporting

## ADR-006: Phase 2.1 Waiver Lifecycle Engine
Date: 2026-06-13
Status: Accepted

Decision:
- Expand waiver domain status lifecycle to:
  - `draft`
  - `sent`
  - `viewed`
  - `signed`
  - `archived`
  - `superseded`
- Preserve backward compatibility for legacy statuses by mapping:
  - `pending` -> `draft`
  - `verified` -> `signed`
- Keep existing participant waiver booleans in place for stable check-in and participant workflows.

Rationale:
- Enables staged digital-waiver capabilities without breaking approved event-day behavior.

## ADR-007: Phase 2.1 Waiver Versioning and Audit Event Structure
Date: 2026-06-13
Status: Accepted

Decision:
- Keep one active waiver row per participant (current architecture) and track waiver revision metadata on the waiver record.
- Add lifecycle timestamps (`sent_at`, `viewed_at`, `signed_at`, `archived_at`, `superseded_at`) plus lifecycle update timestamp.
- Add `waiver_audit_events` table for immutable event records including:
  - event type
  - from status
  - to status
  - actor user id
  - source
  - JSON details payload
  - created timestamp
- Define derived participant waiver status from waiver entity first, then participant compatibility booleans.

Rationale:
- Establishes legal and operational traceability required for later secure signing, delivery, and reporting milestones.

## ADR-008: Phase 2.2 Tokenized Public Signing Access
Date: 2026-06-13
Status: Accepted

Decision:
- Public signing is token-only and does not expose internal waiver IDs.
- Signing tokens are cryptographically random, opaque, and stored server-side as hashes.
- Tokens include issued and expiration timestamps and are time-limited.
- Public access endpoints are limited to token-based GET/POST signing flow.

Rationale:
- Minimizes disclosure and enumeration risk while enabling no-auth guardian/participant signing.

## ADR-009: Phase 2.2 Replay and Expiration Behavior
Date: 2026-06-13
Status: Accepted

Decision:
- Completed signing submissions are idempotent: repeated submits with same token return signed result rather than creating duplicates.
- Expired tokens return deterministic user-facing response without internal details.
- Significant token/signing actions append waiver audit events (for example: TOKEN_CREATED, TOKEN_VIEWED, TOKEN_VALIDATED, SIGN_SUBMITTED, SIGN_COMPLETED, TOKEN_EXPIRED, INVALID_ACCESS).

Rationale:
- Provides predictable operator/user behavior, hardens security boundaries, and preserves an auditable history.

## ADR-010: Phase 2.4 Immutable Waiver PDF Artifacts
Date: 2026-06-13
Status: Accepted

Decision:
- Generate waiver PDFs only for completed signed waivers.
- Store each PDF as an immutable archived artifact referenced to waiver and revision metadata.
- Persist archive metadata including waiver id, participant id, waiver version/revision, storage path, generation timestamp, and SHA-256 hash.
- Expose admin-authorized retrieval endpoints without changing signing workflow behavior.

Rationale:
- Keeps database waiver record as canonical source while enabling verifiable immutable legal snapshots.

## ADR-011: Phase 2.5 Waiver Delivery Orchestration
Date: 2026-06-13
Status: Accepted

Decision:
- Track waiver delivery attempts in a dedicated delivery model separate from waiver records.
- Support email and SMS delivery methods with template rendering, resend attempts, and persisted status tracking.
- Treat delivery service as a consumer of existing signing token and waiver infrastructure.
- Keep waiver lifecycle and PDF archive logic unchanged during this phase.

Rationale:
- Enables retryable multi-channel delivery without mutating signed records and preserves clear audit history.

## ADR-012: Phase 2.6 Waiver Observability and Reporting
Date: 2026-06-13
Status: Accepted

Decision:
- Add admin-authorized waiver observability endpoints for metrics, analytics event aggregation, and delivery CSV export.
- Derive reporting metrics from existing waiver, token, delivery, and participant data models without introducing lifecycle or workflow mutations.
- Extend admin event summary payload with waiver and delivery counters for dashboard integration.
- Keep token signing, lifecycle transitions, PDF generation, and delivery orchestration behavior unchanged.

Rationale:
- Improves operational visibility for event readiness and follow-up actions while preserving previously approved business logic and security boundaries.

## ADR-013: Phase 4.2 Governance and Audit Infrastructure
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce `admin_audit_events` as the canonical cross-domain store for administrative governance events.
- Define a dedicated audit service interface for write and read operations:
  - `record_admin_audit_event(...)`
  - `list_admin_audit_events(...)`
- Expose admin-authorized read access via `GET /api/admin/audit/events` with scoped filters and pagination.
- Integrate existing admin role-change actions as first consumers so permission changes emit immutable governance events in the same transaction.
- Keep this phase scoped to audit infrastructure only; no permissions redesign, workflow automation, volunteer lifecycle, communications, or analytics expansion is included.

Rationale:
- Establishes canonical audit ownership before broader Phase 4 features rely on governance evidence.
- Prevents projection/reporting layers from becoming de facto audit systems of record.
- Enables later phases to consume a stable, centralized administrative audit stream without retrofitting.

## ADR-014: Phase 4.3 Permissions Architecture
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce a canonical authorization role and permission matrix in service-layer architecture (`api/services/authorization.py`).
- Keep current runtime role set stable (`admin`, `participant`) while formalizing permission contracts for admin operations.
- Refactor authorization dependency checks to consume permission decisions (`has_permission`) rather than hard-coded role comparisons.
- Add explicit admin introspection endpoints for permissions architecture:
  - `GET /api/admin/permissions/matrix`
  - `GET /api/admin/permissions/me`
- Keep permissions phase scope limited to architecture and enforcement primitives; no workflow automation, communications, volunteer lifecycle, or analytics expansion is included.

## ADR-015: Phase 5.1 Reminder and Notification Foundation
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce reminder foundation models as a separate reminder domain, with `reminder_definitions` as the canonical stored configuration and `reminder_audit_events` as the append-only change log.
- Define service-layer scheduling and notification interfaces instead of coupling reminder logic to a specific delivery backend.
- Keep reminder business rules, scheduling, and delivery concerns separate so future email, SMS, and push implementations can be swapped without redesigning the reminder domain.
- Use noop defaults and provider/scheduler registries as the initial integration surface for future implementations.

Rationale:
- Establishes a stable architecture for Operational Automation before any concrete reminder delivery workflow is added.
- Preserves the existing communications layer while creating a reminder-specific domain boundary for future growth.
- Prevents provider or scheduling decisions from leaking into business logic.

Rationale:
- Establishes a reusable authorization foundation before later Phase 4 capability expansion.
- Reduces authorization drift by defining one canonical matrix and one enforcement path.
- Preserves current behavior while enabling future fine-grained permissions without endpoint-by-endpoint rewrites.

## ADR-015: Phase 4.4 Workflow Automation Foundation
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce canonical automation foundation entities:
  - `automation_workflows` (workflow registration and trigger metadata)
  - `automation_runs` (execution lifecycle records)
- Introduce a central automation engine service that provides:
  - workflow handler registration
  - workflow definition creation and enable/disable controls
  - execution model for workflow runs
- Keep automation phase scoped to framework primitives only; no reminder, messaging, volunteer, event-ops, or analytics workflows are implemented in this phase.
- Integrate automation APIs with canonical permissions and canonical audit infrastructure:
  - permissions gate: `automation.manage`
  - audit events on workflow create/enable changes and execution lifecycle
- Establish a default no-op handler (`system.noop`) to validate engine plumbing without introducing domain behavior.

Rationale:
- Provides an orchestration layer that reacts to canonical state without becoming a competing system of record.
- Ensures automation execution is permission-aware and auditable from first use.
- Preserves roadmap sequencing by creating extensible primitives before feature-specific automation workloads.

## ADR-016: Phase 4.5 Volunteer Lifecycle Foundation
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce canonical volunteer lifecycle domain entities:
  - `volunteer_profiles` as the authoritative volunteer identity and lifecycle owner
  - `volunteer_availabilities` as canonical availability records
  - `volunteer_assignments` as canonical assignment records to events/sessions
- Add volunteer lifecycle service layer for profile lifecycle transitions, availability operations, and assignment lifecycle operations.
- Integrate volunteer domain operations with canonical permission enforcement (`volunteers.manage`).
- Integrate significant volunteer administrative actions with canonical audit event recording.
- Keep this phase strictly domain-foundation scoped; no reminders, communications, dashboard/analytics expansions, or event-ops UI behavior are added.

Rationale:
- Establishes a single source of truth for volunteer lifecycle concerns without duplicating participant/event ownership.
- Creates stable domain contracts that workflow automation and later phases can orchestrate rather than replace.
- Preserves architecture-first sequencing by finalizing canonical volunteer domain boundaries before broader operational feature expansion.

## ADR-017: Phase 4.6 Communications Platform Foundation
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce canonical communications domain entities:
  - `communication_templates`
  - `communication_messages`
  - `communication_deliveries`
- Introduce delivery abstraction interface with provider registry and default no-op provider for safe foundation execution.
- Introduce communications platform service layer for template lifecycle, message creation, and delivery request orchestration.
- Integrate communications administrative endpoints with canonical permissions (`communications.manage`).
- Integrate significant communications actions with canonical administrative audit event recording.
- Keep this phase strictly foundational; no reminder engines, campaign logic, marketing flows, dashboard expansion, event-ops features, or analytics features are introduced.

Rationale:
- Establishes canonical communications ownership before downstream operational feature expansion.
- Preserves separation of concerns by keeping orchestration in services and provider abstraction layers rather than embedding delivery behavior in endpoints.
- Ensures communications actions are permission-governed and auditable from the first foundation release.

## ADR-018: Phase 4.7 Event Operations Foundation
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce canonical event operations entity (`event_operations`) with one authoritative row per event.
- Establish event operations status model:
  - operational status
  - readiness status
  - capacity status
- Establish canonical capacity/readiness data contract owned by event operations domain:
  - participant capacity and count snapshots
  - volunteer capacity and assignment count snapshots
  - readiness score and blockers list
- Add event operations domain service for:
  - canonical refresh from existing event/participant/volunteer domains
  - explicit operational status updates
- Integrate event operations actions with canonical permissions (`event_operations.manage`) and canonical audit infrastructure.
- Keep this phase strictly foundational; no executive analytics, dashboards, reporting projections, reminder/campaign logic, or unrelated UI work is introduced.

Rationale:
- Provides a single authoritative operational-state owner for each event.
- Preserves separation of domains by consuming canonical event, participant, and volunteer data without duplicating ownership.
- Establishes a stable operational foundation for Phase 4.8 executive analytics as a derived consumer rather than a new source of truth.

## ADR-019: Phase 4.8 Executive Analytics Projection Layer
Date: 2026-06-14
Status: Accepted

Decision:
- Expand executive analytics as a read-only projection and aggregation layer over existing canonical domains.
- Add derived KPI and summary aggregation outputs that consume canonical models only, including:
  - participants
  - event operations
  - volunteer profiles
  - communications messages/deliveries/templates
  - automation workflows/runs
  - administrative audit events
- Add read-only executive summary endpoint for domain-level aggregate metrics.
- Introduce no new canonical business entities and no workflow/orchestration/domain mutation behavior in analytics layer.

Rationale:
- Preserves core architectural invariant that analytics consume canonical domain truth and never become a source of business truth.
- Provides executive-level visibility while maintaining strict domain separation and reuse of existing governance foundations.

## ADR-020: Phase 5.2 Reminder Execution Engine
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce a canonical reminder execution engine that evaluates reminder eligibility, generates queue items, and records execution lifecycle transitions.
- Keep reminder execution separate from delivery providers so the engine owns decision and orchestration behavior while future email, SMS, and push providers remain delivery-only.
- Use a durable queue item table as the execution system of record, with execution keys enforcing idempotency and preventing duplicate processing.
- Record append-only reminder audit events for execution evaluation, queueing, skips, duplicate suppression, start, retry scheduling, success, and terminal failure.
- Implement retry handling inside the engine with explicit terminal failure when retry limits are exhausted.

Rationale:
- Establishes the missing runtime layer between reminder configuration and future delivery channels.
- Preserves auditability by making reminder execution decisions observable rather than implicit.
- Avoids duplicating eligibility, retry, and idempotency behavior across providers or downstream consumers.

## ADR-021: Phase 5.3 Notification Delivery Pipeline Foundation
Date: 2026-06-15
Status: Accepted

Decision:
- Introduce a canonical notification delivery pipeline with two durable tables:
  - `notification_delivery_attempts` — one row per logical delivery, serving as the execution system of record.
  - `notification_delivery_events` — append-only event log for pipeline lifecycle transitions.
- Enforce idempotency via `delivery_key` unique constraint so the pipeline can be called repeatedly without creating duplicate deliveries.
- Keep the pipeline domain-agnostic through a `source_domain` / `source_id` reference pattern so reminder, volunteer, event, and admin sources all share the same transport layer.
- Maintain the provider abstraction from Phase 5.1 (`NotificationProvider` Protocol / registry) as the sole integration point for future email, SMS, and push providers.
- Include an `execution_queue_item_id` foreign key so reminder execution queue items can be traced directly to their delivery attempts.
- Record audit events for: queued, duplicate suppressed, started, succeeded, retry scheduled, failed, and cancelled.
- Introduce no provider-specific logic; the pipeline orchestrates provider calls but does not embed email, SMS, or push behavior.

Rationale:
- Provides the shared transport layer that all future delivery channels consume, preventing each channel from embedding its own retry, idempotency, and audit behavior.

## ADR-023: Phase 5.5 Email Provider Foundation
Date: 2026-06-15
Status: Accepted

Decision:
- Introduce a hardened email-provider contract with `EmailRequest` and `DeliveryResult` as the public integration boundary.
- Standardize provider outcomes through `DeliveryStatus` values:
  - `success`
  - `rejected`
  - `failed`
  - `temporary_failure`
- Keep provider selection configuration-driven through `EMAIL_PROVIDER_KEY` while preserving a noop default for safe startup behavior.
- Register `email.noop` and `email.smtp` behind the same provider registry so application code remains provider-agnostic.
- Map SMTP behavior inside the adapter only, including recipient validation, authentication failure, temporary connection failure, and configuration failure.
- Preserve the rendered-message queue bridge so existing delivery orchestration continues to consume the provider interface rather than branching on provider type.

Rationale:
- Freezes the provider contract before adding more transport implementations.
- Ensures email transports can be swapped without changing business logic or queue orchestration.
- Preserves governance discipline by completing the email foundation as one scoped architectural increment.
- Maintains the established governance pattern of separating decision (execution engine) from delivery (pipeline) from channel (future providers).
- Preserves auditability by recording every lifecycle transition as an append-only event before any real provider exists.

## ADR-022: Phase 5.4 Message Template and Rendering Foundation
Date: 2026-06-15
Status: Accepted

Decision:
- Introduce a channel-neutral message template domain with two durable tables:
  - `message_templates` — canonical template identity, category, supported channels, and active version pointer.
  - `message_template_versions` — immutable published content versions with subject/body patterns, variable declarations, and rendering hints.
- Enforce immutability of published versions: once published, a version's content cannot be modified; new versions must be created instead.
- Define a `{{variable_name}}` placeholder syntax with declared variable definitions that include required/optional classification and description.
- Introduce a `render_template` service function that validates and substitutes variables, producing a channel-neutral `RenderedMessage` object.
- Validate at publish time: undeclared placeholders in patterns cause a 422 and block publication.
- Validate at render time: missing required variables, unsupported channels, and unpublished versions all raise before the delivery pipeline is reached.
- The `RenderedMessage` object (subject, body, resolved variables, rendering metadata) is the contract consumed by the delivery pipeline and eventually by future provider adapters.
- Introduce no email, SMS, push, or provider-specific formatting logic.

Rationale:
- Prevents each future delivery channel from embedding its own template and variable substitution logic.
- Establishes a single validated rendering contract so the delivery pipeline and providers receive consistently structured messages.
- Preserves historical integrity by keeping published versions immutable, enabling reliable audit and reproducibility of previously sent notifications.

## ADR-024: Phase 5.8 Reminder Execution Pipeline Orchestration
Date: 2026-06-15
Status: Accepted

Decision:
- Introduce `ReminderExecutionPipeline` as the canonical orchestration boundary for reminder execution lifecycle coordination.
- Define explicit orchestration stages for reminder execution flow:
  - evaluate eligibility
  - build execution plan
  - render payload
  - record evaluation/queue/skip/duplicate outcomes
  - coordinate dispatch lifecycle
- Preserve existing public entry points as compatibility wrappers that delegate to the pipeline.
- Keep provider selection, retry policy, and provider implementations outside the pipeline boundary.
- Keep reminder business eligibility rules and execution-state semantics unchanged.

Rationale:
- Creates a single execution seam with minimal implementation risk while preserving external behavior.
- Builds directly on prior Phase 5.6 (provider resolution) and Phase 5.7 (retry strategy) without coupling concerns.
- Improves maintainability by centralizing orchestration and stage sequencing in one component.
- Preserves governance discipline by delivering one architectural increment only.

## ADR-025: Phase 5.9 Async Dispatch Architecture
Date: 2026-06-15
Status: Accepted

Decision:
- Introduce `DispatchJob` as the canonical dispatch unit with lifecycle states: `pending`, `running`, `succeeded`, `failed`, `cancelled`.
- Keep `ReminderExecutionPipeline` responsible for orchestration stages through dispatch-job creation only:
  - eligibility evaluation
  - payload rendering
  - provider resolution
  - dispatch job creation
- Introduce `ReminderDispatcher` execution boundary responsible for:
  - dispatch-job execution
  - retry strategy invocation
  - failure/result handling
  - lifecycle status progression
- Preserve backward compatibility by keeping existing public dispatch entry points as wrappers around pipeline job creation plus dispatcher execution.
- Introduce no provider-specific or infrastructure-specific commitments in this phase.

Rationale:
- Decouples reminder orchestration from delivery execution while preserving established architectural boundaries.
- Builds directly on prior Phase 5.6 (provider resolver), Phase 5.7 (retry strategy), and Phase 5.8 (orchestration seam).
- Reduces implementation risk by introducing one logical execution boundary without expanding into queue-backend, distributed-worker, or failover concerns.

## ADR-026: Phase 6 Incremental Execution Governance Baseline
Date: 2026-06-17
Status: Accepted

Decision:
- Establish `PHASE6_SPECIFICATION_AND_DESIGN.md` as the authoritative planning and design baseline for Phase 6.
- Execute Phase 6 through sequential increments, with one approved increment implemented at a time.
- Require each increment to follow the governance workflow: design -> review -> implementation -> validation -> closeout.
- Designate Phase 6 Increment 1 (`Execution Pipeline Foundation`) as the next executable work item, pending explicit design-review approval.
- Introduce no new implementation behavior in this planning-baseline decision.

Rationale:
- Preserves governance discipline established in Phases 5.6 through 5.9.
- Prevents scope expansion by forcing one increment per approved change set.
- Creates a stable planning reference before Phase 6 code changes begin.

## ADR-027: Phase 6 Increment 1 Execution Pipeline Foundation
Date: 2026-06-17
Status: Accepted

Decision:
- Introduce `ExecutionPipeline` as the orchestration layer for dispatch execution sequencing.
- Introduce `ExecutionContext` as the stage handoff contract for pipeline execution.
- Introduce `PipelineStage` as the extensibility contract for ordered stage execution.
- Introduce standardized `PipelineResult`/`PipelineResultStatus` outcomes (`success`, `failed`, `retryable_failure`, `skipped`).
- Implement initial stage set (`ValidateExecutionStage`, `ResolveProviderStage`, `DispatchExecutionStage`, `RecordResultStage`) as pipeline foundations.
- Route reminder dispatch flow through the execution pipeline while preserving existing public entry points and Phase 5.6-5.9 architectural boundaries.

Deferred by decision:
- provider failover
- queue backend selection
- distributed workers
- circuit breakers
- tracing and dashboards
- persistence schema changes

Rationale:
- Establishes a formal orchestration seam for Phase 6 while maintaining compatibility with prior boundaries.
- Enables incremental stage-based evolution without provider or retry contract rewrites.
- Keeps Increment 1 scope narrow and governance-compliant.

## ADR-028: Phase 6 Increment 2 Implementation Planning Packet (Execution Outcome Classification)
Date: 2026-06-17
Status: Planning Approved (Implementation Not Authorized)

Decision:
- Select `Execution Outcome Classification` as the single Phase 6 Increment 2 candidate.
- Plan introduction of a normalized outcome model between dispatch-stage outputs and pipeline-result derivation.
- Plan a provider-agnostic `OutcomeClassifier` that maps raw dispatch/provider signals into normalized outcomes:
  - `SUCCESS`
  - `RETRYABLE_FAILURE`
  - `PERMANENT_FAILURE`
  - `SKIPPED`
- Keep provider contracts, provider registry behavior, retry contracts, and public execution APIs unchanged.
- Defer retry execution, failover, circuit breakers, telemetry/metrics, worker execution, queue-processing changes, and persistence/schema changes.

Rationale:
- Builds directly on Increment 1 pipeline abstractions while preserving architectural boundaries from Phases 5.6-5.9.
- Creates a stable, provider-agnostic disposition layer required for future retry/failover/observability increments.
- Keeps scope narrow and governance-compliant by isolating classification from execution policy behavior.
