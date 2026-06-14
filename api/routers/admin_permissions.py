from fastapi import APIRouter, Depends

from api.dependencies import get_current_user, require_admin
from api.models.users import User
from api.schemas.permissions import CurrentUserPermissionsOut, PermissionsMatrixOut
from api.services.authorization import get_authorization_matrix, permissions_for_role


router = APIRouter(
    prefix="/admin/permissions",
    tags=["Admin Permissions"],
)


@router.get("/matrix", response_model=PermissionsMatrixOut)
def get_permissions_matrix(_current_user=Depends(require_admin)):
    return {"roles": get_authorization_matrix()}


@router.get("/me", response_model=CurrentUserPermissionsOut)
def get_my_permissions(current_user: User = Depends(get_current_user)):
    return {
        "user_id": current_user.id,
        "role": current_user.role,
        "permissions": sorted(permissions_for_role(current_user.role)),
    }