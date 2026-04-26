import { TOKEN_STORAGE_KEY, clearAuthSession } from "./auth"

const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`
const API_BASE = import.meta.env.DEV
  ? DEFAULT_API_BASE
  : (import.meta.env.VITE_API_URL || DEFAULT_API_BASE)
console.log("API BASE:", API_BASE)

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