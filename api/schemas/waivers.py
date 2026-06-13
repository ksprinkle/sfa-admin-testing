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
