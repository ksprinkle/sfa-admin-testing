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
