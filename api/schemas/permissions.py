from pydantic import BaseModel


class PermissionsMatrixOut(BaseModel):
    roles: dict[str, list[str]]


class CurrentUserPermissionsOut(BaseModel):
    user_id: str
    role: str
    permissions: list[str]