from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.models.notification_read_state import NotificationReadState


def list_read_notification_keys(db: Session, *, user_id: str) -> list[str]:
    rows = (
        db.query(NotificationReadState.notification_key)
        .filter(NotificationReadState.user_id == user_id)
        .all()
    )
    return [key for (key,) in rows]


def upsert_read_notification_keys(db: Session, *, user_id: str, notification_keys: list[str]) -> list[str]:
    normalized_keys = sorted({key.strip() for key in notification_keys if key and key.strip()})

    if normalized_keys:
        existing_keys = {
            key
            for (key,) in db.query(NotificationReadState.notification_key)
            .filter(
                NotificationReadState.user_id == user_id,
                NotificationReadState.notification_key.in_(normalized_keys),
            )
            .all()
        }

        for key in normalized_keys:
            if key not in existing_keys:
                db.add(NotificationReadState(user_id=user_id, notification_key=key))

        try:
            db.commit()
        except IntegrityError:
            # A concurrent request for the same user/key already inserted it — the row
            # exists either way, which is exactly what an idempotent "mark read" wants.
            db.rollback()

    return list_read_notification_keys(db, user_id=user_id)
