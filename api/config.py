import os
from pathlib import Path

from dotenv import load_dotenv


# Bootstrap local configuration early so Settings reads .env values by default.
# `override=False` preserves deployed environment variables as source of truth.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
LEGACY_API_ENV_FILE = PROJECT_ROOT / "api" / ".env"

load_dotenv(ROOT_ENV_FILE, override=False)

# Compatibility fallback while local setups migrate env files to repository root.
if not ROOT_ENV_FILE.exists() and LEGACY_API_ENV_FILE.exists():
    load_dotenv(LEGACY_API_ENV_FILE, override=False)


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

    # In production, require DATABASE_URL and forbid SQLite fallback.
    # In local development/non-production, allow SQLite fallback for convenience.
    if IS_PRODUCTION and not _RAW_DATABASE_URL:
        raise ValueError(
            "DATABASE_URL environment variable is required in production. "
            "SQLite fallback is disabled in production."
        )

    if IS_PRODUCTION and _RAW_DATABASE_URL and _RAW_DATABASE_URL.startswith("sqlite"):
        raise ValueError(
            f"SQLite is not allowed in production. "
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

    # Also used to build links back to the frontend (e.g. the email verification
    # link) that need to reach it directly, not just as an allowed CORS origin.
    PUBLIC_WEB_ORIGIN = _normalize_origin(os.getenv("PUBLIC_WEB_ORIGIN", "https://ksprinkle.github.io"))

    # Production fallback so GitHub Pages frontend can call Render API even when
    # CORS_ORIGINS is not explicitly configured yet.
    DEFAULT_PROD_CORS_ORIGINS = [PUBLIC_WEB_ORIGIN]

    # Email provider selection stays in configuration, not business logic.
    EMAIL_PROVIDER_KEY = os.getenv("EMAIL_PROVIDER_KEY", "email.noop")
    EMAIL_DEFAULT_SENDER = os.getenv("EMAIL_DEFAULT_SENDER", "no-reply@example.com")
    SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
    SMTP_FROM_ADDRESS = os.getenv("SMTP_FROM_ADDRESS", EMAIL_DEFAULT_SENDER)
    SMTP_USE_TLS = _is_truthy(os.getenv("SMTP_USE_TLS", "true"))
    SMTP_USE_SSL = _is_truthy(os.getenv("SMTP_USE_SSL", "false"))
    SMTP_REQUIRE_AUTH = _is_truthy(os.getenv("SMTP_REQUIRE_AUTH", "true"))
    SMTP_TIMEOUT_SECONDS = float(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))

    CANONICAL_SIGNING_ORIGIN = _resolve_canonical_signing_origin(is_production=IS_PRODUCTION)
    BACKEND_SECRET_KEY = _resolve_backend_secret_key(is_production=IS_PRODUCTION)
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

settings = Settings()