import { apiFetch } from "./api"

export async function fetchAdminAuditEvents({
  domain,
  action,
  actorEmail,
  targetType,
  createdFrom,
  createdTo,
  limit,
  offset,
} = {}) {
  const params = new URLSearchParams()
  if (domain) params.set("domain", domain)
  if (action) params.set("action", action)
  if (actorEmail) params.set("actor_email", actorEmail)
  if (targetType) params.set("target_type", targetType)
  if (createdFrom) params.set("created_from", createdFrom)
  if (createdTo) params.set("created_to", createdTo)
  if (limit != null) params.set("limit", limit)
  if (offset != null) params.set("offset", offset)

  const qs = params.toString()
  const res = await apiFetch(`/api/admin/audit/events${qs ? `?${qs}` : ""}`)
  if (!res.ok) throw new Error(`Failed to load audit events (HTTP ${res.status})`)
  return res.json()
}
