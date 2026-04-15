import { useEffect, useState } from "react"
import { fetchEvents } from "../api/events"
import { useNavigate } from "react-router-dom"
import EventActionsDropdown from "../components/EventActionsDropdown"
import { deleteEvent, archiveEvent } from "../api/events"

export default function Events() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEvents() {
      try {
        const data = await fetchEvents()
        setEvents(data)
      } catch (err) {
        console.error("Failed to load events", err)
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [])

  async function handleDelete(event) {

    const confirmed = event.participant_count || 0
    const waitlisted = event.waitlist_count || 0
    const totalParticipants = confirmed + waitlisted

    const warning =
      totalParticipants > 0
        ? "⚠️ WARNING: This event has active registrations.\n\n"
        : ""

    const message = `
    Delete Event: ${event.title}

    ${warning}${confirmed} confirmed participant${confirmed === 1 ? "" : "s"}
    ${waitlisted} on waitlist
    ${totalParticipants} total registrations

    Are you sure you want to permanently delete this event?
    This action cannot be undone.
    `

    if (!confirm(message)) return

    try {
      await deleteEvent(event.id)

      setEvents(prev => prev.filter(e => e.id !== event.id))

    } catch (err) {
      console.error("Delete failed", err)
    }
  }

  async function handleArchive(eventId) {
    try {
      await archiveEvent(eventId)

      setEvents(prev =>
        prev.map(e =>
          e.id === eventId ? { ...e, status: "archived" } : e
        )
      )

    } catch (err) {
      console.error("Archive failed", err)
    }
  }

  if (loading) {
    return <div className="p-6">Loading events...</div>
  }

  return (
  <div className="p-6">
      
    <h1 className="text-2xl font-semibold mb-6">
      Events
    </h1>

    <div className="bg-white rounded-xl shadow">
    <div className="flex justify-between items-center mb-6">

    <h1 className="text-2xl font-semibold">
      Events
    </h1>

    <button
      onClick={() => navigate("/events/new")}
      className="bg-ocean text-white px-4 py-2 rounded"
    >
      + New Event
    </button>

  </div>    
      <table className="w-full">

        <thead className="bg-gray-50 border-b">
          <tr className="text-left text-sm text-gray-600">
            <th className="p-4">Event</th>
            <th className="p-4">Date</th>
            <th className="p-4">Status</th>
            <th className="p-4">Capacity</th>
          </tr>
        </thead>

        <tbody>

          {events.map(event => {

  const capacity = event.participant_capacity
  const count = event.participant_count

  const percent = capacity
    ? Math.min((count / capacity) * 100, 100)
    : 0

  return (
    <tr
      key={event.id}
      onClick={() => navigate(`/events/${event.id}`)}
      className="border-b hover:bg-gray-50 transition cursor-pointer"
    >

      <td className="p-4 font-medium">
        {event.title}
      </td>

      <td className="p-4 text-gray-600">
        {event.start_date}
      </td>

      <td className="p-4">
        {event.status === "published" && (
          <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">
            Published
          </span>
        )}

        {event.status === "draft" && (
          <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm">
            Draft
          </span>
        )}

        {event.status === "archived" && (
          <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-sm">
            Archived
          </span>
        )}
      </td>
      <td className="p-4 w-64">
        {capacity ? (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{count} / {capacity}</span>
              <span>{Math.round(percent)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded">
              <div
                className="h-2 rounded bg-teal-600"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-sm text-gray-500">
            {count} / ∞
          </span>
        )}
      </td>
      <td
        className="p-4 text-right w-24"
        onClick={(e) => e.stopPropagation()}
      >
            <EventActionsDropdown
              onEdit={() => navigate(`/events/${event.id}/edit`)}
              onArchive={() => handleArchive(event.id)}
              onDelete={() => handleDelete(event)}
            />
      </td>
    </tr>
  )
})}

        </tbody>

      </table>

    </div>

  </div>
)
}
 

