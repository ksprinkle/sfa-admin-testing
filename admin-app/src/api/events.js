import { apiFetch } from "./api"

const API = "http://localhost:8000"

export async function createEvent(data) {
  const res = await apiFetch("/api/admin/events/", {
    method: "POST",
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    throw new Error("Failed to create event")
  }

  return res.json()
}

export async function fetchEvents() {
  const res = await apiFetch("/api/admin/events/")

  if (!res.ok) {
    throw new Error("Failed to fetch events")
  }

  return res.json()
}

export async function archiveEvent(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify({
      status: "archived"
    })
  })

  if (!res.ok) {
    throw new Error("Failed to archive event")
  }

  return res.json()
}

export async function deleteEvent(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}`, {
    method: "DELETE"
  })

  if (!res.ok) {
    throw new Error("Failed to delete event")
  }

  return res.json()
}

export async function fetchEventParticipants(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/participants`)

  if (!res.ok) {
    throw new Error("Failed to fetch participants")
  }

  return res.json()
}



export async function fetchAllParticipants() {
  const res = await apiFetch("/api/admin/participants/")

  if (!res.ok) {
    throw new Error("Failed to fetch participants")
  }

  return res.json()
}

export async function checkInParticipant(participantId) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/checkin`,
    { method: "PATCH" }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to check in participant")
  }

  return res.json()
}

export async function promoteParticipant(participantId) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/promote`,
    { method: "PATCH" }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to promote participant")
  }

  return res.json()
}

export async function removeParticipant(participantId) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}`,
    { method: "DELETE" }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to remove participant")
  }

  return res.json()
}

export async function verifyWaiver(participantId) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/action`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "verify_waiver"
      })
    }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to verify waiver")
  }

  return res.json()
}

export async function moveParticipantToWaitlist(participantId) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/action`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "move_to_waitlist"
      })
    }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to move participant to waitlist")
  }

  return res.json()
}

export async function fetchEventSummary(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/summary`)

  if (!res.ok) {
    throw new Error("Failed to fetch event summary")
  }

  return res.json()
}

export async function fetchAdminEvent(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}`)

  if (!res.ok) {
    throw new Error("Failed to fetch event")
  }

  return res.json()
}

export async function updateParticipantSession(participantId, sessionId) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/session`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error("Server error:", text)
    throw new Error("Failed to update session")
  }

  return res.json()
}

export async function updateParticipantPriority(participantId, priority) {
  // Send priority as query param to match FastAPI signature
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/priority?priority=${priority}`,
    {
      method: "PATCH"
    }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error("Server error:", text)
    throw new Error("Failed to update priority")
  }

  return res.json()
}