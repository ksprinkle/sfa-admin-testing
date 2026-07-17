import { apiFetch } from "./api"

async function parseErrorOr(res, fallback) {
  const errorData = await res.json().catch(() => ({}))
  throw new Error(errorData.detail || fallback)
}

// Mirrors api/routers/admin_automation.py.
export async function fetchRegistry() {
  const res = await apiFetch("/api/admin/automation/registry")
  if (!res.ok) await parseErrorOr(res, "Failed to fetch handler registry")
  return res.json()
}

export async function fetchWorkflows() {
  const res = await apiFetch("/api/admin/automation/workflows")
  if (!res.ok) await parseErrorOr(res, "Failed to fetch workflows")
  return res.json()
}

export async function createWorkflow(payload) {
  const res = await apiFetch("/api/admin/automation/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseErrorOr(res, "Failed to create workflow")
  return res.json()
}

export async function setWorkflowEnabled(workflowId, enabled) {
  const res = await apiFetch(`/api/admin/automation/workflows/${workflowId}/enabled`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) await parseErrorOr(res, "Failed to update workflow")
  return res.json()
}

export async function executeWorkflow(workflowId, { triggerSource, payload } = {}) {
  const res = await apiFetch(`/api/admin/automation/workflows/${workflowId}/execute`, {
    method: "POST",
    body: JSON.stringify({
      trigger_source: triggerSource || "manual_api",
      payload: payload || null,
    }),
  })
  if (!res.ok) await parseErrorOr(res, "Failed to execute workflow")
  return res.json()
}

export async function fetchWorkflowRuns({ workflowId, limit } = {}) {
  const params = new URLSearchParams()
  if (workflowId) params.set("workflow_id", workflowId)
  if (limit != null) params.set("limit", limit)

  const qs = params.toString()
  const res = await apiFetch(`/api/admin/automation/runs${qs ? `?${qs}` : ""}`)
  if (!res.ok) await parseErrorOr(res, "Failed to fetch workflow runs")
  return res.json()
}
