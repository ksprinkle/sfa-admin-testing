import { TOKEN_STORAGE_KEY, clearAuthSession } from "./auth"
import { getApiBase } from "./baseUrl"

const API_BASE = getApiBase().replace(/\/+$/, "")

function joinApiUrl(path) {
  const normalizedPath = String(path || "")
  return `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json",
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(joinApiUrl(path), {
    ...options,
    cache: "no-store",
    headers,
  })

  if (res.status === 401) {
    console.warn("Token expired or invalid — logging out")
    clearAuthSession()
    const loginUrl = new URL("login", window.location.href)
    window.location.href = loginUrl.toString()
  }

  return res
}