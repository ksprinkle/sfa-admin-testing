import { useEffect, useState, useMemo } from "react"
import { fetchEvents, fetchEventParticipants } from "../api/events"

function Dashboard() {
  const [event, setEvent] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const events = await fetchEvents()

        // pick first published event for now
        const active = events[0]
        console.log(events)
        if (!active) {
          setLoading(false)
          return
        }
        
        setEvent(active)

        const participantData = await fetchEventParticipants(active.id)
        setParticipants(participantData)

      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return <div className="p-4">Loading...</div>
  }

  if (!event) {
    return <div className="p-4">No active event found.</div>
  }

  const confirmed = participants.filter(p => !p.is_waitlisted)
  const waitlisted = participants.filter(p => p.is_waitlisted)
  const checkedIn = participants.filter(p => p.checked_in)

  const percentFull = Math.min(
    (confirmed.length / event.participant_capacity) * 100,
    100
  )

  const capacityColor =
    confirmed.length >= event.participant_capacity
      ? "bg-danger"
      : percentFull > 80
      ? "bg-warning"
      : "bg-ocean"

  return (
    <div className="p-4 space-y-6">

      <div>
        <h2 className="text-lg font-semibold text-ocean">
          Live Event
        </h2>
        <p className="text-sm text-gray-600">
          {event.title} • {event.start_date}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Confirmed" value={confirmed.length} color="text-ocean" />
        <StatCard label="Waitlisted" value={waitlisted.length} color="text-warning" />
        <StatCard label="Checked In" value={checkedIn.length} color="text-success" />
        <StatCard label="Volunteers" value={event.volunteer_count ?? 0} color="text-ocean" />
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Participant Capacity
        </p>

        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${capacityColor}`}
            style={{ width: `${percentFull}%` }}
          />
        </div>

        <p className="text-xs text-gray-500">
          {confirmed.length} of {event.participant_capacity} spots filled
        </p>
      </div>

      {waitlisted.length > 0 && (
        <div className="bg-warning/10 border border-warning rounded-lg p-3 text-sm text-warning">
          {waitlisted.length} participant(s) currently on waitlist
        </div>
      )}

      <div className="space-y-3">
        <button className="w-full bg-ocean text-white rounded-lg py-3">
          Check In Participants
        </button>

        <button className="w-full bg-white border border-ocean text-ocean rounded-lg py-3">
          View Full Roster
        </button>
      </div>

    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>
        {value}
      </p>
    </div>
  )
}

export default Dashboard