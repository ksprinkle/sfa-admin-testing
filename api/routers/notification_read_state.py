from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import get_current_user
from api.models.users import User
from api.schemas.notification_read_state import NotificationReadStateOut, NotificationReadStateUpsertIn
from api.services.notification_read_state import list_read_notification_keys, upsert_read_notification_keys


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.get("/read-state", response_model=NotificationReadStateOut)
def get_read_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    keys = list_read_notification_keys(db, user_id=current_user.id)
    return {"notification_keys": keys}


@router.post("/read-state", response_model=NotificationReadStateOut)
def upsert_read_state(
    payload: NotificationReadStateUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    keys = upsert_read_notification_keys(db, user_id=current_user.id, notification_keys=payload.notification_keys)
    return {"notification_keys": keys}
