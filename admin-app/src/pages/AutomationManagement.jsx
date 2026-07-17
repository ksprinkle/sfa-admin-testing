import { useEffect, useState } from "react"
import { executeWorkflow, fetchRegistry, fetchWorkflowRuns, fetchWorkflows, setWorkflowEnabled } from "../api/automation"

function getRunStatusTone(status) {
  const normalized = String(status || "").toLowerCase()
  if (normalized === "succeeded") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (normalized === "failed") return "border-rose-200 bg-rose-50 text-rose-800"
  return "border-slate-200 bg-slate-100 text-slate-600"
}

function formatDateTime(value) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleString()
}

// trigger_type is stored metadata only — there is no scheduler or event
// listener wired up anywhere in the backend, so "scheduled"/"event"
// workflows never run on their own. Surfacing that plainly here so an
// admin never mistakes recorded intent for working automation.
function getTriggerTypeLabel(triggerType) {
  const normalized = String(triggerType || "").toLowerCase()
  if (normalized === "scheduled") return "Scheduled ⚠ Not active"
  if (normalized === "event") return "Event ⚠ Not active"
  return "Manual"
}

function getTriggerTypeTone(triggerType) {
  const normalized = String(triggerType || "").toLowerCase()
  if (normalized === "scheduled" || normalized === "event") return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-slate-200 bg-slate-100 text-slate-700"
}

export default function AutomationManagement() {
  const [workflows, setWorkflows] = useState(null)
  const [registryKeys, setRegistryKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState("")
  const [statusTone, setStatusTone] = useState("success")
  const [savingWorkflowId, setSavingWorkflowId] = useState(null)
  const [executingWorkflowId, setExecutingWorkflowId] = useState(null)
  const [runs, setRuns] = useState(null)
  const [runsError, setRunsError] = useState(null)

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [workflowsPayload, registryPayload] = await Promise.all([fetchWorkflows(), fetchRegistry()])
      setWorkflows(Array.isArray(workflowsPayload) ? workflowsPayload : [])
      setRegistryKeys(Array.isArray(registryPayload?.workflow_keys) ? registryPayload.workflow_keys : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadRuns() {
    try {
      const payload = await fetchWorkflowRuns({ limit: 50 })
      setRuns(Array.isArray(payload) ? payload : [])
      setRunsError(null)
    } catch (e) {
      setRunsError(e.message)
    }
  }

  useEffect(() => {
    loadData()
    loadRuns()
  }, [])

  async function handleToggleEnabled(workflow) {
    if (savingWorkflowId) return

    setSavingWorkflowId(workflow.id)
    setError(null)
    setStatusMessage("")

    try {
      const updated = await setWorkflowEnabled(workflow.id, !workflow.is_enabled)
      setStatusTone("success")
      setStatusMessage(`${updated.name} is now ${updated.is_enabled ? "enabled" : "disabled"}.`)
      await loadData()
    } catch (e) {
      setError(e.message || "Failed to update workflow")
    } finally {
      setSavingWorkflowId(null)
    }
  }

  async function handleExecute(workflow, hasHandler) {
    if (executingWorkflowId) return

    const warning = hasHandler
      ? ""
      : "\n\nWarning: no handler is registered for this workflow_key — execution will fail."
    const confirmed = window.confirm(
      `Execute "${workflow.name}" (${workflow.workflow_key})?${warning}`
    )
    if (!confirmed) return

    setExecutingWorkflowId(workflow.id)
    setError(null)
    setStatusMessage("")

    try {
      const run = await executeWorkflow(workflow.id, { triggerSource: "manual_ui" })
      if (run.status === "succeeded") {
        setStatusTone("success")
        setStatusMessage(`${workflow.name} executed successfully.`)
      } else {
        // Surface the server's own error message verbatim rather than a
        // generic UI message — the point is to show reality, not hide it.
        setStatusTone("failure")
        setStatusMessage(`${workflow.name} execution failed: ${run.error_message || "Unknown error"}`)
      }
      await loadRuns()
    } catch (e) {
      setError(e.message || "Failed to execute workflow")
    } finally {
      setExecutingWorkflowId(null)
    }
  }

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ocean mb-1">Automation</h1>
      <p className="text-sm text-slate-500 mb-4">Manage workflow definitions and review their configuration</p>

      {statusMessage && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${statusTone === "failure" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {statusMessage}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {workflows && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Workflows</h2>
            <span className="text-xs text-slate-400">{workflows.length} total</span>
          </div>

          {workflows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No workflows defined yet</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Key</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Name</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Domain / Action</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Trigger</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Enabled</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Handler</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => {
                  const hasHandler = registryKeys.includes(workflow.workflow_key)
                  return (
                    <tr key={workflow.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-700 font-mono text-xs">{workflow.workflow_key}</td>
                      <td className="py-2 pr-4 text-slate-700">{workflow.name}</td>
                      <td className="py-2 pr-4 text-slate-500">{workflow.target_domain} / {workflow.action}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getTriggerTypeTone(workflow.trigger_type)}`}>
                          {getTriggerTypeLabel(workflow.trigger_type)}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => handleToggleEnabled(workflow)}
                          disabled={savingWorkflowId === workflow.id}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${workflow.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          {savingWorkflowId === workflow.id ? "Saving…" : workflow.is_enabled ? "Enabled" : "Disabled"}
                        </button>
                      </td>
                      <td className="py-2 pr-4">
                        {hasHandler ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            Handler registered
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800"
                            title="Execution will fail until a handler is registered for this workflow_key"
                          >
                            No registered handler
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => handleExecute(workflow, hasHandler)}
                          disabled={executingWorkflowId === workflow.id}
                          title={hasHandler ? undefined : "No handler is registered for this workflow_key — execution will fail"}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {executingWorkflowId === workflow.id ? "Executing…" : "Execute"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Recent Runs</h2>
          <span className="text-xs text-slate-400">{runs ? `${runs.length} shown` : ""}</span>
        </div>

        {runsError && <p className="text-sm text-red-600">Error: {runsError}</p>}

        {runs && (
          runs.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No runs yet</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Workflow</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Trigger Source</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Status</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Detail</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const workflow = workflows?.find((w) => w.id === run.workflow_id)
                  return (
                    <tr key={run.id} className="border-b border-slate-50">
                      <td className="py-2 pr-4 text-slate-700 font-mono text-xs">{workflow?.workflow_key || run.workflow_id}</td>
                      <td className="py-2 pr-4 text-slate-500">{run.trigger_source}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getRunStatusTone(run.status)}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 text-xs max-w-xs truncate" title={run.error_message || JSON.stringify(run.result_payload) || ""}>
                        {run.error_message || (run.result_payload ? JSON.stringify(run.result_payload) : "—")}
                      </td>
                      <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{formatDateTime(run.started_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}
