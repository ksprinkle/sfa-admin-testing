import { apiFetch } from "./api"

export async function fetchNotificationReadState() {
  const res = await apiFetch("/api/notifications/read-state")
  if (!res.ok) throw new Error(`Failed to load notification read state (HTTP ${res.status})`)
  return res.json()
}

export async function upsertNotificationReadState(notificationKeys) {
  const res = await apiFetch("/api/notifications/read-state", {
    method: "POST",
    body: JSON.stringify({ notification_keys: Array.isArray(notificationKeys) ? notificationKeys : [] }),
  })
  if (!res.ok) throw new Error(`Failed to sync notification read state (HTTP ${res.status})`)
  return res.json()
}
