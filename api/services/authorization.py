from __future__ import annotations

from collections.abc import Mapping

from api.models.users import User


ROLE_PARTICIPANT = "participant"
ROLE_ADMIN = "admin"

PERMISSION_ADMIN_ACCESS = "admin.access"
PERMISSION_EVENTS_MANAGE = "events.manage"
PERMISSION_PARTICIPANTS_MANAGE = "participants.manage"
PERMISSION_WAIVERS_MANAGE = "waivers.manage"
PERMISSION_ANALYTICS_READ = "analytics.read"
PERMISSION_AUDIT_READ = "audit.read"
PERMISSION_PERMISSIONS_MANAGE = "permissions.manage"
PERMISSION_AUTOMATION_MANAGE = "automation.manage"
PERMISSION_VOLUNTEERS_MANAGE = "volunteers.manage"
PERMISSION_COMMUNICATIONS_MANAGE = "communications.manage"
PERMISSION_EVENT_OPERATIONS_MANAGE = "event_operations.manage"

# Participant-portal self-service permissions: scoped to the caller's own
# records only. Row-level ownership (participant.user_id == current_user.id)
# is enforced separately, in the service layer — these strings only gate
# whether the participant role can reach the self-service endpoints at all,
# the same way the *.manage permissions gate admin endpoints.
PERMISSION_PARTICIPANTS_VIEW_OWN = "participants.view_own"
PERMISSION_WAIVERS_VIEW_OWN = "waivers.view_own"


ROLE_PERMISSIONS: dict[str, set[str]] = {
    ROLE_PARTICIPANT: {
        PERMISSION_PARTICIPANTS_VIEW_OWN,
        PERMISSION_WAIVERS_VIEW_OWN,
    },
    ROLE_ADMIN: {
        PERMISSION_ADMIN_ACCESS,
        PERMISSION_EVENTS_MANAGE,
        PERMISSION_PARTICIPANTS_MANAGE,
        PERMISSION_WAIVERS_MANAGE,
        PERMISSION_ANALYTICS_READ,
        PERMISSION_AUDIT_READ,
        PERMISSION_PERMISSIONS_MANAGE,
        PERMISSION_AUTOMATION_MANAGE,
        PERMISSION_VOLUNTEERS_MANAGE,
        PERMISSION_COMMUNICATIONS_MANAGE,
        PERMISSION_EVENT_OPERATIONS_MANAGE,
    },
}


def get_supported_roles() -> tuple[str, ...]:
    return tuple(sorted(ROLE_PERMISSIONS.keys()))


def is_supported_role(role: str) -> bool:
    return normalize_role(role) in ROLE_PERMISSIONS


def normalize_role(role: str | None) -> str:
    return (role or ROLE_PARTICIPANT).strip().lower() or ROLE_PARTICIPANT


def permissions_for_role(role: str | None) -> set[str]:
    normalized = normalize_role(role)
    return set(ROLE_PERMISSIONS.get(normalized, set()))


def has_permission(user: User, permission: str) -> bool:
    requested = permission.strip().lower()
    return requested in permissions_for_role(user.role)


def get_authorization_matrix() -> Mapping[str, list[str]]:
    return {
        role: sorted(permissions)
        for role, permissions in sorted(ROLE_PERMISSIONS.items(), key=lambda item: item[0])
    }