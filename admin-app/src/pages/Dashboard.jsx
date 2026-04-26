import { useEffect, useState } from "react"
import { fetchEvents, fetchEventSummary } from "../api/events"
import { useNavigate } from "react-router-dom";

function formatEventType(eventType) {
  if (!eventType) return "Unspecified"

  return eventType
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getEventTypeTone(eventType) {
  const normalized = String(eventType || "").trim().toLowerCase()

  if (normalized === "chapter") {
    return {
      cardClass: "border border-indigo-200 bg-indigo-100/50",
      labelClass: "text-indigo-900",
      valueClass: "text-indigo-900",
      pillClass: "border-indigo-200 bg-indigo-100 text-indigo-900",
    }
  }

  if (normalized === "tour") {
    return {
      cardClass: "border border-emerald-200 bg-emerald-50/45",
      labelClass: "text-emerald-900",
      valueClass: "text-emerald-900",
      pillClass: "border-emerald-200 bg-emerald-100 text-emerald-900",
    }
  }

  return {
    cardClass: "border border-gray-200 bg-white",
    labelClass: "text-gray-500",
    valueClass: "text-ocean",
    pillClass: "border-gray-300 bg-gray-100 text-gray-700",
  }
}

const DEFAULT_VOLUNTEER_COUNTS = { food: 0, raffle: 0, beach: 0, buddy: 0, instructor: 0 }

function normalizeVolunteerTypeCounts(rawCounts) {
  const counts = { ...DEFAULT_VOLUNTEER_COUNTS }
  if (!rawCounts || typeof rawCounts !== "object") return counts

  for (const [rawKey, rawValue] of Object.entries(rawCounts)) {
    const key = rawKey === "surf_buddy" ? "buddy" : rawKey === "surf_instructor" ? "instructor" : rawKey
    if (!(key in counts)) continue
    counts[key] += Number(rawValue) || 0
  }

  return counts
}

function Dashboard() {
  const [events, setEvents] = useState([])
  const [liveEvents, setLiveEvents] = useState([])
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate();

  const [registered, setRegistered] = useState(0)
  const [waitlisted, setWaitlisted] = useState(0)
  const [checkedIn, setCheckedIn] = useState(0)
  const [clearedToParticipate, setClearedToParticipate] = useState(0)
  const [volunteers, setVolunteers] = useState(0)
  const [waiversMissing, setWaiversMissing] = useState(0)
  const [versatileVolunteers, setVersatileVolunteers] = useState(0)
  const [volunteerTypeCounts, setVolunteerTypeCounts] = useState(DEFAULT_VOLUNTEER_COUNTS)

  // For now, just show the first published event and its stats. 
  // In the future we can add a dropdown to select different events, or show aggregate stats across all events. 
  const handleViewRoster = (eventId) => {
  navigate(`/events/${eventId}`);
};

  const handleCheckIn = (eventId) => {
  navigate(`/events/${eventId}/checkin`);
};

  const loadData = async () => {
    try {
      const events = await fetchEvents()
      setEvents(events)

      const published = events.filter((candidate) => candidate.status?.toLowerCase() === "published")
      setLiveEvents(published)

      // Pick a default event for summary cards while still showing all live events.
      const active = published[0] || events[0] || null

      if (!active) {
        setLoading(false)
        return
      }

      setEvent(active)

      // ✅ fetch summary here (correct place)
      const summary = await fetchEventSummary(active.id)

      setRegistered(summary.registered_count ?? summary.participant_count)
      setWaitlisted(summary.waitlist_count)
      setCheckedIn(summary.checked_in_count)
      setClearedToParticipate(summary.cleared_to_participate_count ?? 0)
      setVolunteers(summary.volunteer_count ?? 0)
      setWaiversMissing(summary.waivers_missing)
      setVersatileVolunteers(summary.versatile_volunteer_count ?? 0)
      setVolunteerTypeCounts(normalizeVolunteerTypeCounts(summary.volunteer_type_counts))

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Manual refresh button handler
  const handleManualRefresh = () => {
    setLoading(true)
    loadData()
  }

useEffect(() => {
  loadData()
}, [])

  // Refresh data when returning to dashboard
  useEffect(() => {
    const handleFocus = () => loadData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  if (loading) {
    return <div className="p-4">Loading...</div>
  }

  if (!event) {
    return <div className="p-4">No active event found.</div>
  }

  const participantCapacity = event?.capacity?.participants ?? event?.participant_capacity;
  const hasMultipleLiveEvents = liveEvents.length > 1
  const eventParticipantsTotal = registered + waitlisted
  const percentFull = participantCapacity
    ? Math.min((registered / participantCapacity) * 100, 100)
    : 0;

  const totalEvents = events.length

  const publishedEvents = events.filter(
    e => e.status?.toLowerCase() === "published"
  ).length

  const draftEvents = events.filter(
    e => e.status?.toLowerCase() === "draft"
  ).length

  const eventsByType = Object.entries(
    events.reduce((counts, currentEvent) => {
      const key = currentEvent.event_type || "unspecified"
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {})
  ).sort(([left], [right]) => left.localeCompare(right))

  const totalParticipants = events.reduce(
    (sum, e) => sum + (e.participant_count || 0),
    0
  )
  const capacityColor =
    participantCapacity && registered >= participantCapacity
      ? "bg-danger"
      : percentFull > 80
      ? "bg-warning"
      : "bg-ocean";

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-semibold flex-1">Dashboard</h1>
        <button
          onClick={handleManualRefresh}
          className="ml-2 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          title="Refresh dashboard"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Overall Event Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Events"
          value={totalEvents}
          color="text-ocean"
          onClick={() => navigate("/events")}
          title="Open all events"
        />
        <StatCard
          label="Published Events"
          value={publishedEvents}
          color="text-success"
          onClick={() => navigate("/events?status=published")}
          title="Open published events"
        />
        <StatCard
          label="Draft Events"
          value={draftEvents}
          color="text-warning"
          onClick={() => navigate("/events?status=draft")}
          title="Open draft events"
        />
        <StatCard
          label="Total Participants"
          value={totalParticipants}
          color="text-ocean"
          onClick={() => navigate("/participants")}
          title="Open participants"
        />
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Events by Type</h2>
            <p className="text-xs text-gray-500">
              Quick count of configured event types across the current event list.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {eventsByType.map(([eventType, count]) => {
            const tone = getEventTypeTone(eventType)
            return (
              <StatCard
                key={eventType}
                label={formatEventType(eventType)}
                value={count}
                color={tone.valueClass}
                labelColor={tone.labelClass}
                cardClass={tone.cardClass}
                onClick={() => navigate(`/events?type=${encodeURIComponent(eventType)}`)}
                title={`Filter events by ${formatEventType(eventType)}`}
              />
            )
          })}
        </div>
      </div>

      {/* Live Event Stats */}
      <div
      onClick={!hasMultipleLiveEvents ? () => navigate(`/events/${event.id}`) : undefined}
      className={`${hasMultipleLiveEvents ? "" : "cursor-pointer hover:bg-gray-100"} transition rounded-lg p-2 relative`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); loadData(); }}
        className="absolute top-2 right-2 text-sm bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
      >
        ↻ Refresh
      </button>
      <h2 className="text-lg font-semibold text-ocean">
        {event.status?.toLowerCase() === "published" ? (hasMultipleLiveEvents ? `Live Events (${liveEvents.length})` : "Live Event") : "Next event"}
      </h2>

      <p className="text-sm text-gray-600">
        {event.title} • {event.start_date}
      </p>
      <p className="text-xs font-medium text-gray-500">
        Event Type: {formatEventType(event.event_type)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-ocean/30 bg-ocean/10 px-2 py-0.5 text-ocean">
          Active: {participantCapacity ? `${registered}/${participantCapacity}` : `${registered}/no max`}
        </span>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
          Waitlist: {waitlisted}
        </span>
        <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-gray-700">
          Participants: {eventParticipantsTotal}
        </span>
      </div>

      {hasMultipleLiveEvents && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-700">
            Multiple events are currently live. Use one of the quick actions below to avoid checking into the wrong event.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {liveEvents.map((liveEvent) => {
              const tone = getEventTypeTone(liveEvent.event_type)
              return (
              <div key={liveEvent.id} className={`rounded-lg p-3 ${tone.cardClass}`}>
                <p className="text-sm font-semibold text-gray-800">{liveEvent.title}</p>
                <p className="text-xs text-gray-600">
                  {liveEvent.start_date}
                  <span className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 ${tone.pillClass}`}>
                    {formatEventType(liveEvent.event_type)}
                  </span>
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/events/${liveEvent.id}`)}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Open Event
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/events/${liveEvent.id}/checkin`)}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                  >
                    Check In
                  </button>
                </div>
              </div>
            )})}
          </div>
        </div>
      )}
    </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Registered"
          value={registered}
          color="text-ocean"
          onClick={() => navigate(`/events/${event.id}?participants=registered`)}
          title="Open event roster filtered to registered participants"
        />
        <StatCard
          label="Waitlisted"
          value={waitlisted}
          color="text-warning"
          onClick={() => navigate(`/events/${event.id}?participants=waitlisted`)}
          title="Open event roster filtered to waitlisted participants"
        />
        <StatCard
          label="Cleared to Participate"
          value={clearedToParticipate}
          color="text-success"
          onClick={() => navigate(`/events/${event.id}?participants=cleared`)}
          title="Open event roster filtered to waiver-verified checked-in participants"
        />
        <StatCard
          label="Checked In"
          value={checkedIn}
          color="text-success"
          onClick={() => navigate(`/events/${event.id}?participants=checked_in`)}
          title="Open event roster filtered to checked-in participants"
        />
        <StatCard
          label="Volunteers"
          value={volunteers}
          color="text-ocean"
          onClick={() => navigate(`/events/${event.id}?participants=volunteers`)}
          title="Open event roster filtered to volunteers"
        />
        <StatCard
          label="Waivers Missing"
          value={waiversMissing}
          color="text-danger"
          onClick={() => navigate(`/events/${event.id}?participants=waiver_missing`)}
          title="Open event roster filtered to missing waivers"
        />
      </div>

      {/* Volunteer Type Breakdown */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Volunteer Breakdown</h2>
            <p className="text-xs text-gray-500">Signed up by role for this event</p>
          </div>
          <span className="text-xs font-medium text-gray-500">{volunteers} total • {versatileVolunteers} flexible</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { key: "food",            label: "Food",         color: "text-green-700",  bg: "bg-green-50"  },
            { key: "raffle",          label: "Raffle",       color: "text-purple-700", bg: "bg-purple-50" },
            { key: "beach",           label: "Beach",        color: "text-sky-700",    bg: "bg-sky-50"    },
            { key: "buddy",      label: "Buddy",      color: "text-cyan-700",   bg: "bg-cyan-50"   },
            { key: "instructor", label: "Instructor", color: "text-orange-700", bg: "bg-orange-50" },
          ].map(({ key, label, color, bg }) => (
            <div
              key={key}
              className={`${bg} rounded-lg p-3 text-center cursor-pointer transition hover:brightness-95`}
              onClick={() => navigate(`/events/${event.id}?participants=volunteers&volunteer_type=${encodeURIComponent(key)}`)}
              role="button"
              tabIndex={0}
              title={`Open volunteer roster filtered to ${label}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  navigate(`/events/${event.id}?participants=volunteers&volunteer_type=${encodeURIComponent(key)}`)
                }
              }}
            >
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-semibold ${color}`}>{volunteerTypeCounts[key] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>


      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Participant Capacity
        </p>
        {participantCapacity ? (
          <>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${capacityColor}`}
                style={{ width: `${percentFull}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {registered} of {participantCapacity} spots filled
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-500">No participant capacity set for this event.</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Check-In Progress
        </p>

        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500"
            style={{ width: `${registered > 0 ? (checkedIn / registered) * 100 : 0}%` }}
          />
        </div>

        <p className="text-xs text-gray-500">
          {checkedIn} of {registered} registered participants checked in
        </p>
      </div>

      {waitlisted > 0 && (
        <div className="bg-warning/10 border border-warning rounded-lg p-3 text-sm text-warning">
          {waitlisted} participant(s) currently on waitlist
        </div>
      )}

      <div className="flex gap-4 mt-6">

        <button
          onClick={() => handleViewRoster(event.id)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
        >
          View Full Roster
        </button>

        <button
          onClick={() => handleCheckIn(event.id)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
        >
          Check In
        </button>

      </div>

      {hasMultipleLiveEvents && (
        <p className="text-xs text-gray-500">
          Main summary cards are showing the first live event. When multiple live events overlap, use the event-specific buttons above.
        </p>
      )}

    </div>
  )
}

function StatCard({ label, value, color, onClick, title, cardClass = "", labelColor = "text-gray-500" }) {
  const clickable = typeof onClick === "function"

  return (
    <div
      className={`rounded-xl shadow p-4 ${cardClass || "bg-white"} ${clickable ? "cursor-pointer transition hover:brightness-[0.98]" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title}
      onKeyDown={clickable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      } : undefined}
    >
      <p className={`text-xs ${labelColor}`}>{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>
        {value}
      </p>
    </div>
  )
}

export default Dashboard