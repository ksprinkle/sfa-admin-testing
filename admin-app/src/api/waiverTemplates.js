import { apiFetch } from "./api"

export async function fetchWaiverTemplates() {
  const res = await apiFetch("/api/admin/waiver-templates")
  if (!res.ok) {
    throw new Error("Failed to fetch waiver templates")
  }
  return res.json()
}

export async function createWaiverTemplate(payload) {
  const res = await apiFetch("/api/admin/waiver-templates", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to create waiver template")
  }

  return res.json()
}

export async function updateWaiverTemplate(templateId, payload) {
  const res = await apiFetch(`/api/admin/waiver-templates/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to update waiver template")
  }

  return res.json()
}

export async function activateWaiverTemplate(templateId, payload = {}) {
  const res = await apiFetch(`/api/admin/waiver-templates/${templateId}/activate`, {
    method: "POST",
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to activate waiver template")
  }

  return res.json()
}

export async function archiveWaiverTemplate(templateId) {
  const res = await apiFetch(`/api/admin/waiver-templates/${templateId}/archive`, {
    method: "POST",
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to archive waiver template")
  }

  return res.json()
}

export async function previewWaiverTemplate(templateId) {
  const res = await apiFetch(`/api/admin/waiver-templates/${templateId}/preview`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || "Failed to preview waiver template")
  }
  return res.json()
}
