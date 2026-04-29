import { TOKEN_STORAGE_KEY, clearAuthSession } from "./auth"

const API_BASE = import.meta.env.VITE_API_URL

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)

  const res = await fetch(`${API_BASE}${path}`, {
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