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

export async function fetchEventTemplates() {
  const res = await apiFetch("/api/admin/event-templates")

  if (!res.ok) {
    throw new Error("Failed to fetch event templates")
  }

  return res.json()
}

export async function createEventTemplate(data) {
  const res = await apiFetch("/api/admin/event-templates", {
    method: "POST",
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to create event template")
  }

  return res.json()
}

export async function deleteEventTemplate(templateId) {
  const res = await apiFetch(`/api/admin/event-templates/${templateId}`, {
    method: "DELETE",
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to delete event template")
  }

  return res.json()
}

export async function createEventFromTemplate(templateId, date) {
  const res = await apiFetch(`/api/admin/event-templates/${templateId}/create-event`, {
    method: "POST",
    body: JSON.stringify({ date }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to create event from template")
  }

  return res.json()
}

export async function generateAnnualEventsFromTemplate(templateId, year, preview = false) {
  const res = await apiFetch(`/api/admin/event-templates/${templateId}/generate-annual`, {
    method: "POST",
    body: JSON.stringify({ year: Number(year), preview: Boolean(preview) }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to generate annual events from template")
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

export async function duplicateEvent(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/duplicate`, {
    method: "POST",
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to duplicate event")
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

export async function removeParticipant(participantId, removalReasonCode, removalReasonNote = "") {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}/action`,
    {
      method: "POST",
      body: JSON.stringify({
        action: "remove",
        removal_reason_code: removalReasonCode,
        removal_reason_note: removalReasonNote,
      }),
    }
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

export async function updateVolunteerType(participantId, volunteerType) {
  return updateParticipantType(participantId, { volunteer_type: volunteerType })
}

export async function updateParticipantType(participantId, payload) {
  const res = await apiFetch(
    `/api/admin/participants/${participantId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to update participant")
  }

  return res.json()
}

export async function fetchParticipantRemovalLog(filters = {}) {
  const params = new URLSearchParams()
  if (filters.email) params.set("email", filters.email)
  if (filters.reason_code) params.set("reason_code", filters.reason_code)
  if (filters.event_id) params.set("event_id", filters.event_id)
  if (filters.event_type) params.set("event_type", filters.event_type)
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.limit) params.set("limit", String(filters.limit))

  const query = params.toString()
  const res = await apiFetch(`/api/admin/participants/removal-log${query ? `?${query}` : ""}`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch removal log")
  }

  return res.json()
}

export async function exportParticipantRemovalLogCsv(filters = {}) {
  const params = new URLSearchParams()
  if (filters.email) params.set("email", filters.email)
  if (filters.reason_code) params.set("reason_code", filters.reason_code)
  if (filters.event_id) params.set("event_id", filters.event_id)
  if (filters.event_type) params.set("event_type", filters.event_type)
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.limit) params.set("limit", String(filters.limit))

  const query = params.toString()
  const res = await apiFetch(`/api/admin/participants/removal-log/export.csv${query ? `?${query}` : ""}`, {
    headers: {
      Accept: "text/csv",
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || "Failed to export removal log CSV")
  }

  const blob = await res.blob()
  const contentDisposition = res.headers.get("content-disposition") || ""
  const filenameMatch = contentDisposition.match(/filename=([^;]+)/i)
  const filename = (filenameMatch?.[1] || "participant-removal-log.csv").replaceAll('"', "")

  return { blob, filename }
}