const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`
const API_BASE = import.meta.env.DEV
  ? DEFAULT_API_BASE
  : (import.meta.env.VITE_API_URL || DEFAULT_API_BASE)

export async function login(username, password) {
  const formData = new URLSearchParams()
  formData.append("username", username)
  formData.append("password", password)

  // Use /api/auth/login to match backend
  const res = await fetch(`${API_BASE}/api/auth/login`, {
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