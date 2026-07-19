import { getApiBase } from "./baseUrl"

const API_BASE = getApiBase().replace(/\/+$/, "")

function joinApiUrl(path) {
  const normalizedPath = String(path || "")
  return `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`
}

// Deliberately does not reuse api/api.js's apiFetch: that client attaches
// whatever bearer token happens to be in localStorage and force-redirects
// the browser to the admin /login route on a 401. Portal pages are public
// and must stay usable — and stay on /portal — regardless of any stale or
// unrelated token present in the browser.
export async function fetchPublicEvents() {
  const res = await fetch(joinApiUrl("/api/events"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error("Unable to load events right now.")
  }

  return res.json()
}

export async function fetchPublicEventBySlug(slug) {
  const res = await fetch(joinApiUrl(`/api/events/${encodeURIComponent(slug)}`), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Event not found. Check the slug and try again.")
    }
    throw new Error("Could not load event details.")
  }

  return res.json()
}

// Hits the canonical public registration endpoint (api/services/public_registration.py
// on the backend) — same endpoint the static participant-registration.html used, and
// the same one api/routers/events.py's legacy /events/{slug}/participants delegates to.
// The endpoint's auth dependency is optional (get_current_user_optional): with no token
// it registers anonymously, matching the static page; when a signed-in participant's
// token is passed, the backend links the new Participant row to that account (user_id)
// so it appears on "My Registrations" — see api/services/public_registration.py.
export async function registerParticipant(slug, payload, token) {
  const res = await fetch(joinApiUrl(`/api/public/events/${encodeURIComponent(slug)}/register`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    if (res.status === 409) {
      throw new Error("This email is already registered for this event.")
    }

    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || "Registration failed.")
  }

  return res.json()
}

// POST /api/auth/verify-email/confirm. Expected (non-exceptional) outcomes —
// verified, expired, already used, or an invalid/unrecognized token — are
// returned as a status, not thrown, since PortalVerifyEmail.jsx renders each
// as its own state rather than treating them as errors. The backend doesn't
// return a machine-readable error code, so this matches on response.detail
// text — the same pattern registerParticipant()'s 409 handling above uses.
export async function confirmEmailVerification(token) {
  const res = await fetch(joinApiUrl("/api/auth/verify-email/confirm"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
  })

  const body = await res.json().catch(() => ({}))

  if (res.ok) {
    return { status: "verified", claimedRegistrations: body?.claimed_registrations ?? 0 }
  }

  const detail = typeof body?.detail === "string" ? body.detail : ""
  if (detail.includes("expired")) return { status: "expired", claimedRegistrations: 0 }
  if (detail.includes("already been used")) return { status: "already_used", claimedRegistrations: 0 }
  return { status: "invalid", claimedRegistrations: 0 }
}

// POST /api/auth/verify-email/resend. Always returns the same generic
// message server-side regardless of whether the email exists or is already
// verified (anti-enumeration, see api/routers/auth.py) — callers should
// display that message as-is, not infer success/failure from it.
export async function resendVerificationEmail(email) {
  const res = await fetch(joinApiUrl("/api/auth/verify-email/resend"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email }),
  })

  if (res.status === 429) {
    throw new Error("Too many attempts. Please wait a few minutes before trying again.")
  }

  if (!res.ok) {
    throw new Error("Unable to resend the verification email right now.")
  }

  return res.json()
}

// GET /api/participants/mine — scoped server-side to the authenticated
// participant's own records (api/services/participant_identity.py). Unlike
// the other functions in this file, this one does require a token — it's
// the caller's responsibility (PortalMyRegistrations.jsx) to only call this
// when a stored portal token exists.
export async function fetchMyRegistrations(token) {
  const res = await fetch(joinApiUrl("/api/participants/mine"), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (res.status === 401) {
    const error = new Error("Your session has expired. Please sign in again.")
    error.status = 401
    throw error
  }

  if (!res.ok) {
    throw new Error("Unable to load your registrations right now.")
  }

  return res.json()
}
