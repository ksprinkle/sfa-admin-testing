from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import events
from api.db.session import engine
from api.db.base import Base

app = FastAPI()

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

app.include_router(events.router)

Base.metadata.create_all(bind=engine)
