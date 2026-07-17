import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { fetchAdminAuditEvents } from "../api/adminAudit"

// Centralized target_type -> route mapping. Only target types with a real,
// already-existing destination route get a link; everything else (and any
// event missing a target_id) renders as plain text. Add future target
// types here, not in the render logic.
const TARGET_ROUTES = {
  event: (id) => `/events/${id}`,
  participant: (id) => `/participants?participant_id=${id}`,
  communication_message: () => "/communications",
  communication_delivery: () => "/communications",
  communication_template: () => "/communications",
}

function getAuditTargetLink(event) {
  const label = event.target_display || null
  const id = event.target_id || null
  const buildHref = TARGET_ROUTES[event.target_type]

  if (!buildHref || !id) {
    return { href: null, label, id, isLink: false }
  }
  return { href: buildHref(id), label, id, isLink: true }
}

// Known domain/target_type vocabularies, gathered from actual
// record_admin_audit_event() call sites. Kept as a small hardcoded list
// (matching FeedbackReview.jsx's FEEDBACK_SCHEMAS pattern) rather than a
// new "list distinct values" endpoint.
const DOMAINS = ["automation", "communications", "email", "event_operations", "participants", "permissions", "volunteer"]
const TARGET_TYPES = ["assignment", "communication_delivery", "communication_message", "communication_template", "event", "participant", "user", "volunteer", "workflow"]

const TEXT_FILTER_DEBOUNCE_MS = 400
const PAGE_SIZE = 25

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

// created_to is an inclusive date filter on the backend; a plain
// "YYYY-MM-DD" would be parsed as midnight and exclude the rest of that
// day, so the actual API call extends it to end-of-day.
function endOfDay(dateStr) {
  return dateStr ? `${dateStr}T23:59:59.999` : undefined
}

export default function AuditLog() {
  const [searchParams, setSearchParams] = useSearchParams()

  const domain = searchParams.get("domain") || ""
  const targetType = searchParams.get("target_type") || ""
  const createdFrom = searchParams.get("created_from") || ""
  const createdTo = searchParams.get("created_to") || ""
  const action = searchParams.get("action") || ""
  const actorEmail = searchParams.get("actor_email") || ""
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  // Free-text filters get a local draft so every keystroke doesn't push a
  // history entry / refetch; select and date filters commit immediately.
  const [actionDraft, setActionDraft] = useState(action)
  const [actorDraft, setActorDraft] = useState(actorEmail)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Any filter change invalidates the current page — staying on, say, page 3
  // of a now-different result set would be confusing or out of range.
  function updateFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete("page")
      return next
    })
  }

  function goToPage(nextPage) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextPage > 1) next.set("page", String(nextPage))
      else next.delete("page")
      return next
    })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (actionDraft !== action) updateFilter("action", actionDraft)
    }, TEXT_FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionDraft])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (actorDraft !== actorEmail) updateFilter("actor_email", actorDraft)
    }, TEXT_FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorDraft])

  // Keep drafts in sync when the URL changes from outside a debounced edit
  // (browser back/forward, or a shared link with these params pre-filled).
  useEffect(() => {
    setActionDraft(action)
  }, [action])

  useEffect(() => {
    setActorDraft(actorEmail)
  }, [actorEmail])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(() => {
      if (isCancelled) return
      setLoading(true)
      setError(null)
    })

    fetchAdminAuditEvents({
      domain: domain || undefined,
      action: action || undefined,
      actorEmail: actorEmail || undefined,
      targetType: targetType || undefined,
      createdFrom: createdFrom || undefined,
      createdTo: endOfDay(createdTo),
      limit: PAGE_SIZE,
      offset,
    })
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
  }, [domain, action, actorEmail, targetType, createdFrom, createdTo, offset])

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ocean mb-1">Audit Log</h1>
      <p className="text-sm text-slate-500 mb-4">Administrative activity recorded across the app</p>

      <div className="flex gap-3 flex-wrap mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Domain</label>
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={domain}
            onChange={(e) => updateFilter("domain", e.target.value)}
          >
            <option value="">All</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Action</label>
          <input
            type="text"
            placeholder="e.g. promote_waitlist"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={actionDraft}
            onChange={(e) => setActionDraft(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Actor</label>
          <input
            type="text"
            placeholder="email contains…"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={actorDraft}
            onChange={(e) => setActorDraft(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Target Type</label>
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={targetType}
            onChange={(e) => updateFilter("target_type", e.target.value)}
          >
            <option value="">All</option>
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
          <input
            type="date"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={createdFrom}
            onChange={(e) => updateFilter("created_from", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
          <input
            type="date"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={createdTo}
            onChange={(e) => updateFilter("created_to", e.target.value)}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {data && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Events</h2>
            <span className="text-xs text-slate-400">{data.total} total</span>
          </div>

          {data.items.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No audit events match these filters</p>
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
                {data.items.map((event) => {
                  const target = getAuditTargetLink(event)
                  const targetContent = (
                    <>
                      {target.label || "—"}
                      {target.id && (
                        <span className="block text-xs text-slate-400">{target.id}</span>
                      )}
                    </>
                  )
                  return (
                    <tr key={event.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{fmt(event.created_at)}</td>
                      <td className="py-2 pr-4 text-slate-700">{event.domain}</td>
                      <td className="py-2 pr-4 text-slate-700">{event.action}</td>
                      <td className="py-2 pr-4 text-slate-700">{event.actor_display || event.actor_user_id || "—"}</td>
                      <td className="py-2 pr-4 text-slate-500">{event.target_type || "—"}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {target.isLink ? (
                          <Link to={target.href} className="text-ocean hover:underline">{targetContent}</Link>
                        ) : (
                          <span>{targetContent}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 disabled:cursor-default hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
              </span>
              <button
                type="button"
                disabled={offset + data.items.length >= data.total}
                onClick={() => goToPage(page + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 disabled:cursor-default hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
