from pydantic import BaseModel, Field


class NotificationReadStateOut(BaseModel):
    notification_keys: list[str]


class NotificationReadStateUpsertIn(BaseModel):
    notification_keys: list[str] = Field(default_factory=list, max_length=1000)
