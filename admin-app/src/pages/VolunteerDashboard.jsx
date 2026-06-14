import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { fetchVolunteerDashboard } from "../api/events"

const STATUS_LABELS = {
  ACTION_REQUIRED: "Action Required",
  INCOMPLETE: "Incomplete",
  CHECKED_IN: "Checked In",
  READY: "Ready",
}

const STATUS_CLASSES = {
  ACTION_REQUIRED: "bg-red-100 text-red-800",
  INCOMPLETE: "bg-amber-100 text-amber-800",
  CHECKED_IN: "bg-blue-100 text-blue-800",
  READY: "bg-green-100 text-green-800",
}

function VolunteerDashboard() {
  const navigate = useNavigate()
  const [projection, setProjection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")

  useEffect(() => {
    let isCancelled = false

    const loadProjection = async () => {
      setLoading(true)
      setError("")
      try {
        const data = await fetchVolunteerDashboard()
        if (!isCancelled) {
          setProjection(data)
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError?.message || "Failed to load volunteer dashboard")
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadProjection()

    return () => {
      isCancelled = true
    }
  }, [])

  const volunteers = projection?.volunteers || []
  const filteredVolunteers = useMemo(() => {
    if (statusFilter === "ALL") return volunteers
    return volunteers.filter((volunteer) => volunteer.computed_status === statusFilter)
  }, [volunteers, statusFilter])

  const openParticipants = (email) => {
    if (!email) {
      navigate("/participants")
      return
    }
    navigate(`/participants?search=${encodeURIComponent(email)}`)
  }

  const openCheckIn = (eventId) => {
    if (!eventId) return
    navigate(`/events/${eventId}/checkin`)
  }

  const summary = projection?.summary || {
    total_volunteers: 0,
    action_required: 0,
    incomplete: 0,
    checked_in: 0,
    ready: 0,
  }

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-gray-900">Volunteer Operational Dashboard</h2>
        <p className="mt-1 text-sm text-secondary">
          Read-only projection of current volunteer readiness. Status is computed from canonical data and never stored.
        </p>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-5 sm:p-6">
        <button type="button" onClick={() => setStatusFilter("ALL")} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
          <p className="text-xs uppercase tracking-wide text-slate-600">Total</p>
          <p className="text-xl font-semibold text-slate-900">{summary.total_volunteers}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter("ACTION_REQUIRED")} className="rounded-xl border border-red-200 bg-red-50 p-3 text-left">
          <p className="text-xs uppercase tracking-wide text-red-700">Action Required</p>
          <p className="text-xl font-semibold text-red-900">{summary.action_required}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter("INCOMPLETE")} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="text-xs uppercase tracking-wide text-amber-700">Incomplete</p>
          <p className="text-xl font-semibold text-amber-900">{summary.incomplete}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter("CHECKED_IN")} className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-left">
          <p className="text-xs uppercase tracking-wide text-blue-700">Checked In</p>
          <p className="text-xl font-semibold text-blue-900">{summary.checked_in}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter("READY")} className="rounded-xl border border-green-200 bg-green-50 p-3 text-left">
          <p className="text-xs uppercase tracking-wide text-green-700">Ready</p>
          <p className="text-xl font-semibold text-green-900">{summary.ready}</p>
        </button>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Current Volunteers</h3>
          <p className="text-xs text-secondary">Compliance: {projection?.compliance_tracking_supported ? "Tracked" : "Not Tracked"}</p>
        </div>

        {loading ? <p className="text-sm text-secondary">Loading volunteer projection...</p> : null}

        {!loading && filteredVolunteers.length === 0 ? (
          <p className="text-sm text-secondary">No volunteers match the selected status filter.</p>
        ) : null}

        {!loading && filteredVolunteers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Volunteer</th>
                  <th className="px-2 py-2">Event</th>
                  <th className="px-2 py-2">Assignment</th>
                  <th className="px-2 py-2">Check-In</th>
                  <th className="px-2 py-2">Waiver/Docs</th>
                  <th className="px-2 py-2">Compliance</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVolunteers.map((volunteer) => (
                  <tr key={volunteer.participant_id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2">
                      <p className="font-medium text-gray-900">{volunteer.full_name}</p>
                      <p className="text-xs text-secondary">{volunteer.email}</p>
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-gray-800">{volunteer.event_title || "No current event"}</p>
                      <p className="text-xs text-secondary">{volunteer.event_type || "-"}</p>
                    </td>
                    <td className="px-2 py-2">{volunteer.session_name || "Unassigned"}</td>
                    <td className="px-2 py-2">{volunteer.checked_in ? "Checked In" : "Not Checked In"}</td>
                    <td className="px-2 py-2">{volunteer.waiver_document_status}</td>
                    <td className="px-2 py-2">{volunteer.compliance_status}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[volunteer.computed_status] || "bg-slate-100 text-slate-700"}`}>
                        {STATUS_LABELS[volunteer.computed_status] || volunteer.computed_status}
                      </span>
                      {Array.isArray(volunteer.status_reasons) && volunteer.status_reasons.length > 0 ? (
                        <p className="mt-1 text-xs text-secondary">{volunteer.status_reasons.join("; ")}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => openParticipants(volunteer.email)}
                        >
                          Open Participant
                        </button>
                        <button
                          type="button"
                          disabled={!volunteer.event_id}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => openCheckIn(volunteer.event_id)}
                        >
                          Open Check-In
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default VolunteerDashboard
