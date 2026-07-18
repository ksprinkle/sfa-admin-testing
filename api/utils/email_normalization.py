def normalize_email(email: str) -> str:
    """Canonical form used for email comparisons across auth/participant flows
    (registration dedupe, future login/verification/claim matching) — strip
    surrounding whitespace and lowercase. Does not validate format; pair with
    Pydantic's EmailStr (or equivalent) for that."""
    return (email or "").strip().lower()
