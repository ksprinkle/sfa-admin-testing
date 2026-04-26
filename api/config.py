import os
from pathlib import Path


def _split_csv(value: str):
    return [item.strip() for item in value.split(",") if item.strip()]

class Settings:
    DEBUG = os.getenv("DEBUG", "true").lower() == "true"
    _DEFAULT_SQLITE_PATH = Path(__file__).resolve().parent.parent / "sfa.db"
    _RAW_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

    # Legacy local setups sometimes export sqlite:///./api/sfa.db, which can point
    # to different files depending on process working directory and cause stale/missing data.
    if _RAW_DATABASE_URL in {"", "sqlite:///./api/sfa.db", "sqlite:///./sfa.db"}:
        DATABASE_URL = f"sqlite:///{_DEFAULT_SQLITE_PATH.as_posix()}"
    else:
        DATABASE_URL = _RAW_DATABASE_URL

    # Comma-separated list, e.g. "https://admin.example.com,https://staging.example.com"
    CORS_ORIGINS = _split_csv(os.getenv("CORS_ORIGINS", ""))

    # Keep local dev origins open by default, lock down in production by setting CORS_ORIGINS.
    DEFAULT_DEV_CORS_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    BACKEND_SECRET_KEY = os.getenv("BACKEND_SECRET_KEY", os.getenv("SECRET_KEY", "dev-secret-key"))
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

settings = Settings()