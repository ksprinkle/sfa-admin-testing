import { useEffect, useMemo, useState } from "react"
import { fetchEvents } from "../api/events"
import { useNavigate, useSearchParams } from "react-router-dom"
import EventActionsDropdown from "../components/EventActionsDropdown"
import BackButton from "../components/BackButton"
import { deleteEvent, archiveEvent } from "../api/events"

const EVENT_TYPE_FILTER_KEY = "sfa.events.selectedType"

function formatEventType(eventType) {
  if (!eventType) return "-"

  return eventType
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getEventTypeRowTone(eventType) {
  const normalized = String(eventType || "").trim().toLowerCase()

  if (normalized === "chapter") {
    return {
      rowClass: "bg-indigo-100/50 hover:bg-indigo-200/55",
      pillClass: "border-indigo-200 bg-indigo-100 text-indigo-900",
    }
  }

  if (normalized === "tour") {
    return {
      rowClass: "bg-emerald-50/45 hover:bg-emerald-100/60",
      pillClass: "border-emerald-200 bg-emerald-100 text-emerald-900",
    }
  }

  return {
    rowClass: "bg-white hover:bg-gray-50",
    pillClass: "border-gray-200 bg-gray-50 text-gray-700",
  }
}

export default function Events() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const statusFilter = (searchParams.get("status") || "all").toLowerCase()
  const typeFilter = searchParams.get("type") || null
  const [selectedEventType, setSelectedEventType] = useState(
    () => typeFilter || window.localStorage.getItem(EVENT_TYPE_FILTER_KEY) || "all"
  )

  const eventTypeCounts = events.reduce((counts, event) => {
    const key = event.event_type || "unspecified"
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  const eventTypes = Array.from(
    new Set(events.map(event => event.event_type).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right))

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const eventStatus = (event.status || "").toLowerCase()
      const matchesStatus = statusFilter === "all" || eventStatus === statusFilter
      const matchesType = selectedEventType === "all" || event.event_type === selectedEventType

      return matchesStatus && matchesType
    })
  }, [events, selectedEventType, statusFilter])

  const statusOptions = ["all", "published", "draft", "archived"]
  const statusCounts = useMemo(() => {
    return events.reduce((counts, event) => {
      const key = (event.status || "unknown").toLowerCase()
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {})
  }, [events])

  function handleStatusFilterChange(nextStatus) {
    const nextParams = new URLSearchParams(searchParams)

    if (nextStatus === "all") {
      nextParams.delete("status")
    } else {
      nextParams.set("status", nextStatus)
    }

    setSearchParams(nextParams)
  }

  useEffect(() => {
    window.localStorage.setItem(EVENT_TYPE_FILTER_KEY, selectedEventType)
  }, [selectedEventType])

  useEffect(() => {
    if (!typeFilter) return
    setSelectedEventType(typeFilter)
  }, [typeFilter])

  useEffect(() => {
    if (selectedEventType !== "all" && !eventTypes.includes(selectedEventType)) {
      setSelectedEventType("all")
    }
  }, [eventTypes, selectedEventType])

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
    <div className="flex items-center gap-2">
      <BackButton fallbackTo="/dashboard" className="px-3 py-2" />
      <button
        onClick={() => navigate("/events/new")}
        className="bg-ocean text-white px-4 py-2 rounded"
      >
        + New Event
      </button>
    </div>

  </div>    
      <div className="border-b p-4">
        <div>
          <p className="text-sm font-medium text-gray-700">Filter by status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleStatusFilterChange(option)}
                className={`rounded-full border px-3 py-2 text-sm font-medium capitalize transition ${statusFilter === option ? "border-ocean bg-ocean text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                {option}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${statusFilter === option ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {option === "all" ? events.length : (statusCounts[option] || 0)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700">Filter by Event Type</p>
          <p className="text-xs text-gray-500">
            Showing {filteredEvents.length} of {events.length} events
            {statusFilter !== "all" ? ` (status: ${statusFilter})` : ""}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedEventType("all")}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition ${selectedEventType === "all" ? "border-ocean bg-ocean text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            All Event Types
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${selectedEventType === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
              {events.length}
            </span>
          </button>
          {eventTypes.map((eventType) => (
            <button
              key={eventType}
              type="button"
              onClick={() => setSelectedEventType(eventType)}
              className={`rounded-full border px-3 py-2 text-sm font-medium transition ${selectedEventType === eventType ? "border-ocean bg-ocean text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {formatEventType(eventType)}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${selectedEventType === eventType ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                {eventTypeCounts[eventType] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh] rounded-xl border border-gray-200">
      <table className="w-full">

        <thead className="bg-gray-50 border-b sticky top-0 z-10">
          <tr className="text-left text-sm text-gray-600">
            <th className="p-4">Event</th>
            <th className="p-4">Event Type</th>
            <th className="p-4">Date</th>
            <th className="p-4">Status</th>
            <th className="p-4">Capacity</th>
            <th className="p-4">Participants</th>
          </tr>
        </thead>

        <tbody>

          {filteredEvents.map(event => {

  const capacity = event?.capacity?.participants ?? event?.participant_capacity
  const count = event.participant_count
  const waitlistCount = event.waitlist_count || 0
  const totalParticipants = count + waitlistCount
  const eventTypeTone = getEventTypeRowTone(event.event_type)

  const percent = capacity
    ? Math.min((count / capacity) * 100, 100)
    : 0

  return (
    <tr
      key={event.id}
      onClick={() => navigate(`/events/${event.id}`)}
      className={`border-b transition cursor-pointer ${eventTypeTone.rowClass}`}
    >

      <td className="p-4 font-medium">
        {event.title}
      </td>

      <td className="p-4 text-gray-700">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${eventTypeTone.pillClass}`}>
          {formatEventType(event.event_type)}
        </span>
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
            <div className="mt-1 text-xs text-gray-500">
              Waitlist: {waitlistCount}
            </div>
          </div>
        ) : (
          <div>
            <span className="text-sm text-gray-500">
              {count} / ∞
            </span>
            <div className="mt-1 text-xs text-gray-500">
              Waitlist: {waitlistCount}
            </div>
          </div>
        )}
      </td>
      <td className="p-4 text-gray-700">
        <div className="text-sm font-medium">{totalParticipants}</div>
        <div className="text-xs text-gray-500">Active {count} + Waitlist {waitlistCount}</div>
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

  </div>
)
}
 

