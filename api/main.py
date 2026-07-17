from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db.session import engine
from api.db.base import Base

# Import models so SQLAlchemy registers them
import api.models.events
import api.models.event_templates
import api.models.participants
import api.models.participant_waivers
import api.models.participant_removal_log
import api.models.waiver_audit_events
import api.models.waiver_signing_tokens
import api.models.waiver_pdf_artifacts
import api.models.waiver_deliveries
import api.models.waiver_templates
import api.models.admin_audit_events
import api.models.automation_workflows
import api.models.automation_runs
import api.models.volunteer_profiles
import api.models.volunteer_availabilities
import api.models.volunteer_assignments
import api.models.communication_templates
import api.models.communication_messages
import api.models.communication_deliveries
import api.models.reminder_definitions
import api.models.reminder_audit_events
import api.models.reminder_execution_queue
import api.models.notification_delivery_attempts
import api.models.notification_delivery_events
import api.models.message_templates
import api.models.message_template_versions
import api.models.event_operations
import api.models.notification_read_state
import api.services.email_delivery
import api.models.users
import api.models.sessions
import api.models.event_activity_log
import api.models.feedback
import api.models.telemetry_records

# Create tables
Base.metadata.create_all(bind=engine)
print("✅ Tables created at startup")

# Routers
from api.routers.events import router as events_router
from api.routers.events import public_router as public_events_router
from api.routers.auth import router as auth_router
from api.routers.admin_events import router as admin_events_router
from api.routers.admin_event_templates import router as admin_event_templates_router
from api.routers.admin_waiver_templates import router as admin_waiver_templates_router
from api.routers.admin_participants import router as admin_participants_router
from api.routers.admin_analytics import router as admin_analytics_router
from api.routers.admin_audit import router as admin_audit_router
from api.routers.admin_permissions import router as admin_permissions_router
from api.routers.admin_automation import router as admin_automation_router
from api.routers.admin_volunteers import router as admin_volunteers_router
from api.routers.admin_communications import router as admin_communications_router
from api.routers.admin_event_operations import router as admin_event_operations_router
from api.routers.admin_dashboard import router as admin_dashboard_router
from api.routers.notification_read_state import router as notification_read_state_router
from api.routers.waivers import router as waivers_router
from api.ws_manager import router as ws_router
from api.routers.feedback import router as feedback_router
from api.services.automation_engine import register_default_workflow_handlers

from api.config import settings

app = FastAPI(redirect_slashes=False)
register_default_workflow_handlers()

if settings.IS_PRODUCTION:
    configured_prod_origins = settings.CORS_ORIGINS or []
    allowed_origins = list(dict.fromkeys(configured_prod_origins + settings.DEFAULT_PROD_CORS_ORIGINS))
elif settings.CORS_ORIGINS:
    allowed_origins = settings.CORS_ORIGINS
else:
    allowed_origins = settings.DEFAULT_DEV_CORS_ORIGINS

allowed_origin_regex = (
    r"^http://(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(:\d+)?$"
    if settings.DEBUG
    else None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(events_router, prefix="/api")
app.include_router(public_events_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_events_router, prefix="/api")
app.include_router(admin_event_templates_router, prefix="/api")
app.include_router(admin_waiver_templates_router, prefix="/api")
app.include_router(admin_participants_router, prefix="/api")
app.include_router(admin_analytics_router, prefix="/api")
app.include_router(admin_audit_router, prefix="/api")
app.include_router(admin_permissions_router, prefix="/api")
app.include_router(admin_automation_router, prefix="/api")
app.include_router(admin_volunteers_router, prefix="/api")
app.include_router(admin_communications_router, prefix="/api")
app.include_router(admin_event_operations_router, prefix="/api")
app.include_router(admin_dashboard_router, prefix="/api")
app.include_router(notification_read_state_router, prefix="/api")
app.include_router(waivers_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")


def _enforce_startup_guardrails() -> None:
    if settings.IS_PRODUCTION and settings.DEBUG:
        raise RuntimeError("Unsafe startup configuration: DEBUG cannot be enabled in production.")

    if not settings.DEV_ROUTES_ENABLED:
        dev_auth_routes = [
            route.path
            for route in app.routes
            if route.path.startswith("/api/auth/dev/")
        ]
        if dev_auth_routes:
            raise RuntimeError(
                "Unsafe startup configuration: dev auth routes are registered in production mode: "
                + ", ".join(dev_auth_routes)
            )


_enforce_startup_guardrails()

# Root routes
@app.get("/")
def root():
    return {"status": "SFA backend running"}

if settings.DEV_ROUTES_ENABLED:
    @app.get("/debug/routes")
    def list_routes():
        return [route.path for route in app.routes]