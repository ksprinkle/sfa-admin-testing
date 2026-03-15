from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine

from api.db.session import DATABASE_URL, engine
from api.db.base import Base

# Import models so SQLAlchemy registers them
from api.models import events, participants

# Import routers
from api.routers import events as events_router
from api.routers import auth
from api.routers import admin_events
from api.routers import admin_participants

app = FastAPI(redirect_slashes=False)
# Force OpenAPI schema to rebuild on reload, otherwise it may not reflect changes in the code
app.openapi_schema = None

engine = create_engine(DATABASE_URL, echo=True)

Base.metadata.create_all(bind=engine)

app.include_router(admin_events.router)
app.include_router(admin_participants.router)
app.include_router(events_router.router)
app.include_router(auth.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "SFA backend running"}

@app.get("/debug/routes")
def list_routes():
    return [route.path for route in app.routes]