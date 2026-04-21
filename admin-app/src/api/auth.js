const API_BASE = "http://localhost:8000"

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
    throw new Error("Invalid credentials")
  }

  return res.json()
}