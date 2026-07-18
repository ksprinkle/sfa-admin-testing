import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Card from "../components/Card"
import { fetchPublicEvents } from "../api/portal"

function formatDateRange(startDate, endDate) {
  if (!startDate) return "Date to be announced"

  const options = { month: "short", day: "numeric", year: "numeric" }
  const startLabel = new Date(`${startDate}T00:00:00`).toLocaleDateString(undefined, options)
  if (!endDate || endDate === startDate) return startLabel

  const endLabel = new Date(`${endDate}T00:00:00`).toLocaleDateString(undefined, options)
  return `${startLabel} – ${endLabel}`
}

function formatLocation(location) {
  if (!location) return "Location to be announced"
  return [location.venue, location.city, location.state].filter(Boolean).join(", ") || "Location to be announced"
}

// Display only — consumes the existing public GET /api/events endpoint.
// No registration action is wired here; that's the next slice.
function PortalEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    fetchPublicEvents()
      .then((data) => {
        if (!cancelled) setEvents(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Unable to load events right now.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ocean mb-1">Upcoming Events</h1>
        <p className="text-sm text-slate-500">Published events open for participant registration.</p>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading events…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!loading && !error && events.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No events are currently listed. Check back soon.</p>
        </Card>
      ) : null}

      <div className="space-y-3">
        {events.map((event) => (
          <Card key={event.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{event.title}</h2>
                <p className="text-sm text-slate-500">{formatDateRange(event.start_date, event.end_date)}</p>
                <p className="text-sm text-slate-500">{formatLocation(event.location)}</p>
              </div>
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  event.participant_available
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700",
                ].join(" ")}
              >
                {event.participant_available ? "Registration open" : "Registration closed"}
              </span>
            </div>
            <div className="mt-3">
              <Link to="/portal/register" className="text-sm font-medium text-ocean hover:underline">
                Register for this event →
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default PortalEvents
