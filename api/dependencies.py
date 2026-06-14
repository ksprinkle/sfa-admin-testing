from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.models.users import User
from api.security import SECRET_KEY, ALGORITHM
from api.services.authorization import PERMISSION_ADMIN_ACCESS, has_permission


# This MUST match your login endpoint
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def require_admin(current_user: User = Depends(get_current_user)):
    if not has_permission(current_user, PERMISSION_ADMIN_ACCESS):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_permission(permission: str):
    def _permission_dependency(current_user: User = Depends(get_current_user)):
        if not has_permission(current_user, permission):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return _permission_dependency