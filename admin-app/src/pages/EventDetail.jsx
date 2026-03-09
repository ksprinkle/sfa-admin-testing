import { useEffect, useState } from "react"
import ParticipantTable from "../components/ParticipantTable"
import { useNavigate, useParams } from "react-router-dom"

function EventDetail() {

  const navigate = useNavigate()
  const { eventId } = useParams()

  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {

    if (!eventId || eventId === "new") return

    async function loadParticipants() {
      try {
        const token = localStorage.getItem("token")

        const res = await fetch(
          `http://localhost:8000/admin/events/${eventId}/participants`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        if (!res.ok) {
          throw new Error("Failed to fetch participants")
        }

        const data = await res.json()
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

  return (
    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-semibold">
        Event Participants
      </h1>

      <button
        onClick={() => navigate(`/events/${eventId}/checkin`)}
        className="w-full bg-green-600 text-white py-4 rounded-xl text-lg font-semibold shadow"
      >
        ✔ Start Event Check-In
      </button>

      <ParticipantTable participants={participants} />

    </div>
  )
}

export default EventDetail