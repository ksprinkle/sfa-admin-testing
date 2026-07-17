import { useEffect, useState } from "react"
import { fetchRegistry, fetchWorkflows } from "../api/automation"

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

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(() => {
      if (isCancelled) return
      setLoading(true)
      setError(null)
    })

    Promise.all([fetchWorkflows(), fetchRegistry()])
      .then(([workflowsPayload, registryPayload]) => {
        if (isCancelled) return
        setWorkflows(Array.isArray(workflowsPayload) ? workflowsPayload : [])
        setRegistryKeys(Array.isArray(registryPayload?.workflow_keys) ? registryPayload.workflow_keys : [])
      })
      .catch((e) => {
        if (!isCancelled) setError(e.message)
      })
      .finally(() => {
        if (!isCancelled) setLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ocean mb-1">Automation</h1>
      <p className="text-sm text-slate-500 mb-4">Manage workflow definitions and review their configuration</p>

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
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${workflow.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                          {workflow.is_enabled ? "Enabled" : "Disabled"}
                        </span>
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
