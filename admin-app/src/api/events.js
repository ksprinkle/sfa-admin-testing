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

export async function updateEventTemplate(templateId, data) {
  const res = await apiFetch(`/api/admin/event-templates/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to update event template")
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

export async function cancelEvent(eventId, reason_code = "cancelled", reason_note = "") {
  const res = await apiFetch(`/api/admin/events/${eventId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason_code, reason_note }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to cancel event")
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

export async function saveEventAsTemplate(eventId, payload = {}) {
  const res = await apiFetch(`/api/admin/events/${eventId}/save-as-template`, {
    method: "POST",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to save event as template")
  }

  return res.json()
}

export async function deleteEvent(eventId, reason_code = "deleted", reason_note = "") {
  const res = await apiFetch(`/api/admin/events/${eventId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason_code, reason_note }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to delete event")
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

export async function fetchVolunteerDashboard(eventId = null) {
  const query = eventId ? `?event_id=${encodeURIComponent(String(eventId))}` : ""
  const res = await apiFetch(`/api/admin/participants/volunteer-dashboard${query}`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch volunteer dashboard")
  }

  return res.json()
}

export async function fetchExecutiveDashboard() {
  const res = await apiFetch("/api/admin/analytics/executive-dashboard")

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch executive dashboard")
  }

  return res.json()
}

export async function fetchDashboardDiagnosticsReport(recentActivityLimit = 5) {
  const query = `?recent_activity_limit=${encodeURIComponent(String(recentActivityLimit))}`
  const res = await apiFetch(`/api/admin/dashboard/diagnostics/report${query}`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch dashboard diagnostics report")
  }

  return res.json()
}

export async function fetchDashboardMetrics(recentActivityLimit = 8) {
  const query = `?recent_activity_limit=${encodeURIComponent(String(recentActivityLimit))}`
  const res = await apiFetch(`/api/admin/dashboard/metrics${query}`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch dashboard metrics")
  }

  return res.json()
}

export async function createAdminParticipant(payload) {
  const res = await apiFetch("/api/admin/participants/", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to create participant")
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

export async function fetchEventSessionStats(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/session-stats`)

  if (!res.ok) {
    throw new Error("Failed to fetch session stats")
  }

  return res.json()
}

export async function fetchEventOperationsTimeline(eventId) {
  const res = await apiFetch(`/api/admin/participants/events/${eventId}/operations-timeline`)

  if (!res.ok) {
    throw new Error("Failed to fetch operations timeline")
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

export async function fetchRecommendedSessions(participantId) {
  const res = await apiFetch(`/api/admin/participants/${participantId}/recommended-sessions`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch recommended sessions")
  }

  const payload = await res.json()
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.recommendations)) return payload.recommendations
  return []
}

export async function evaluateAssignment(participantId, sessionId) {
  const res = await apiFetch("/api/admin/participants/evaluate-assignment", {
    method: "POST",
    body: JSON.stringify({
      participant_id: participantId,
      session_id: sessionId,
    }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to evaluate assignment")
  }

  return res.json()
}

export async function evaluateMultipleAssignments(participantId, sessionIds) {
  const res = await apiFetch("/api/admin/participants/evaluate-multiple-assignments", {
    method: "POST",
    body: JSON.stringify({
      participant_id: participantId,
      session_ids: sessionIds,
    }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to evaluate assignments")
  }

  const data = await res.json()
  return data.results ?? {}
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

export async function fetchEventRemovalLog(filters = {}) {
  const params = new URLSearchParams()
  if (filters.action_type) params.set("action_type", filters.action_type)
  if (filters.reason_code) params.set("reason_code", filters.reason_code)
  if (filters.event_type) params.set("event_type", filters.event_type)
  if (filters.actor_email) params.set("actor_email", filters.actor_email)
  if (filters.title_search) params.set("title_search", filters.title_search)
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.limit) params.set("limit", String(filters.limit))

  const query = params.toString()
  const res = await apiFetch(`/api/admin/events/history/removal-log${query ? `?${query}` : ""}`)

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch event removal log")
  }

  return res.json()
}

export async function exportEventRemovalLogCsv(filters = {}) {
  const params = new URLSearchParams()
  if (filters.action_type) params.set("action_type", filters.action_type)
  if (filters.reason_code) params.set("reason_code", filters.reason_code)
  if (filters.event_type) params.set("event_type", filters.event_type)
  if (filters.actor_email) params.set("actor_email", filters.actor_email)
  if (filters.title_search) params.set("title_search", filters.title_search)
  if (filters.date_from) params.set("date_from", filters.date_from)
  if (filters.date_to) params.set("date_to", filters.date_to)
  if (filters.limit) params.set("limit", String(filters.limit))

  const query = params.toString()
  const res = await apiFetch(`/api/admin/events/history/removal-log/export.csv${query ? `?${query}` : ""}`, {
    headers: {
      Accept: "text/csv",
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || "Failed to export event removal log CSV")
  }

  const blob = await res.blob()
  const contentDisposition = res.headers.get("content-disposition") || ""
  const filenameMatch = contentDisposition.match(/filename=([^;]+)/i)
  const filename = (filenameMatch?.[1] || "event-removal-log.csv").replaceAll('"', "")

  return { blob, filename }
}

export async function getSessionProjection(eventId, limit = 10) {
  const res = await apiFetch(
    `/api/admin/events/${eventId}/session-projection?limit=${limit}`
  )

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to fetch session projection")
  }

  return res.json()
}

export async function getNextUnassignedParticipant(eventId) {
  const participants = await fetchEventParticipants(eventId)
  const list = Array.isArray(participants) ? participants : []

  const unassigned = list.filter(
    (p) =>
      p.session_id == null &&
      p.is_waitlisted === false &&
      p.role !== "volunteer" &&
      !p.is_removed
  )

  unassigned.sort((a, b) => {
    const pa = a.priority ?? 99
    const pb = b.priority ?? 99
    if (pa !== pb) return pa - pb
    return (a.created_at || "") < (b.created_at || "") ? -1 : 1
  })

  return unassigned[0] ?? null
}