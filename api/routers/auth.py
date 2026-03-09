from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from api.db.session import get_db
from api.dependencies import get_current_user
from api.models.user import User
from api.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register")
def register(email: str, password: str, db: Session = Depends(get_db)):

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(password),
        role="participant"
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "User created successfully"}

from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends

@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }

from api.schemas.users import UserResponse

@router.get("/me", response_model=UserResponse)
def get_me(current_user = Depends(get_current_user)):
    return current_user
    
from api.dependencies import require_admin
from api.schemas.users import UserResponse
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException
from api.db.session import get_db
from api.models.user import User


@router.put("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    new_role: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if new_role not in ["admin", "participant"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    user.role = new_role
    db.commit()
    db.refresh(user)

    return user

#Self-promotion endpoint for testing purposes only. In production, this should be removed or protected with additional checks.
@router.post("/dev/promote-me")
def promote_me(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    current_user.role = "admin"
    db.commit()
    db.refresh(current_user)
    return {"message": "Role updated to admin"}