# api/init_db.py

from api.db.session import engine
from api.db.base import Base

# Import ALL models so SQLAlchemy registers them
from api.models.events import Event
from api.models.event_templates import EventTemplate
from api.models.participants import Participant
from api.models.participant_removal_log import ParticipantRemovalLog
from api.models.waiver_templates import WaiverTemplate
from api.models.users import User   # 👈 THIS is the key fix

Base.metadata.create_all(bind=engine)

print("✅ Database tables created")