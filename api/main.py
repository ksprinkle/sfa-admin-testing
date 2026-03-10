from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db.session import engine
from api.db.base import Base

# Import models so SQLAlchemy registers them
from api.models import events, participants

# Import routers
from api.routers import events as events_router
from api.routers import auth
from api.routers import admin_events

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.include_router(admin_events.router)
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