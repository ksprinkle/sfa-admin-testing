from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.session import DATABASE_URL, engine
from db.base import Base
from sqlalchemy import create_engine
from fastapi.middleware.cors import CORSMiddleware

# Import models so SQLAlchemy registers them
from models import events, participants

# Import routers
from routers import events as events_router
from routers import auth
from routers import admin_events
from routers import admin_participants

app = FastAPI(redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_participants.router, prefix="/admin", tags=["Admin Participants"])
app.include_router(admin_events.router)
app.include_router(events_router.router)
app.include_router(auth.router)

origins = [
    "http://localhost:5173",
]

# Force OpenAPI schema to rebuild on reload, otherwise it may not reflect changes in the code
app.openapi_schema = None

engine = create_engine(DATABASE_URL, echo=True)

Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"status": "SFA backend running"}

@app.get("/debug/routes")
def list_routes():
    return [route.path for route in app.routes]