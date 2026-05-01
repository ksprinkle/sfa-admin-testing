import { useEffect, useMemo, useState } from "react"
import { fetchEvents } from "../api/events"
import { useNavigate, useSearchParams } from "react-router-dom"
import EventActionsDropdown from "../components/EventActionsDropdown"
import BackButton from "../components/BackButton"
import { archiveEvent, cancelEvent, deleteEvent, exportEventRemovalLogCsv, fetchEventRemovalLog } from "../api/events"

const EVENT_TYPE_FILTER_KEY = "sfa.events.selectedType"

const EVENT_ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "cancelled", label: "Cancelled" },
  { value: "deleted", label: "Deleted" },
  { value: "auto_archived", label: "Auto-Archived" },
  { value: "status_change", label: "Status Change" },
]

const EVENT_REASON_OPTIONS = [
  { value: "", label: "All reasons" },
  { value: "weather", label: "Weather" },
  { value: "safety", label: "Safety" },
  { value: "capacity", label: "Capacity" },
  { value: "staffing", label: "Staffing" },
  { value: "admin_decision", label: "Admin Decision" },
  { value: "duplicate", label: "Duplicate" },
  { value: "cleanup", label: "Cleanup" },
  { value: "cancelled", label: "Cancelled" },
  { value: "deleted", label: "Deleted" },
  { value: "passed_event_date", label: "Passed Event Date" },
  { value: "status_change", label: "Status Change" },
  { value: "other", label: "Other" },
]

function normalizeEventTypeKey(eventType) {
  return String(eventType || "").trim().toLowerCase()
}

function formatEventType(eventType) {
  if (!eventType) return "-"

  return String(eventType)
    .replace(/\s+/g, " ")
    .trim()
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getEventTypeRowTone(eventType) {
  const normalized = normalizeEventTypeKey(eventType)
  const normalizedForMatch = normalized.replace(/[_-]/g, " ")

  if (normalizedForMatch === "chapter" || normalizedForMatch.includes("chapter")) {
    return {
      rowClass: "bg-indigo-100/50 hover:bg-indigo-200/55",
      pillClass: "border-indigo-200 bg-indigo-100 text-indigo-900",
    }
  }

  if (normalizedForMatch === "tour" || normalizedForMatch.includes("tour")) {
    return {
      rowClass: "bg-emerald-50/45 hover:bg-emerald-100/60",
      pillClass: "border-emerald-200 bg-emerald-100 text-emerald-900",
    }
  }

  return {
    rowClass: "bg-white hover:bg-gray-50",
    pillClass: "border-gray-200 bg-gray-50 text-secondary",
  }
}

function normalizeExternalUrl(rawUrl) {
  const value = String(rawUrl || "").trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith("//")) return `https:${value}`
  return `https://${value}`
}

export default function Events() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionInProgress, setActionInProgress] = useState({ type: "", eventId: "" })
  const [eventRemovalLogs, setEventRemovalLogs] = useState([])
  const [eventRemovalLogError, setEventRemovalLogError] = useState("")
  const [isEventRemovalLogLoading, setIsEventRemovalLogLoading] = useState(false)
  const [eventRemovalLogPage, setEventRemovalLogPage] = useState(1)
  const EVENT_REMOVAL_PAGE_SIZE = 20
  const [eventRemovalLogFilters, setEventRemovalLogFilters] = useState({
    title_search: "",
    action_type: "",
    reason_code: "",
    event_type: "",
    actor_email: "",
    date_from: "",
    date_to: "",
  })
  const statusFilter = (searchParams.get("status") || "all").toLowerCase()
  const checkInSelectionRequired = searchParams.get("checkin_select") === "1"
  const typeFilter = normalizeEventTypeKey(searchParams.get("type")) || null
  const [selectedEventType, setSelectedEventType] = useState(
    () => normalizeEventTypeKey(typeFilter || window.localStorage.getItem(EVENT_TYPE_FILTER_KEY)) || "all"
  )

  const eventTypeCounts = events.reduce((counts, event) => {
    const key = normalizeEventTypeKey(event.event_type) || "unspecified"
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  const eventTypes = Array.from(
    new Set(events.map(event => normalizeEventTypeKey(event.event_type)).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right))

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const eventStatus = (event.status || "").toLowerCase()
      const matchesStatus = statusFilter === "all" || eventStatus === statusFilter
      const eventTypeKey = normalizeEventTypeKey(event.event_type)
      const matchesType = selectedEventType === "all" || eventTypeKey === selectedEventType

      return matchesStatus && matchesType
    })
  }, [events, selectedEventType, statusFilter])

  const statusOptions = ["all", "published", "draft", "archived", "cancelled"]
  const statusCounts = useMemo(() => {
    return events.reduce((counts, event) => {
      const key = (event.status || "unknown").toLowerCase()
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {})
  }, [events])

  const filteredEventRemovalLogs = useMemo(() => {
    const titleFilter = (eventRemovalLogFilters.title_search || "").trim().toLowerCase()
    const actionFilter = (eventRemovalLogFilters.action_type || "").trim().toLowerCase()
    const reasonFilter = (eventRemovalLogFilters.reason_code || "").trim().toLowerCase()
    const eventTypeFilter = (eventRemovalLogFilters.event_type || "").trim().toLowerCase()
    const actorFilter = (eventRemovalLogFilters.actor_email || "").trim().toLowerCase()
    const fromFilter = eventRemovalLogFilters.date_from || ""
    const toFilter = eventRemovalLogFilters.date_to || ""

    return eventRemovalLogs
      .filter((row) => {
        if (!titleFilter) return true
        return `${row.event_title || ""} ${row.event_id || ""}`.toLowerCase().includes(titleFilter)
      })
      .filter((row) => {
        if (!actionFilter) return true
        return String(row.action_type || "").toLowerCase() === actionFilter
      })
      .filter((row) => {
        if (!reasonFilter) return true
        return String(row.reason_code || "").toLowerCase() === reasonFilter
      })
      .filter((row) => {
        if (!eventTypeFilter) return true
        return String(row.event_type || "").toLowerCase() === eventTypeFilter
      })
      .filter((row) => {
        if (!actorFilter) return true
        return String(row.actor_user_email || "").toLowerCase().includes(actorFilter)
      })
      .filter((row) => {
        const createdIsoDate = String(row.created_at || "").slice(0, 10)
        if (fromFilter && createdIsoDate < fromFilter) return false
        if (toFilter && createdIsoDate > toFilter) return false
        return true
      })
  }, [eventRemovalLogs, eventRemovalLogFilters])

  const totalEventRemovalLogPages = Math.max(1, Math.ceil(filteredEventRemovalLogs.length / EVENT_REMOVAL_PAGE_SIZE))
  const safeEventRemovalLogPage = Math.min(eventRemovalLogPage, totalEventRemovalLogPages)
  const visibleEventRemovalLogs = filteredEventRemovalLogs.slice(
    (safeEventRemovalLogPage - 1) * EVENT_REMOVAL_PAGE_SIZE,
    safeEventRemovalLogPage * EVENT_REMOVAL_PAGE_SIZE,
  )

  const eventRemovalTypeOptions = Array.from(
    new Set(eventRemovalLogs.map((row) => String(row.event_type || "").trim().toLowerCase()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right))

  async function refreshEventRemovalLog() {
    setIsEventRemovalLogLoading(true)
    setEventRemovalLogError("")
    try {
      const data = await fetchEventRemovalLog({ limit: 2000 })
      setEventRemovalLogs(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Failed to load event removal log", err)
      setEventRemovalLogError(err?.message || "Failed to load removed event history")
    } finally {
      setIsEventRemovalLogLoading(false)
    }
  }

  async function handleExportEventRemovalLogCsv() {
    try {
      const { blob, filename } = await exportEventRemovalLogCsv({
        ...eventRemovalLogFilters,
        limit: 20000,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setEventRemovalLogError(err?.message || "Failed to export removed event history")
    }
  }

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
    window.localStorage.setItem(EVENT_TYPE_FILTER_KEY, normalizeEventTypeKey(selectedEventType) || "all")
  }, [selectedEventType])

  useEffect(() => {
    if (!typeFilter) return
    setSelectedEventType(normalizeEventTypeKey(typeFilter))
  }, [typeFilter])

  useEffect(() => {
    if (!eventTypes.length) return
    if (selectedEventType !== "all" && !eventTypes.includes(selectedEventType)) {
      setSelectedEventType("all")
    }
  }, [eventTypes, selectedEventType])

  useEffect(() => {
    async function loadEvents() {
      try {
        setLoadError("")
        const data = await fetchEvents()
        setEvents(data)
      } catch (err) {
        console.error("Failed to load events", err)
        setLoadError(err?.message || "Failed to load events")
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
    refreshEventRemovalLog()
  }, [])

  useEffect(() => {
    setEventRemovalLogPage(1)
  }, [
    eventRemovalLogFilters.title_search,
    eventRemovalLogFilters.action_type,
    eventRemovalLogFilters.reason_code,
    eventRemovalLogFilters.event_type,
    eventRemovalLogFilters.actor_email,
    eventRemovalLogFilters.date_from,
    eventRemovalLogFilters.date_to,
  ])

  async function handleDelete(event) {
    if (actionInProgress.eventId === event.id) return

    setActionError("")

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

    const reasonPrompt = [
      `Delete ${event.title}?`,
      "Choose reason number:",
      "1) Duplicate",
      "2) Cleanup",
      "3) Admin decision",
      "4) Other",
    ].join("\n")
    const reasonChoice = window.prompt(reasonPrompt, "1")
    if (reasonChoice === null) return

    const deleteReasonMap = {
      "1": "duplicate",
      "2": "cleanup",
      "3": "admin_decision",
      "4": "other",
    }
    const reason_code = deleteReasonMap[(reasonChoice || "").trim()]
    if (!reason_code) {
      setActionError("Delete cancelled: invalid reason selection.")
      return
    }
    let reason_note = window.prompt("Optional note for deletion log:", "")
    if (reason_note === null) reason_note = ""

    try {
      setActionInProgress({ type: "delete", eventId: event.id })
      await deleteEvent(event.id, reason_code, reason_note)

      setEvents(prev => prev.filter(e => e.id !== event.id))
      await refreshEventRemovalLog()

    } catch (err) {
      console.error("Delete failed", err)
      setActionError(err?.message || "Delete failed")
    } finally {
      setActionInProgress({ type: "", eventId: "" })
    }
  }

  async function handleArchive(eventId) {
    if (actionInProgress.eventId === eventId) return

    setActionError("")

    try {
      setActionInProgress({ type: "archive", eventId })
      await archiveEvent(eventId)

      setEvents(prev =>
        prev.map(e =>
          e.id === eventId ? { ...e, status: "archived" } : e
        )
      )
      await refreshEventRemovalLog()

    } catch (err) {
      console.error("Archive failed", err)
      setActionError(err?.message || "Archive failed")
    } finally {
      setActionInProgress({ type: "", eventId: "" })
    }
  }

  async function handleCancel(eventId) {
    if (actionInProgress.eventId === eventId) return

    setActionError("")

    const confirmed = window.confirm("Cancel this event? Participants and event history will be kept.")
    if (!confirmed) return

    const reasonPrompt = [
      "Choose cancel reason number:",
      "1) Weather",
      "2) Safety",
      "3) Capacity",
      "4) Staffing",
      "5) Other",
    ].join("\n")
    const reasonChoice = window.prompt(reasonPrompt, "1")
    if (reasonChoice === null) return

    const cancelReasonMap = {
      "1": "weather",
      "2": "safety",
      "3": "capacity",
      "4": "staffing",
      "5": "other",
    }
    const reason_code = cancelReasonMap[(reasonChoice || "").trim()]
    if (!reason_code) {
      setActionError("Cancel aborted: invalid reason selection.")
      return
    }
    let reason_note = window.prompt("Optional note for cancel log:", "")
    if (reason_note === null) reason_note = ""

    try {
      setActionInProgress({ type: "cancel", eventId })
      await cancelEvent(eventId, reason_code, reason_note)

      setEvents(prev =>
        prev.map(e =>
          e.id === eventId ? { ...e, status: "cancelled" } : e
        )
      )
      await refreshEventRemovalLog()

    } catch (err) {
      console.error("Cancel failed", err)
      setActionError(err?.message || "Cancel failed")
    } finally {
      setActionInProgress({ type: "", eventId: "" })
    }
  }

  if (loading) {
    return <div className="p-6">Loading events...</div>
  }

  return (
  <div className="p-4 sm:p-6">

    {checkInSelectionRequired && (
      <div className="mb-4 rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
        Select an event first, then open Check-In from that event.
      </div>
    )}
      
    <h1 className="text-2xl font-semibold mb-6">
      Events
    </h1>

    <div className="bg-white rounded-xl shadow">
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

    <div className="flex items-center gap-3">
      <h1 className="text-2xl font-semibold">
        Events
      </h1>
    </div>
    <div className="flex flex-wrap items-center gap-3 md:justify-end">
      <BackButton fallbackTo="/dashboard" className="px-3 py-2" />
      <button
        onClick={() => navigate("/event-templates")}
        className="px-3 py-2 sm:py-1 bg-sky-100 text-sky-800 rounded hover:bg-sky-200 text-sm"
        title="Go to Event Templates"
      >
        Templates
      </button>
      <button
        onClick={() => navigate("/events/new")}
        className="w-full sm:w-auto bg-ocean text-white px-4 py-2.5 sm:py-2 rounded"
      >
        + New Event
      </button>
    </div>

  </div>    
      {(loadError || actionError) && (
        <div className="mx-4 mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 break-words">
          {loadError || actionError}
        </div>
      )}
      <div className="border-b p-4">
        <div>
          <p className="text-sm font-medium text-secondary">Filter by status</p>
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

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-secondary">Filter by Event Type</p>
            <p className="text-xs text-secondary">
              Showing {filteredEvents.length} of {events.length} events
              {statusFilter !== "all" ? ` (status: ${statusFilter})` : ""}
            </p>
          </div>
          <img
            src={`${import.meta.env.BASE_URL}sfa_2026_shirt.jpg`}
            alt="Surfers for Autism 2026 shirt"
            className="h-24 w-auto rounded-lg border border-slate-200 object-cover shadow-sm"
            loading="lazy"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedEventType("all")}
            className={`inline-flex min-w-max shrink-0 flex-nowrap items-center whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition ${selectedEventType === "all" ? "border-ocean bg-ocean text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
            style={{ whiteSpace: "nowrap" }}
          >
            <span className="whitespace-nowrap">All Event Types</span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${selectedEventType === "all" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
              {events.length}
            </span>
          </button>
          {eventTypes.map((eventType) => (
            <button
              key={eventType}
              type="button"
              onClick={() => setSelectedEventType(normalizeEventTypeKey(eventType))}
              className={`inline-flex min-w-max shrink-0 flex-nowrap items-center whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition ${selectedEventType === eventType ? "border-ocean bg-ocean text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
              style={{ whiteSpace: "nowrap" }}
            >
              <span className="whitespace-nowrap">{formatEventType(eventType)}</span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${selectedEventType === eventType ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                {eventTypeCounts[eventType] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh] rounded-xl border border-gray-200">
      <table className="w-full min-w-[860px]">

        <thead className="bg-gray-50 border-b sticky top-0 z-10">
          <tr className="text-left text-sm text-secondary">
            <th className="p-4">Event</th>
            <th className="p-4">Event Type</th>
            <th className="p-4">Date</th>
            <th className="p-4">Status</th>
            <th className="p-4">Capacity</th>
            <th className="p-4">Participants</th>
          </tr>
        </thead>

        <tbody>

          {filteredEvents.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-sm text-secondary">
                <p>No events match the current filters.</p>
                {(statusFilter !== "all" || selectedEventType !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventType("all")
                      handleStatusFilterChange("all")
                    }}
                    className="mt-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Clear all filters
                  </button>
                )}
              </td>
            </tr>
          )}

          {filteredEvents.map(event => {

  const capacity = event?.capacity?.participants ?? event?.participant_capacity
  const count = event.participant_count
  const waitlistCount = event.waitlist_count || 0
  const totalParticipants = count + waitlistCount
  const eventTypeTone = getEventTypeRowTone(event.event_type)
          const featuredImageUrl = normalizeExternalUrl(event.featured_image)

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
        <div className="flex items-center gap-3">
          {featuredImageUrl && (
            <img
              src={featuredImageUrl}
              alt={event.title ? `${event.title} featured` : "Event featured image"}
              className="h-10 w-10 rounded-md border border-slate-200 object-cover"
              loading="lazy"
            />
          )}
          <div>
            <span>{event.title}</span>
          </div>
        </div>
      </td>

      <td className="p-4 text-secondary whitespace-nowrap">
        <span
          className={`inline-flex min-w-max shrink-0 flex-nowrap items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${eventTypeTone.pillClass}`}
          style={{ whiteSpace: "nowrap" }}
        >
          {formatEventType(event.event_type)}
        </span>
      </td>

      <td className="p-4 text-secondary">
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

        {event.status === "cancelled" && (
          <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded text-sm">
            Cancelled
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
            <div className="mt-1 text-xs text-secondary">
              Waitlist: {waitlistCount}
            </div>
          </div>
        ) : (
          <div>
            <span className="text-sm text-secondary">
              {count} / ∞
            </span>
            <div className="mt-1 text-xs text-secondary">
              Waitlist: {waitlistCount}
            </div>
          </div>
        )}
      </td>
      <td className="p-4 text-secondary">
        <div className="text-sm font-medium">{totalParticipants}</div>
        <div className="text-xs text-secondary">Active {count} + Waitlist {waitlistCount}</div>
      </td>
      <td
        className="p-4 text-right w-24"
        onClick={(e) => e.stopPropagation()}
      >
            <EventActionsDropdown
              onEdit={() => navigate(`/events/${event.id}/edit`)}
              onArchive={() => handleArchive(event.id)}
              onCancel={() => handleCancel(event.id)}
              onDelete={() => handleDelete(event)}
            />
      </td>
    </tr>
  )
})}

        </tbody>

      </table>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Removed Events History</h2>
          {isEventRemovalLogLoading && <span className="text-xs text-secondary">Loading...</span>}
          <button
            type="button"
            onClick={handleExportEventRemovalLogCsv}
            className="ml-auto rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={refreshEventRemovalLog}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {eventRemovalLogError && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {eventRemovalLogError}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEventRemovalLogFilters((prev) => ({ ...prev, action_type: "cancelled" }))}
            className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Cancelled
          </button>
          <button
            type="button"
            onClick={() => setEventRemovalLogFilters((prev) => ({ ...prev, action_type: "deleted" }))}
            className="rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            Deleted
          </button>
          <button
            type="button"
            onClick={() => setEventRemovalLogFilters((prev) => ({ ...prev, action_type: "auto_archived" }))}
            className="rounded border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
          >
            Auto-Archived
          </button>
          <button
            type="button"
            onClick={() => setEventRemovalLogFilters((prev) => ({ ...prev, action_type: "" }))}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear Action
          </button>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-7">
          <input
            type="text"
            value={eventRemovalLogFilters.title_search}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, title_search: e.target.value }))}
            placeholder="Search title or ID"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />

          <select
            value={eventRemovalLogFilters.action_type}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, action_type: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {EVENT_ACTION_OPTIONS.map((option) => (
              <option key={option.value || "all-actions"} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={eventRemovalLogFilters.reason_code}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, reason_code: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {EVENT_REASON_OPTIONS.map((option) => (
              <option key={option.value || "all-reasons"} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={eventRemovalLogFilters.event_type}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, event_type: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All event types</option>
            {eventRemovalTypeOptions.map((eventType) => (
              <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>
            ))}
          </select>

          <input
            type="text"
            value={eventRemovalLogFilters.actor_email}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, actor_email: e.target.value }))}
            placeholder="Actor email"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />

          <input
            type="date"
            value={eventRemovalLogFilters.date_from}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, date_from: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />

          <input
            type="date"
            value={eventRemovalLogFilters.date_to}
            onChange={(e) => setEventRemovalLogFilters((prev) => ({ ...prev, date_to: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-secondary">
              <tr>
                <th className="px-2 py-2">Date/Time</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Status Change</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Actor</th>
                <th className="px-2 py-2">Counts</th>
              </tr>
            </thead>
            <tbody>
              {visibleEventRemovalLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-sm text-secondary">No removed event history matches these filters.</td>
                </tr>
              )}
              {visibleEventRemovalLogs.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-2 whitespace-nowrap">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.action_type}</td>
                  <td className="px-2 py-2" title={row.event_id}>{row.event_title || row.event_id}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatEventType(row.event_type)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{`${row.previous_status || "-"} -> ${row.new_status || "-"}`}</td>
                  <td className="px-2 py-2">{row.reason_code || "-"}{row.reason_note ? `: ${row.reason_note}` : ""}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.actor_user_email || row.actor_user_id || "System"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">P:{row.participant_count ?? "-"} W:{row.waitlist_count ?? "-"} C:{row.checked_in_count ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-secondary">
          <span>
            Page {safeEventRemovalLogPage} of {totalEventRemovalLogPages}
          </span>
          <button
            type="button"
            onClick={() => setEventRemovalLogPage((prev) => Math.max(1, prev - 1))}
            disabled={safeEventRemovalLogPage <= 1}
            className="rounded border border-gray-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setEventRemovalLogPage((prev) => Math.min(totalEventRemovalLogPages, prev + 1))}
            disabled={safeEventRemovalLogPage >= totalEventRemovalLogPages}
            className="rounded border border-gray-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

    </div>

  </div>
)
}
 

