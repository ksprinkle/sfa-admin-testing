import os
from pathlib import Path


def _split_csv(value: str):
    return [item.strip() for item in value.split(",") if item.strip()]


def _is_truthy(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _detect_production_environment() -> bool:
    explicit_env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "")).strip().lower()
    if explicit_env in {"prod", "production"}:
        return True

    # Render sets this in production and preview services.
    return _is_truthy(os.getenv("RENDER", "false"))


def _resolve_backend_secret_key(*, is_production: bool) -> str:
    configured = os.getenv("BACKEND_SECRET_KEY", os.getenv("SECRET_KEY", "")).strip()
    insecure_values = {
        "dev-secret-key",
        "dev-secret-key-local-only",
        "secret",
        "changeme",
    }

    if is_production:
        if not configured:
            raise ValueError(
                "BACKEND_SECRET_KEY (or SECRET_KEY) is required in production. "
                "Refusing to start without an explicit signing secret."
            )

        if configured.lower() in insecure_values or len(configured) < 32:
            raise ValueError(
                "Invalid production signing secret. Configure BACKEND_SECRET_KEY with a strong "
                "value (minimum 32 characters, not a known development default)."
            )

        return configured

    # Development policy: fallback is permitted only outside production.
    return configured or "dev-secret-key-local-only"


def _normalize_origin(value: str) -> str:
    origin = (value or "").strip().rstrip("/")
    if not origin:
        return ""

    if not (origin.startswith("http://") or origin.startswith("https://")):
        raise ValueError(
            "CANONICAL_SIGNING_ORIGIN must include protocol (http:// or https://)."
        )

    return origin


def _resolve_canonical_signing_origin(*, is_production: bool) -> str:
    configured = _normalize_origin(os.getenv("CANONICAL_SIGNING_ORIGIN", ""))
    if configured:
        return configured

    # Render provides a public external URL that can be used as canonical origin.
    render_external = _normalize_origin(os.getenv("RENDER_EXTERNAL_URL", ""))
    if render_external:
        return render_external

    if is_production:
        raise ValueError(
            "CANONICAL_SIGNING_ORIGIN (or RENDER_EXTERNAL_URL) is required in production to build public signing URLs."
        )

    # Development fallback for local backend runs.
    return "http://127.0.0.1:8000"

class Settings:
    DEBUG = _is_truthy(os.getenv("DEBUG", "false"))
    IS_PRODUCTION = _detect_production_environment()
    DEV_ROUTES_ENABLED = DEBUG and not IS_PRODUCTION

    if IS_PRODUCTION and DEBUG:
        raise ValueError(
            "Unsafe configuration: DEBUG=true is not allowed when running in production environment. "
            "Set DEBUG=false to start the application."
        )

    _DEFAULT_SQLITE_PATH = Path(__file__).resolve().parent.parent / "sfa.db"
    _RAW_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

    # In production (DEBUG=false), require PostgreSQL and forbid SQLite fallback.
    # In local development (DEBUG=true), allow SQLite fallback for convenience.
    if not DEBUG and not _RAW_DATABASE_URL:
        raise ValueError(
            "DATABASE_URL environment variable is required in production (DEBUG=false). "
            "SQLite fallback is disabled in production."
        )

    if not DEBUG and _RAW_DATABASE_URL and _RAW_DATABASE_URL.startswith("sqlite"):
        raise ValueError(
            f"SQLite is not allowed in production (DEBUG=false). "
            f"Received DATABASE_URL: {_RAW_DATABASE_URL}. "
            f"Use PostgreSQL instead."
        )

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

    CANONICAL_SIGNING_ORIGIN = _resolve_canonical_signing_origin(is_production=IS_PRODUCTION)
    BACKEND_SECRET_KEY = _resolve_backend_secret_key(is_production=IS_PRODUCTION)
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

settings = Settings()