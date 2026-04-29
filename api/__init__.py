# api/init_db.py

from db.session import engine
from db.base import Base

# Import ALL models so they register
from models import events, event_templates, participants, participant_removal_log

Base.metadata.create_all(bind=engine)

print("✅ Database tables created")