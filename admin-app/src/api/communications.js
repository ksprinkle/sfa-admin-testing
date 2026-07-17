import { apiFetch } from "./api"

export async function fetchCommunicationTemplates() {
  const res = await apiFetch("/api/admin/communications/templates")

  if (!res.ok) {
    throw new Error("Failed to fetch communication templates")
  }

  return res.json()
}

export async function fetchCommunicationMessages() {
  const res = await apiFetch("/api/admin/communications/messages")

  if (!res.ok) {
    throw new Error("Failed to fetch communication messages")
  }

  return res.json()
}

export async function fetchCommunicationDeliveries() {
  const res = await apiFetch("/api/admin/communications/deliveries")

  if (!res.ok) {
    throw new Error("Failed to fetch communication deliveries")
  }

  return res.json()
}

export async function sendCommunicationMessage(payload) {
  const res = await apiFetch("/api/admin/communications/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to send message")
  }

  return res.json()
}

export async function updateCommunicationMessage(messageId, payload) {
  const res = await apiFetch(`/api/admin/communications/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to update message")
  }

  return res.json()
}