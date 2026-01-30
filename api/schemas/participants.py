from pydantic import BaseModel, EmailStr


class ParticipantCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    role: str
    is_minor: bool = False


class ParticipantOut(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: EmailStr
