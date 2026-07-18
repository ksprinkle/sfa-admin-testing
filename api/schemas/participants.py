from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic import model_validator

from api.schemas.events import EventLocation

PRIMARY_VOLUNTEER_TYPES = {"food", "raffle", "beach", "instructor", "buddy"}
ADDITIONAL_VOLUNTEER_TYPES = PRIMARY_VOLUNTEER_TYPES | {
    "spotter",
    "board_rescue",
    "lifeguard",
    "registration",
    "setup_teardown",
    "equipment_handling",
    "snacks_drinks",
}
# Roles that can only register within 14 days of event start.
BEACH_RESTRICTED_VOLUNTEER_TYPES = {"beach", "instructor", "buddy"}


# Group labels that are pure UI-level placeholders with no corresponding concrete
# stored role. "water" has no own primary type — volunteers under it pick
# "buddy" or "instructor" via the UI. "beach" is NOT a group label here because
# it IS a valid concrete primary role (beach coordinator).
VOLUNTEER_GROUP_LABELS = {"water"}

# Alias map for concrete role name variants only (no group placeholders).
PRIMARY_VOLUNTEER_ALIAS_MAP = {
    "surf_instructor": "instructor",
    "surf_buddy": "buddy",
}


def _normalize_primary_volunteer_type(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    normalized = value.strip().lower()
    normalized = PRIMARY_VOLUNTEER_ALIAS_MAP.get(normalized, normalized)
    if not normalized:
        return None
    if normalized not in PRIMARY_VOLUNTEER_TYPES:
        raise ValueError("Unsupported volunteer role")

    return normalized


def _normalize_roles(value: Optional[list[str]], allowed_roles: set[str]) -> list[str]:
    if not value:
        return []

    alias_map = {
        "setup/tear down": "setup_teardown",
        "setup-teardown": "setup_teardown",
        "setup & tear down": "setup_teardown",
        "set up/tear down": "setup_teardown",
        "equipment handling": "equipment_handling",
        "equipment": "equipment_handling",
        "snacks/drinks": "snacks_drinks",
        "snacks drinks": "snacks_drinks",
        "board rescue": "board_rescue",
        "cleanup": "setup_teardown",
        "surf_instructor": "instructor",
        "surf_buddy": "buddy",
    }

    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        role = (item or "").strip().lower()
        if not role:
            continue

        role = alias_map.get(role, role)
        if role not in allowed_roles:
            raise ValueError(f"Unsupported volunteer role: {item}")
        if role in seen:
            continue

        seen.add(role)
        normalized.append(role)

    return normalized


class ParticipantCreate(BaseModel):
    event_id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    role: str = "participant"
    is_minor: bool = False
    requires_assistance: bool = False
    priority: int = 0  # 0 = unset, 1 = high, 2 = medium, 3 = low
    volunteer_type: Optional[str] = None
    volunteer_additional_types: list[str] = Field(default_factory=list)
    volunteer_is_versatile: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_role_and_type_aliases(cls, data):
        if not isinstance(data, dict):
            return data

        payload = dict(data)

        # Backward compatibility: some clients still send a single "type" field.
        # Also handle volunteer_type being sent as a group-only label ("water")
        # rather than a concrete role — "water" has no stored type of its own.
        raw_type = payload.get("type") or payload.get("volunteer_type")
        normalized_type = (str(raw_type).strip().lower() if raw_type is not None else "")
        type_aliases = dict(PRIMARY_VOLUNTEER_ALIAS_MAP)
        normalized_type = type_aliases.get(normalized_type, normalized_type)

        raw_role = payload.get("role")
        normalized_role = (str(raw_role).strip().lower() if raw_role is not None else "")

        if normalized_role == "surfer":
            normalized_role = "participant"

        if normalized_type:
            if normalized_type in {"surfer", "participant"}:
                if not normalized_role or normalized_role == "participant":
                    normalized_role = "participant"
                    payload["volunteer_type"] = None
            elif normalized_type in VOLUNTEER_GROUP_LABELS:
                # Group placeholder ("water" only): mark as volunteer but do NOT
                # assign a concrete primary role. The user must choose one via the UI.
                normalized_role = "volunteer"
                payload["volunteer_type"] = None
            elif normalized_type in PRIMARY_VOLUNTEER_TYPES:
                if not normalized_role or normalized_role == "volunteer":
                    normalized_role = "volunteer"
                    payload["volunteer_type"] = normalized_type

        if not normalized_role:
            normalized_role = "participant"

        if normalized_role != "volunteer":
            # Non-volunteers should never carry volunteer role fields.
            payload["volunteer_type"] = None
            payload["volunteer_additional_types"] = []
            payload["volunteer_is_versatile"] = False
        else:
            payload["requires_assistance"] = False

        if normalized_role:
            payload["role"] = normalized_role

        return payload

    @field_validator("volunteer_type")
    @classmethod
    def normalize_primary_volunteer_type(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_primary_volunteer_type(value)

    @field_validator("volunteer_additional_types")
    @classmethod
    def normalize_additional_roles(cls, value: Optional[list[str]]) -> list[str]:
        return _normalize_roles(value, ADDITIONAL_VOLUNTEER_TYPES)

    model_config = ConfigDict(from_attributes=True)


class ParticipantOut(BaseModel):
    id: UUID
    event_id: UUID
    first_name: str
    last_name: str
    email: str
    role: str
    is_minor: bool
    requires_assistance: bool = False
    is_waitlisted: bool
    priority: int
    checked_in: bool
    checked_in_at: Optional[datetime]
    removed_at: Optional[datetime] = None
    removed_reason_code: Optional[str] = None
    removed_reason_note: Optional[str] = None
    removed_stage: Optional[str] = None
    volunteer_type: Optional[str] = None
    volunteer_additional_types: list[str] = Field(default_factory=list)
    volunteer_is_versatile: bool = False

    model_config = ConfigDict(from_attributes=True)


class ParticipantAction(BaseModel):
    action: Literal[
        "checkin",
        "undo_checkin",
        "promote",
        "move_to_waitlist",
        "verify_waiver",
        "remove",
    ]
    removal_reason_code: Optional[Literal[
        "no_show",
        "changed_mind",
        "duplicate_registration",
        "admin_correction",
        "safety_issue",
        "other",
    ]] = None
    removal_reason_note: Optional[str] = None
    waiver_source: Optional[Literal["digital", "paper", "staff_override"]] = None
    waiver_version: Optional[str] = None
    waiver_note: Optional[str] = None

    @model_validator(mode="after")
    def validate_remove_reason(self):
        if self.action != "remove":
            return self

        if not self.removal_reason_code:
            raise ValueError("removal_reason_code is required when action is remove")

        note = (self.removal_reason_note or "").strip()
        if self.removal_reason_code == "other" and not note:
            raise ValueError("removal_reason_note is required when removal_reason_code is other")

        return self


class AdminParticipantListOut(BaseModel):
    id: UUID
    event_id: UUID
    session_id: Optional[UUID] = None
    first_name: str
    last_name: str
    email: str
    role: str
    is_minor: bool
    requires_assistance: bool = False
    checked_in: bool
    is_waitlisted: bool
    priority: int
    waiver_signed: bool
    waiver_verified: bool
    waiver_source: Optional[str] = None
    waiver_version: Optional[str] = None
    waiver_verified_at: Optional[datetime] = None
    waiver_verified_by_user_id: Optional[str] = None
    waiver_verified_by_email: Optional[str] = None
    waiver_notes: Optional[str] = None
    derived_waiver_status: Optional[str] = None
    event_title: str | None = None
    event_type: Optional[str] = None
    session_name: Optional[str] = None
    notes: Optional[str] = None
    no_show_count: int = 0
    removed_at: Optional[datetime] = None
    removed_reason_code: Optional[str] = None
    removed_reason_note: Optional[str] = None
    removed_stage: Optional[str] = None
    volunteer_type: Optional[str] = None
    volunteer_additional_types: list[str] = Field(default_factory=list)
    volunteer_is_versatile: bool = False

    model_config = ConfigDict(from_attributes=True)


class SessionUpdate(BaseModel):
    session_id: UUID


class ParticipantEmailUpdate(BaseModel):
    email: EmailStr


class ParticipantUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_minor: Optional[bool] = None
    requires_assistance: Optional[bool] = None
    is_waitlisted: Optional[bool] = None
    priority: Optional[int] = None
    waiver_signed: Optional[bool] = None
    waiver_verified: Optional[bool] = None
    waiver_source: Optional[Literal["digital", "paper", "staff_override"]] = None
    waiver_version: Optional[str] = None
    waiver_note: Optional[str] = None
    checked_in: Optional[bool] = None
    notes: Optional[str] = None
    session_id: Optional[UUID] = None
    volunteer_type: Optional[str] = None
    volunteer_additional_types: Optional[list[str]] = None
    volunteer_is_versatile: Optional[bool] = None

    @field_validator("volunteer_type")
    @classmethod
    def normalize_update_primary_volunteer_type(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_primary_volunteer_type(value)

    @field_validator("volunteer_additional_types")
    @classmethod
    def normalize_update_additional_roles(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        return _normalize_roles(value, ADDITIONAL_VOLUNTEER_TYPES)


class ParticipantRemovalLogOut(BaseModel):
    id: UUID
    participant_id: str
    event_id: str
    event_title: Optional[str] = None
    event_type: Optional[str] = None
    first_name: str
    last_name: str
    email: str
    role: str
    was_waitlisted: str
    was_checked_in: str
    was_waiver_verified: str
    removed_reason_code: str
    removed_reason_note: Optional[str] = None
    removed_stage: str
    removed_by_user_id: Optional[str] = None
    removed_by_user_email: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VolunteerSignup(BaseModel):
    """Used for the public volunteer self-registration endpoint."""

    first_name: str
    last_name: str
    email: EmailStr
    is_minor: bool = False
    volunteer_type: str
    volunteer_additional_types: list[str] = Field(default_factory=list)
    volunteer_is_versatile: bool = False

    @field_validator("volunteer_type")
    @classmethod
    def normalize_signup_primary_role(cls, value: str) -> str:
        normalized = _normalize_primary_volunteer_type(value)
        if not normalized:
            raise ValueError("Unsupported volunteer role")
        return normalized

    @field_validator("volunteer_additional_types")
    @classmethod
    def normalize_signup_additional_roles(
        cls,
        value: list[str],
    ) -> list[str]:
        return _normalize_roles(list(value), ADDITIONAL_VOLUNTEER_TYPES)


class PublicEventRegister(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    role: str = "participant"
    is_minor: bool = False
    requires_assistance: bool = False
    priority: int = 0
    volunteer_type: Optional[str] = None
    volunteer_additional_types: list[str] = Field(default_factory=list)
    volunteer_is_versatile: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_role_and_type_aliases(cls, data):
        if not isinstance(data, dict):
            return data

        payload = dict(data)

        raw_type = payload.get("volunteer_type")
        normalized_type = (str(raw_type).strip().lower() if raw_type is not None else "")
        type_aliases = dict(PRIMARY_VOLUNTEER_ALIAS_MAP)
        normalized_type = type_aliases.get(normalized_type, normalized_type)

        raw_role = payload.get("role")
        normalized_role = (str(raw_role).strip().lower() if raw_role is not None else "")

        if normalized_role == "surfer":
            normalized_role = "participant"

        if normalized_type:
            if normalized_type in {"surfer", "participant"}:
                if not normalized_role or normalized_role == "participant":
                    normalized_role = "participant"
                    payload["volunteer_type"] = None
            elif normalized_type in VOLUNTEER_GROUP_LABELS:
                normalized_role = "volunteer"
                payload["volunteer_type"] = None
            elif normalized_type in PRIMARY_VOLUNTEER_TYPES:
                if not normalized_role or normalized_role == "volunteer":
                    normalized_role = "volunteer"
                    payload["volunteer_type"] = normalized_type

        if not normalized_role:
            normalized_role = "participant"

        if normalized_role != "volunteer":
            payload["volunteer_type"] = None
            payload["volunteer_additional_types"] = []
            payload["volunteer_is_versatile"] = False
        else:
            payload["requires_assistance"] = False

        if normalized_role:
            payload["role"] = normalized_role

        return payload

    @field_validator("volunteer_type")
    @classmethod
    def normalize_public_primary_volunteer_type(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_primary_volunteer_type(value)

    @field_validator("volunteer_additional_types")
    @classmethod
    def normalize_public_additional_roles(cls, value: Optional[list[str]]) -> list[str]:
        return _normalize_roles(value, ADDITIONAL_VOLUNTEER_TYPES)

    model_config = ConfigDict(from_attributes=True)


class PublicRegistrationWaiverOut(BaseModel):
    """Waiver-continuation info for the canonical public registration response.

    `token` is the raw (unhashed) signing token — the same value an admin
    would otherwise send a participant via WaiverDelivery — returned directly
    here so the client can continue straight into the existing public signing
    page in the same browser session. Only ever populated on the response
    to the registration call that issued it; never persisted or re-served.
    """

    required: bool
    token: Optional[str] = None
    signing_path: Optional[str] = None
    expires_at: Optional[datetime] = None


class PublicRegistrationOut(BaseModel):
    participant: ParticipantOut
    waiver: PublicRegistrationWaiverOut


class MyRegistrationEventOut(BaseModel):
    """Deliberately narrow — event fields relevant to a registration summary
    card only, no administrative fields."""

    id: UUID
    title: str
    slug: str
    start_date: date
    end_date: Optional[date] = None
    location: EventLocation


class MyRegistrationOut(BaseModel):
    """"My Registrations" card shape — no administrative fields (no notes,
    no removal metadata, no waiver-verifier identity, etc.)."""

    id: UUID
    is_waitlisted: bool
    checked_in: bool
    waiver_status: Literal["not_required", "pending", "signed"]
    created_at: datetime
    event: MyRegistrationEventOut
