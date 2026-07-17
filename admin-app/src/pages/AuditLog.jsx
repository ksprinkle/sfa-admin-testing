import { useEffect, useState } from "react"
import { fetchAdminAuditEvents } from "../api/adminAudit"

function fmt(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AuditLog() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(() => {
      if (isCancelled) return
      setLoading(true)
      setError(null)
    })

    fetchAdminAuditEvents({ limit: 50, offset: 0 })
      .then((payload) => {
        if (!isCancelled) setData(payload)
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
      <h1 className="text-xl font-bold text-ocean mb-1">Audit Log</h1>
      <p className="text-sm text-slate-500 mb-4">Administrative activity recorded across the app</p>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {data && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Events</h2>
            <span className="text-xs text-slate-400">{data.total} total</span>
          </div>

          {data.items.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No audit events yet</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Timestamp</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Domain</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Action</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Actor</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Target Type</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Target</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{fmt(event.created_at)}</td>
                    <td className="py-2 pr-4 text-slate-700">{event.domain}</td>
                    <td className="py-2 pr-4 text-slate-700">{event.action}</td>
                    <td className="py-2 pr-4 text-slate-700">{event.actor_display || event.actor_user_id || "—"}</td>
                    <td className="py-2 pr-4 text-slate-500">{event.target_type || "—"}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {event.target_display || "—"}
                      {event.target_id && (
                        <span className="block text-xs text-slate-400">{event.target_id}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
