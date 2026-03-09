const API_BASE = import.meta.env.VITE_API_URL
console.log("API BASE:", API_BASE)

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token")

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })

  if (res.status === 401) {
    console.warn("Token expired or invalid — logging out")

    localStorage.removeItem("token")
    window.location.href = "/"
    return
  }

  return res
}