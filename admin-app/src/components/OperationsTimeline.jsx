import { useEffect, useState } from "react"
import { fetchEventOperationsTimeline } from "../api/events"
import Card from "./Card"

const REFRESH_INTERVAL_MS = 15000

function formatTimestamp(iso) {
  if (!iso) return "—"
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Chronological feed of operational activity for a single event (check-ins,
 * session assignments, waitlist promotions, waiver verifications). Adding a
 * new event type only requires backend changes (see
 * api/services/event_operations_timeline.py) — this component renders
 * whatever entries the API returns.
 */
export default function OperationsTimeline({ eventId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!eventId) return

    let isCancelled = false

    async function load() {
      try {
        const data = await fetchEventOperationsTimeline(eventId)
        if (!isCancelled) {
          setEntries(Array.isArray(data?.entries) ? data.entries : [])
          setError(null)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || "Failed to load operations timeline")
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    load()

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        load()
      }
    }, REFRESH_INTERVAL_MS)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [eventId])

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Card.Header>Operations Timeline</Card.Header>
        {loading && entries.length === 0 && (
          <span className="text-xs text-slate-400">Loading…</span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {!error && entries.length === 0 && !loading && (
        <p className="text-sm text-slate-400 italic">No operational activity yet</p>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.entry_id}
              className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <span className="text-base leading-none mt-0.5">{entry.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-700">{entry.description}</p>
                <p className="text-xs text-slate-400">{formatTimestamp(entry.occurred_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
