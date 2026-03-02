const API_BASE = "http://localhost:8000"

function getAuthHeaders() {
  const token = localStorage.getItem("token")
  return {
    "Authorization": `Bearer ${token}`
  }
}

export async function fetchEvents() {
  const res = await fetch(`${API_BASE}/events`, {
    headers: getAuthHeaders()
  })

  if (!res.ok) {
    throw new Error("Failed to fetch events")
  }

  return res.json()
}

export async function fetchEventParticipants(eventId) {
  const token = localStorage.getItem("token")

  const res = await fetch(
    `http://localhost:8000/admin/events/${eventId}/participants?checked_in=false`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  if (!res.ok) {
    throw new Error("Failed to fetch participants")
  }

  return res.json()
}