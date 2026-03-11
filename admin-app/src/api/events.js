import { apiFetch } from "./api"

const API = "http://localhost:8000"

function authHeaders() {
  const token = localStorage.getItem("token")

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  }
}

export async function createEvent(data) {
  const res = await apiFetch("/admin/events/", {
    method: "POST",
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    throw new Error("Failed to create event")
  }

  return res.json()
}

export async function fetchEvents() {
  const res = await apiFetch("/admin/events/")

  if (!res.ok) {
    throw new Error("Failed to fetch events")
  }

  return res.json()
}

export async function archiveEvent(eventId) {
  const res = await apiFetch(`/admin/events/${eventId}`, {
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
  const res = await apiFetch(`/admin/events/${eventId}`, {
    method: "DELETE"
  })

  if (!res.ok) {
    throw new Error("Failed to delete event")
  }

  return res.json()
}

  export async function fetchEventParticipants(eventId) {
  const res = await apiFetch(`/admin/participants/event/${eventId}`)

  if (!res.ok) {
    throw new Error("Failed to fetch participants")
  }

  return res.json()
}

 export async function fetchAllParticipants() {
  const res = await apiFetch("/admin/participants")

  if (!res.ok) {
    throw new Error("Failed to fetch participants")
  }

  return res.json()
}

export async function checkInParticipant(participantId) {
  const res = await apiFetch(
    `/admin/participants/${participantId}/checkin`,
    { method: "PATCH" }
  )

  if (!res.ok) {
    throw new Error("Failed to check in participant")
  }

  return res.json()
}