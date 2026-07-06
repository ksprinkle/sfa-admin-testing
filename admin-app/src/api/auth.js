import { getApiBase } from "./baseUrl"

const API_BASE = getApiBase().replace(/\/+$/, "")

export const TOKEN_STORAGE_KEY = "token"
export const PROFILE_STORAGE_KEY = "auth.profile"
const AUTH_CHANGED_EVENT = "auth:changed"

function emitAuthChanged() {
  window.dispatchEvent(new window.CustomEvent(AUTH_CHANGED_EVENT))
}

function joinApiUrl(path) {
  const normalizedPath = String(path || "")
  return `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function getStoredProfile() {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveAuthSession(token, profile = null) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  if (profile) {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  }
  emitAuthChanged()
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(PROFILE_STORAGE_KEY)
  emitAuthChanged()
}

export async function login(username, password) {
  const formData = new URLSearchParams()
  formData.append("username", username)
  formData.append("password", password)

  // Use /api/auth/login to match backend
  const res = await fetch(joinApiUrl("/api/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formData
  })

  if (!res.ok) {
    let message = "Invalid credentials"

    try {
      const errorBody = await res.json()
      if (errorBody?.detail) {
        message = errorBody.detail
      }
    } catch {
      // Keep the default message when the response body is not JSON.
    }

    throw new Error(message)
  }

  return res.json()
}

export async function fetchMyProfile(token = getStoredToken()) {
  if (!token) {
    throw new Error("Missing token")
  }

  const res = await fetch(joinApiUrl("/api/auth/me"), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    let message = "Failed to fetch profile"
    try {
      const errorBody = await res.json()
      if (errorBody?.detail) {
        message = errorBody.detail
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message)
  }

  return res.json()
}

export async function promoteUserToAdminByEmail(email, token = getStoredToken()) {
  if (!token) {
    throw new Error("Missing token")
  }

  const normalizedEmail = String(email || "").trim()
  if (!normalizedEmail) {
    throw new Error("Email is required")
  }

  const res = await fetch(joinApiUrl("/api/auth/admin/users/by-email/role-body"), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: normalizedEmail,
      new_role: "admin",
    }),
  })

  if (!res.ok) {
    let message = "Failed to promote user"
    try {
      const errorBody = await res.json()
      if (errorBody?.detail) {
        message = errorBody.detail
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message)
  }

  return res.json()
}

export function getAuthChangedEventName() {
  return AUTH_CHANGED_EVENT
}