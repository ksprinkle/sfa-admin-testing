import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"
import { fetchMyRegistrations } from "../api/portal"
import { clearPortalSession, getStoredPortalToken } from "../api/portalAuth"
import { formatEventDateRange, formatEventLocation } from "../utils/portalFormat"

const WAIVER_STATUS_LABELS = {
  not_required: "Not Required",
  pending: "Pending",
  signed: "Signed",
}

function badgeClass(tone) {
  const base = "inline-flex rounded-full px-3 py-1 text-xs font-semibold"
  if (tone === "ok") return `${base} bg-emerald-100 text-emerald-700`
  if (tone === "warn") return `${base} bg-amber-100 text-amber-700`
  return `${base} bg-slate-100 text-slate-700`
}

function waiverTone(status) {
  if (status === "signed") return "ok"
  if (status === "pending") return "warn"
  return "neutral"
}

// GET /api/participants/mine already returns exactly what this page needs in
// one call — no separate per-registration fetches, no client-side filtering
// of a broader admin endpoint (which would also require admin permissions
// this role doesn't have, see api/services/authorization.py).
function PortalMyRegistrations() {
  const location = useLocation()
  // Router state only — never a URL query param, so this can't linger after a
  // refresh or get bookmarked/shared. Set by PortalVerifyEmail.jsx's success
  // state when the verification just claimed one or more historical
  // registrations.
  const justClaimed = location.state?.justClaimed || 0

  const [token] = useState(() => getStoredPortalToken())
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) return undefined

    // loading/error already start correctly (loading: Boolean(token), error:
    // "") — token is read once on mount and never changes, so this effect
    // only ever runs once and doesn't need to reset them itself.
    let cancelled = false

    fetchMyRegistrations(token)
      .then((data) => {
        if (!cancelled) setRegistrations(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.status === 401) {
          clearPortalSession()
        }
        setError(err?.message || "Unable to load your registrations right now.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  // Not authenticated: a friendly sign-in prompt, not an API error. No
  // request to /api/participants/mine is even attempted in this case.
  if (!token) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">My Registrations</h1>
        <p className="text-sm text-slate-600 mb-3">
          Sign in to view your event registrations and waiver status.
        </p>
        <Link to="/portal/login">
          <Button variant="primary">Sign In</Button>
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ocean mb-1">My Registrations</h1>
        <p className="text-sm text-slate-500">Your event registrations and waiver status.</p>
      </div>

      {justClaimed > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Welcome back! We found and linked {justClaimed} past registration{justClaimed === 1 ? "" : "s"} to your
          account.
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading your registrations...</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!loading && !error && registrations.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600 mb-3">You don&apos;t have any registrations yet.</p>
          <Link to="/portal/events">
            <Button variant="primary">Browse Events</Button>
          </Link>
        </Card>
      ) : null}

      <div className="space-y-3">
        {registrations.map((registration) => (
          <Card key={registration.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{registration.event.title}</h2>
                <p className="text-sm text-slate-500">
                  {formatEventDateRange(registration.event.start_date, registration.event.end_date)}
                </p>
                <p className="text-sm text-slate-500">{formatEventLocation(registration.event.location)}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={badgeClass(registration.is_waitlisted ? "warn" : "ok")}>
                  {registration.is_waitlisted ? "Waitlisted" : "Confirmed"}
                </span>
                <span className={badgeClass(waiverTone(registration.waiver_status))}>
                  Waiver: {WAIVER_STATUS_LABELS[registration.waiver_status] || "Unknown"}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default PortalMyRegistrations
