import os

class Settings:
    DEBUG = os.getenv("DEBUG", "true").lower() == "true"

settings = Settings()