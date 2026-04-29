# api/init_db.py

from db.session import engine
from db.base import Base

# Import ALL models so SQLAlchemy registers them
from models.events import Event
from models.event_templates import EventTemplate
from models.participants import Participant
from models.participant_removal_log import ParticipantRemovalLog
from models.users import User   # 👈 THIS is the key fix

Base.metadata.create_all(bind=engine)

print("✅ Database tables created")