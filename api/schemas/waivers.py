from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WaiverCreateTokenIn(BaseModel):
    participant_id: UUID
    expires_in_minutes: int = Field(default=1440, ge=5, le=10080)
    waiver_version: str | None = None
    note: str | None = None


class WaiverCreateTokenOut(BaseModel):
    token: str
    signing_path: str
    expires_at: datetime
    status: str


class WaiverPublicViewOut(BaseModel):
    status: str
    message: str
    expires_at: datetime | None = None
    already_signed: bool = False
    token_valid: bool = False


class WaiverPublicSignIn(BaseModel):
    accepted: bool = True
    signer_name: str | None = None
    relationship_to_participant: str | None = None
    waiver_version: str | None = None


class WaiverPublicSignOut(BaseModel):
    status: str
    message: str
    already_signed: bool = False
    signed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class WaiverPdfArtifactOut(BaseModel):
    id: UUID
    waiver_id: UUID
    participant_id: UUID
    waiver_version: str | None = None
    waiver_revision: int
    waiver_template_id: UUID | None = None
    template_version: int | None = None
    template_content_sha256: str | None = None
    storage_path: str
    mime_type: str
    sha256_hash: str
    byte_size: int
    is_immutable: bool
    generated_at: datetime
    generated_by_user_id: str | None = None
    already_exists: bool = False

    model_config = ConfigDict(from_attributes=True)


class WaiverDeliveryCreateIn(BaseModel):
    method: str = Field(default="email")
    recipient: str
    expires_in_minutes: int = Field(default=1440, ge=5, le=10080)
    template_key: str = Field(default="default")
    subject_template: str | None = None
    body_template: str | None = None


class WaiverDeliveryResendIn(BaseModel):
    method: str | None = None
    recipient: str | None = None
    expires_in_minutes: int = Field(default=1440, ge=5, le=10080)
    template_key: str | None = None
    subject_template: str | None = None
    body_template: str | None = None
    resend_reason: str | None = None


class WaiverDeliveryOut(BaseModel):
    id: UUID
    waiver_id: UUID
    participant_id: UUID
    resend_of_delivery_id: UUID | None = None
    method: str
    recipient: str
    status: str
    attempt_number: int
    template_key: str
    rendered_subject: str | None = None
    rendered_body: str
    signing_path: str
    token_expires_at: datetime
    provider_message_id: str | None = None
    error_message: str | None = None
    created_by_user_id: str | None = None
    completed_at: datetime | None = None
    delivery_metadata: dict | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WaiverDashboardMetricsOut(BaseModel):
    event_id: UUID | None = None
    total_participants: int
    waivers_required: int
    waivers_sent: int
    waivers_viewed: int
    waivers_signed: int
    expired_links: int
    email_deliveries: int
    sms_deliveries: int
    failed_deliveries: int
    completion_rate: float


class WaiverAnalyticsEventOut(BaseModel):
    event_date: str
    event_type: str
    count: int


class WaiverPdfVerificationOut(BaseModel):
    artifact_id: UUID
    waiver_id: UUID
    participant_id: UUID
    waiver_template_id: UUID | None = None
    template_version: int | None = None
    storage_path: str
    integrity_status: str
    provenance_status: str
    storage_status: str
    artifact_status: str
    expected_sha256: str
    actual_sha256: str | None = None
    expected_template_content_sha256: str | None = None
    actual_template_content_sha256: str | None = None
    generated_at: datetime
    file_missing: bool = False
