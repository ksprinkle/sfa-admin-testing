import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.db.session import engine
from api.db.base import Base

# Import models so SQLAlchemy registers them
from api.db.session import SessionLocal

# 🔥 import ALL models explicitly
import api.models.events
import api.models.event_templates
import api.models.participants
import api.models.participant_removal_log
import api.models.users   # <-- THIS is critical
import api.models.sessions
import api.models.event_activity_log
import api.models.feedback      # <-- Don't forget to import the Feedback model 

# 👇 CREATE TABLES
Base.metadata.create_all(bind=engine)

from db.session import SessionLocal
from models.users import User
from security import get_password_hash

from db.session import SessionLocal
from models.users import User
from security import get_password_hash

# def seed_admin():
#     db = SessionLocal()

#     existing = db.query(User).filter(User.email == "admin@example.com").first()
#     if not existing:
#         user = User(
#             email="admin@example.com",
#             hashed_password=get_password_hash("password123"),
#             role="admin",
#             is_active=True
#         )
#         db.add(user)
#         db.commit()
#         print("✅ Admin user created")
#     else:
#         print("ℹ️ Admin already exists")

#     db.close()

# seed_admin()

print("✅ Tables created at startup")


# Import routers
from api.routers.events import router as events_router
from api.routers.events import public_router as public_events_router
from api.routers.auth import router as auth_router
from api.routers.admin_events import router as admin_events_router
from api.routers.admin_event_templates import router as admin_event_templates_router
from api.routers.admin_participants import router as admin_participants_router
from api.ws_manager import router as ws_router
from api.routers.feedback import router as feedback_router
from api.config import settings

app = FastAPI(redirect_slashes=False)

allowed_origins = settings.CORS_ORIGINS or settings.DEFAULT_DEV_CORS_ORIGINS
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



# Register all routers
app.include_router(events_router, prefix="/api")
app.include_router(public_events_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_events_router, prefix="/api")
app.include_router(admin_event_templates_router, prefix="/api")
app.include_router(admin_participants_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")

# Force OpenAPI schema to rebuild on reload, otherwise it may not reflect changes in the code
app.openapi_schema = None

# Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"status": "SFA backend running"}

@app.get("/debug/routes")
def list_routes():
    return [route.path for route in app.routes]