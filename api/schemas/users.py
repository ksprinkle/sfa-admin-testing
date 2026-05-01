from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    role: str

    class Config:
        from_attributes = True


class UserRoleByEmailUpdateRequest(BaseModel):
    email: EmailStr
    new_role: str