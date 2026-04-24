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

function Dashboard() {
  const [events, setEvents] = useState([])
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate();

  const [registered, setRegistered] = useState(0)
  const [waitlisted, setWaitlisted] = useState(0)
  const [checkedIn, setCheckedIn] = useState(0)
  const [clearedToParticipate, setClearedToParticipate] = useState(0)
  const [volunteers, setVolunteers] = useState(0)
  const [waiversMissing, setWaiversMissing] = useState(0)

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

      // pick first published event, fallback to the next event by date
      const active = events.find(e => e.status?.toLowerCase() === "published") || events[0] || null
      console.log(events)

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

  const participantCapacity = event.capacity?.participants;
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
          {eventsByType.map(([eventType, count]) => (
            <StatCard
              key={eventType}
              label={formatEventType(eventType)}
              value={count}
              color="text-ocean"
              onClick={() => navigate(`/events?type=${encodeURIComponent(eventType)}`)}
              title={`Filter events by ${formatEventType(eventType)}`}
            />
          ))}
        </div>
      </div>

      {/* Live Event Stats */}
      <div
      onClick={() => navigate(`/events/${event.id}`)}
      className="cursor-pointer hover:bg-gray-100 transition rounded-lg p-2 relative"
    >
      <button
        onClick={(e) => { e.stopPropagation(); loadData(); }}
        className="absolute top-2 right-2 text-sm bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
      >
        ↻ Refresh
      </button>
      <h2 className="text-lg font-semibold text-ocean">
        {event.status?.toLowerCase() === "published" ? "Live Event" : "Next event"}
      </h2>

      <p className="text-sm text-gray-600">
        {event.title} • {event.start_date}
      </p>
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

    </div>
  )
}

function StatCard({ label, value, color, onClick, title }) {
  const clickable = typeof onClick === "function"

  return (
    <div
      className={`bg-white rounded-xl shadow p-4 ${clickable ? "cursor-pointer transition hover:bg-gray-50" : ""}`}
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
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>
        {value}
      </p>
    </div>
  )
}

export default Dashboard