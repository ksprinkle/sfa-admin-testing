import { apiFetch } from "./api"

export async function fetchFeedback({ feature, version } = {}) {
  const params = new URLSearchParams()
  if (feature) params.set("feature", feature)
  if (version) params.set("version", version)

  const qs = params.toString()
  const res = await apiFetch(`/api/feedback${qs ? `?${qs}` : ""}`)
  if (!res.ok) throw new Error(`Failed to load feedback (HTTP ${res.status})`)
  return res.json()
}
