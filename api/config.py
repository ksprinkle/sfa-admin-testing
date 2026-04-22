import os


def _split_csv(value: str):
    return [item.strip() for item in value.split(",") if item.strip()]

class Settings:
    DEBUG = os.getenv("DEBUG", "true").lower() == "true"
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sfa.db")

    # Comma-separated list, e.g. "https://admin.example.com,https://staging.example.com"
    CORS_ORIGINS = _split_csv(os.getenv("CORS_ORIGINS", ""))

    # Keep local dev origins open by default, lock down in production by setting CORS_ORIGINS.
    DEFAULT_DEV_CORS_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    BACKEND_SECRET_KEY = os.getenv("BACKEND_SECRET_KEY", os.getenv("SECRET_KEY", "dev-secret-key"))
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

settings = Settings()