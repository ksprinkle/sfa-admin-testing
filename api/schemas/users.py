from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

MIN_PASSWORD_LENGTH = 8


class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
        return value

class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    email_verified_at: datetime | None = None
    # Phase 3B Slice B8: derived runtime state, computed fresh on every
    # request via api/services/capability_resolution.py - never cached or
    # persisted. None only if computing it failed (see
    # api/routers/auth.py::_resolve_capabilities_for_response) or in any
    # response shape predating this field.
    capabilities: list[str] | None = None

    class Config:
        from_attributes = True


class UserRoleByEmailUpdateRequest(BaseModel):
    email: EmailStr
    new_role: str


class VerifyEmailResendRequest(BaseModel):
    email: EmailStr


class VerifyEmailConfirmRequest(BaseModel):
    token: str