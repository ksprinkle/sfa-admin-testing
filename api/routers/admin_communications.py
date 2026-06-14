from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.schemas.communications import (
    CommunicationDeliveryCreateIn,
    CommunicationDeliveryOut,
    CommunicationMessageCreateIn,
    CommunicationMessageOut,
    CommunicationTemplateCreateIn,
    CommunicationTemplateOut,
    CommunicationTemplateSetActiveIn,
)
from api.services.authorization import PERMISSION_COMMUNICATIONS_MANAGE
from api.services.communication_delivery import list_delivery_provider_keys
from api.services.communications_platform import (
    create_message,
    create_template,
    deliver_message_to_recipient,
    list_deliveries,
    list_messages,
    list_templates,
    update_template_active_state,
)


router = APIRouter(prefix="/admin/communications", tags=["Admin Communications"])


@router.get("/providers")
def get_delivery_providers(_current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE))):
    return {"providers": list_delivery_provider_keys()}


@router.post("/templates", response_model=CommunicationTemplateOut, status_code=201)
def create_communication_template(
    payload: CommunicationTemplateCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return create_template(
        db,
        template_key=payload.template_key,
        name=payload.name,
        channel=payload.channel,
        subject_template=payload.subject_template,
        body_template=payload.body_template,
        actor_user_id=current_user.id,
    )


@router.get("/templates", response_model=list[CommunicationTemplateOut])
def get_communication_templates(
    channel: str | None = None,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return list_templates(db, channel=channel)


@router.put("/templates/{template_id}/active-state", response_model=CommunicationTemplateOut)
def set_communication_template_active_state(
    template_id: UUID,
    payload: CommunicationTemplateSetActiveIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return update_template_active_state(
        db,
        template_id=template_id,
        is_active=payload.is_active,
        actor_user_id=current_user.id,
    )


@router.post("/messages", response_model=CommunicationMessageOut, status_code=201)
def create_communication_message(
    payload: CommunicationMessageCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return create_message(
        db,
        template_id=payload.template_id,
        channel=payload.channel,
        audience_type=payload.audience_type,
        audience_filter=payload.audience_filter,
        subject=payload.subject,
        body=payload.body,
        actor_user_id=current_user.id,
    )


@router.get("/messages", response_model=list[CommunicationMessageOut])
def get_communication_messages(
    channel: str | None = None,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return list_messages(db, channel=channel)


@router.post("/messages/{message_id}/deliveries", response_model=CommunicationDeliveryOut, status_code=202)
def create_communication_delivery(
    message_id: UUID,
    payload: CommunicationDeliveryCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return deliver_message_to_recipient(
        db,
        message_id=message_id,
        recipient=payload.recipient,
        provider_key=payload.provider_key,
        actor_user_id=current_user.id,
    )


@router.get("/deliveries", response_model=list[CommunicationDeliveryOut])
def get_communication_deliveries(
    message_id: UUID | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_COMMUNICATIONS_MANAGE)),
):
    return list_deliveries(db, message_id=message_id, status=status)