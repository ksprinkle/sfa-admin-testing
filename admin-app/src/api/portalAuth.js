// Minimal, isolated token storage for the participant portal. Deliberately a
// separate localStorage key from admin-app/src/api/auth.js's TOKEN_STORAGE_KEY
// ("token") — the portal and admin route trees are architecturally isolated
// (see App.jsx, ARCHITECTURE_OVERVIEW.md's Frontend Architecture section),
// and sharing one key would mean a participant session accidentally also
// looking "logged in" to the admin shell, or vice versa.
//
// There is no participant login form yet (PortalLogin.jsx is still a
// placeholder) — this only reads/clears whatever a future login flow will
// store here, so "My Registrations" can already tell an authenticated
// session apart from an anonymous one.

const PORTAL_TOKEN_STORAGE_KEY = "portal.token"

export function getStoredPortalToken() {
  return localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)
}

export function clearPortalSession() {
  localStorage.removeItem(PORTAL_TOKEN_STORAGE_KEY)
}
