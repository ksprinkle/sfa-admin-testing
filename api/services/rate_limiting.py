from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

# In-memory, per-process sliding-window limiter. No new dependency, no schema
# change. Known limitation: does not coordinate across multiple backend
# instances — acceptable for the current single-instance deployment
# (render.yaml, plan: starter); see KNOWN_TECHNICAL_DEBT.md.
_request_log: dict[tuple[str, str], deque] = defaultdict(deque)


def _client_key(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(action: str, *, max_requests: int, window_seconds: int):
    """FastAPI dependency factory. Usage:
    Depends(enforce_rate_limit("auth_register", max_requests=5, window_seconds=900))
    """

    def _dependency(request: Request) -> None:
        key = (action, _client_key(request))
        now = time.monotonic()
        window = _request_log[key]

        while window and now - window[0] > window_seconds:
            window.popleft()

        if len(window) >= max_requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

        window.append(now)

    return _dependency
