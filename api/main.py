from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.db.session import engine
from api.db.base import Base

# Import models so SQLAlchemy registers them
from api.models import events, participants

# Import routers


from api.routers.events import router as events_router
from api.routers.auth import router as auth_router
from api.routers.admin_events import router as admin_events_router
from api.routers.admin_participants import router as admin_participants_router
from api.ws_manager import router as ws_router
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
app.include_router(auth_router, prefix="/api")
app.include_router(admin_events_router, prefix="/api")
app.include_router(admin_participants_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

# Force OpenAPI schema to rebuild on reload, otherwise it may not reflect changes in the code
app.openapi_schema = None

Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"status": "SFA backend running"}

@app.get("/debug/routes")
def list_routes():
    return [route.path for route in app.routes]