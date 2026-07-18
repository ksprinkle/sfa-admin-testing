// Minimal, isolated session handling for the participant portal. Deliberately
// separate localStorage keys and a separate change event from
// admin-app/src/api/auth.js's ("token" / "auth.profile" / "auth:changed") —
// the portal and admin route trees are architecturally isolated (see App.jsx,
// ARCHITECTURE_OVERVIEW.md's Frontend Architecture section), and sharing
// state would mean a participant session accidentally also looking "logged
// in" to the admin shell, or vice versa.

import { getApiBase } from "./baseUrl"

const API_BASE = getApiBase().replace(/\/+$/, "")

function joinApiUrl(path) {
  const normalizedPath = String(path || "")
  return `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`
}

const PORTAL_TOKEN_STORAGE_KEY = "portal.token"
const PORTAL_PROFILE_STORAGE_KEY = "portal.profile"
const PORTAL_AUTH_CHANGED_EVENT = "portal-auth:changed"

function emitPortalAuthChanged() {
  window.dispatchEvent(new window.CustomEvent(PORTAL_AUTH_CHANGED_EVENT))
}

export function getPortalAuthChangedEventName() {
  return PORTAL_AUTH_CHANGED_EVENT
}

export function getStoredPortalToken() {
  return localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)
}

export function getStoredPortalProfile() {
  const raw = localStorage.getItem(PORTAL_PROFILE_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearPortalSession() {
  localStorage.removeItem(PORTAL_TOKEN_STORAGE_KEY)
  localStorage.removeItem(PORTAL_PROFILE_STORAGE_KEY)
  emitPortalAuthChanged()
}

function savePortalSession(token, profile) {
  localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, token)
  if (profile) {
    localStorage.setItem(PORTAL_PROFILE_STORAGE_KEY, JSON.stringify(profile))
  }
  emitPortalAuthChanged()
}

// Reuses the existing OAuth2-password /api/auth/login endpoint as-is — the
// same one admin-app/src/pages/Login.jsx uses, no backend change. Any
// account that authenticates successfully can sign in here; pages that need
// participant-only data (e.g. PortalMyRegistrations' GET /api/participants/mine)
// already enforce that server-side via the participants.view_own permission
// (api/services/authorization.py), so nothing further needs checking here.
export async function loginParticipant(email, password) {
  const formData = new URLSearchParams()
  formData.append("username", email)
  formData.append("password", password)

  const res = await fetch(joinApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  })

  if (!res.ok) {
    let message = "Invalid email or password."
    try {
      const errorBody = await res.json()
      if (errorBody?.detail) message = errorBody.detail
    } catch {
      // Keep the default message when the response body isn't JSON.
    }
    throw new Error(message)
  }

  const data = await res.json()
  const profile = await fetchPortalProfile(data.access_token)
  savePortalSession(data.access_token, profile)
  return profile
}

async function fetchPortalProfile(token) {
  const res = await fetch(joinApiUrl("/api/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  if (!res.ok) return null
  return res.json()
}
