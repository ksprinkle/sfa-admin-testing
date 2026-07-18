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
// No Authorization header: registration stays anonymous, matching the static page.
export async function registerParticipant(slug, payload) {
  const res = await fetch(joinApiUrl(`/api/public/events/${encodeURIComponent(slug)}/register`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
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
