import { useEffect, useState } from "react"
import ParticipantTable from "../components/ParticipantTable"
import { useNavigate, useParams } from "react-router-dom"
import { fetchEventParticipants } from "../api/events"

function EventDetail() {

  const navigate = useNavigate()
  const { eventId } = useParams()

  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {

    if (!eventId || eventId === "new") return

    async function loadParticipants() {
      try {
        const data = await fetchEventParticipants(eventId)
        setParticipants(data)

      } catch (err) {
        console.error("Error loading participants:", err)
      } finally {
        setLoading(false)
      }
    }

    loadParticipants()

  }, [eventId])

  if (loading) {
    return (
      <div className="p-6">
        Loading event participants...
      </div>
    )
  }

  const confirmed = participants.filter(p => !p.is_waitlisted).length
  const waitlist = participants.filter(p => p.is_waitlisted).length
  const checkedIn = participants.filter(p => p.checked_in).length
  const missingWaivers = participants.filter(p => !p.waiver_verified).length
  const sessionMap = {}

  participants.forEach(p => {
    const key = p.session_id || "unassigned"
    if (!sessionMap[key]) sessionMap[key] = []
    sessionMap[key].push(p)
  })

  return (
    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-semibold">
        Event Participants
      </h1>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

      <div className="bg-white p-4 rounded-xl shadow">
        <div className="text-sm text-gray-500">Confirmed</div>
        <div className="text-2xl font-semibold">{confirmed}</div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <div className="text-sm text-gray-500">Waitlist</div>
        <div className="text-2xl font-semibold">{waitlist}</div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <div className="text-sm text-gray-500">Checked In</div>
        <div className="text-2xl font-semibold">{checkedIn}</div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <div className="text-sm text-gray-500">Waivers Missing</div>
        <div className="text-2xl font-semibold text-red-600">
          {missingWaivers}
        </div>
      </div>

    </div>
      <button
        onClick={() => navigate(`/events/${eventId}/checkin`)}
        className="w-full bg-green-600 text-white py-4 rounded-xl text-lg font-semibold shadow"
      >
        ✔ Start Event Check-In
      </button>

      {Object.entries(sessionMap).map(([sessionId, group], idx) => (
        <div key={sessionId} className="mb-6">

          <h3 className="text-lg font-semibold mb-2">
            Session {idx + 1} ({group.length} / 15)
          </h3>

          <table className="w-full text-sm border">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {group.map(p => (
                <tr key={p.id}>
                  <td>{p.first_name} {p.last_name}</td>
                  <td>{p.email}</td>
                  <td>{p.is_waitlisted ? "Waitlisted" : "Confirmed"}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      ))}

    </div>
  )
}

export default EventDetail