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

    class Config:
        from_attributes = True


class UserRoleByEmailUpdateRequest(BaseModel):
    email: EmailStr
    new_role: str