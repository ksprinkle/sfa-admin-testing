import { TOKEN_STORAGE_KEY, clearAuthSession } from "./auth"
import { getApiBase } from "./baseUrl"

const API_BASE = getApiBase().replace(/\/+$/, "")

function joinApiUrl(path) {
  const normalizedPath = String(path || "")
  return `${API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)

  const res = await fetch(joinApiUrl(path), {
    ...options,
    cache: "no-store",
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })

  if (res.status === 401) {
    console.warn("Token expired or invalid — logging out")
    clearAuthSession()
    window.location.href = "/login"
    return
  }

  return res
}