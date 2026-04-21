from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.session import DATABASE_URL, engine
from db.base import Base
from sqlalchemy import create_engine
from fastapi.middleware.cors import CORSMiddleware

# Import models so SQLAlchemy registers them
from models import events, participants

# Import routers


from routers.events import router as events_router
from routers.auth import router as auth_router
from routers.admin_events import router as admin_events_router
from routers.admin_participants import router as admin_participants_router
from ws_manager import router as ws_router

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



# Register all routers
app.include_router(events_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_events_router, prefix="/api")
app.include_router(admin_participants_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

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