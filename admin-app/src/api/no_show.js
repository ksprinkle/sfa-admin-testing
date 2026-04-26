import { apiFetch } from "./api";
// API for no-show endpoints
export async function fetchNoShowCandidates(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/no_shows`, { cache: "no-store" });
  if (res.status === 304) {
    // Treat 304 Not Modified as empty result
    return [];
  }
  if (!res.ok) throw new Error("Failed to fetch no-show candidates");
  return await res.json();
}

export async function promoteNoShowSlots(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/promote_no_shows`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to promote no-show slots")
  return await res.json()
}

export async function fetchRemovedNoShowCount(eventId) {
  const res = await apiFetch(`/api/admin/events/${eventId}/no_shows/removed_count`, { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch removed no-show count")
  const payload = await res.json().catch(() => ({}))
  return Number(payload?.count || 0)
}
