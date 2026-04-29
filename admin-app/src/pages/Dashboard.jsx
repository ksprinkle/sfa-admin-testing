import { useEffect, useState } from "react"
import { fetchEvents, fetchEventSummary } from "../api/events"
import { useNavigate } from "react-router-dom";
import { getReleaseTag } from "../config/release"

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

function normalizeExternalUrl(rawUrl) {
  const value = String(rawUrl || "").trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith("//")) return `https:${value}`
  return `https://${value}`
}

const DEFAULT_VOLUNTEER_COUNTS = {
  food: 0,
  raffle: 0,
  buddy: 0,
  instructor: 0,
  spotter: 0,
  board_rescue: 0,
  lifeguard: 0,
  registration: 0,
  setup_teardown: 0,
  equipment_handling: 0,
  snacks_drinks: 0,
}
const DEFAULT_VOLUNTEER_GROUP_COUNTS = { beach: 0, water: 0 }
const DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS = { beach: 0, water: 0 }

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

function normalizeVolunteerGroupCounts(rawCounts) {
  const counts = { ...DEFAULT_VOLUNTEER_GROUP_COUNTS }
  if (!rawCounts || typeof rawCounts !== "object") return counts

  for (const [rawKey, rawValue] of Object.entries(rawCounts)) {
    const key = String(rawKey || "").trim().toLowerCase()
    if (!(key in counts)) continue
    counts[key] += Number(rawValue) || 0
  }

  return counts
}

function normalizeFlexibleVolunteerGroupCounts(rawCounts) {
  const counts = { ...DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS }
  if (!rawCounts || typeof rawCounts !== "object") return counts

  for (const [rawKey, rawValue] of Object.entries(rawCounts)) {
    const key = String(rawKey || "").trim().toLowerCase()
    if (!(key in counts)) continue
    counts[key] += Number(rawValue) || 0
  }

  return counts
}

function mergeCountMaps(base, addition) {
  const merged = { ...base }
  for (const [key, value] of Object.entries(addition || {})) {
    if (!(key in merged)) {
      merged[key] = 0
    }
    merged[key] += Number(value) || 0
  }
  return merged
}

function Dashboard() {
    // Read current filter from URL or localStorage
    let currentParticipantFilter = null;
    let currentVolunteerType = null;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      currentParticipantFilter = url.searchParams.get("participants") || window.localStorage.getItem("sfa.lastParticipantFilter");
      currentVolunteerType = url.searchParams.get("volunteer_type") || url.searchParams.get("volunteerType") || window.localStorage.getItem("sfa.volunteerTypeFilter");
    }
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
  const [volunteerGroupCounts, setVolunteerGroupCounts] = useState(DEFAULT_VOLUNTEER_GROUP_COUNTS)
  const [volunteerFlexibleGroupCounts, setVolunteerFlexibleGroupCounts] = useState(DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS)
  const [volunteerBreakdownByType, setVolunteerBreakdownByType] = useState({})
  const [volunteerBreakdownTypeFilter, setVolunteerBreakdownTypeFilter] = useState("all")

  // For now, just show the first published event and its stats. 
  // In the future we can add a dropdown to select different events, or show aggregate stats across all events. 
  // Helper to get last-used filter for navigation
  function getFilterQuery() {
    let query = "";
    if (typeof window !== "undefined") {
      const lastType = window.localStorage.getItem("sfa.volunteerTypeFilter");
      if (lastType) {
        query = `?participants=volunteers&volunteer_type=${encodeURIComponent(lastType)}`;
      }
    }
    return query;
  }

  const handleViewRoster = (eventId) => {
    navigate(`/events/${eventId}${getFilterQuery()}`);
  };

  const handleCheckIn = (eventId) => {
    navigate(`/events/${eventId}/checkin${getFilterQuery()}`);
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

      const summariesByType = {}
      const liveSummaryCandidates = (published.length > 0 ? published : [active]).filter(Boolean)
      const liveSummaries = await Promise.all(liveSummaryCandidates.map((evt) => fetchEventSummary(evt.id)))
      for (const item of liveSummaries) {
        const matchingEvent = liveSummaryCandidates.find((evt) => String(evt.id) === String(item.event_id))
        const eventTypeKey = String(matchingEvent?.event_type || "unspecified").trim().toLowerCase() || "unspecified"
        const existing = summariesByType[eventTypeKey] || {
          label: formatEventType(eventTypeKey),
          volunteers: 0,
          versatile: 0,
          roleCounts: { ...DEFAULT_VOLUNTEER_COUNTS },
          groupCounts: { ...DEFAULT_VOLUNTEER_GROUP_COUNTS },
          flexibleGroupCounts: { ...DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS },
        }

        existing.volunteers += Number(item.volunteer_count) || 0
        existing.versatile += Number(item.versatile_volunteer_count) || 0
        existing.roleCounts = mergeCountMaps(
          existing.roleCounts,
          normalizeVolunteerTypeCounts(item.volunteer_type_counts)
        )
        existing.groupCounts = mergeCountMaps(
          existing.groupCounts,
          normalizeVolunteerGroupCounts(item.volunteer_group_counts)
        )
        existing.flexibleGroupCounts = mergeCountMaps(
          existing.flexibleGroupCounts,
          normalizeFlexibleVolunteerGroupCounts(item.volunteer_flexible_group_counts)
        )
        summariesByType[eventTypeKey] = existing
      }

      setVolunteerBreakdownByType(summariesByType)

      setRegistered(summary.registered_count ?? summary.participant_count)
      setWaitlisted(summary.waitlist_count)
      setCheckedIn(summary.checked_in_count)
      setClearedToParticipate(summary.cleared_to_participate_count ?? 0)
      setVolunteers(summary.volunteer_count ?? 0)
      setWaiversMissing(summary.waivers_missing)
      setVersatileVolunteers(summary.versatile_volunteer_count ?? 0)
      setVolunteerTypeCounts(normalizeVolunteerTypeCounts(summary.volunteer_type_counts))
      setVolunteerGroupCounts(normalizeVolunteerGroupCounts(summary.volunteer_group_counts))
      setVolunteerFlexibleGroupCounts(normalizeFlexibleVolunteerGroupCounts(summary.volunteer_flexible_group_counts))

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
    return <div className="p-4">Loading...</div>;
  }

  if (!event) {
    return <div className="p-4">No active event found.</div>;
  }

  // Show current filter summary if any
  let filterSummary = null;
  if (currentParticipantFilter || currentVolunteerType) {
    let parts = [];
    if (currentParticipantFilter) {
      parts.push(`Participants: ${currentParticipantFilter.charAt(0).toUpperCase() + currentParticipantFilter.slice(1)}`);
    }
    if (currentVolunteerType) {
      parts.push(`Role: ${currentVolunteerType.charAt(0).toUpperCase() + currentVolunteerType.slice(1)}`);
    }
    filterSummary = (
      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs font-medium">
        Showing: {parts.join(", ")}
      </div>
    );
  }

  const participantCapacity = event?.capacity?.participants ?? event?.participant_capacity;
  const hasMultipleLiveEvents = liveEvents.length > 1
  const selectedFeaturedImageUrl = normalizeExternalUrl(event?.featured_image)
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

  const volunteerBreakdownTypeOptions = [
    { key: "all", label: "All Live Events" },
    ...Object.keys(volunteerBreakdownByType)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ key, label: volunteerBreakdownByType[key]?.label || formatEventType(key) })),
  ]

  const filteredBreakdown = (() => {
    if (volunteerBreakdownTypeFilter === "all") {
      return {
        volunteers,
        versatile: versatileVolunteers,
        roleCounts: volunteerTypeCounts,
        groupCounts: volunteerGroupCounts,
        flexibleGroupCounts: volunteerFlexibleGroupCounts,
      }
    }

    const selected = volunteerBreakdownByType[volunteerBreakdownTypeFilter]
    return {
      volunteers: selected?.volunteers || 0,
      versatile: selected?.versatile || 0,
      roleCounts: selected?.roleCounts || { ...DEFAULT_VOLUNTEER_COUNTS },
      groupCounts: selected?.groupCounts || { ...DEFAULT_VOLUNTEER_GROUP_COUNTS },
      flexibleGroupCounts: selected?.flexibleGroupCounts || { ...DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS },
    }
  })()

  const hasLiveTourBreakdown = Boolean(volunteerBreakdownByType.tour)
  const showTourOnlyRoleCards = volunteerBreakdownTypeFilter === "tour"
    || (volunteerBreakdownTypeFilter === "all" && hasLiveTourBreakdown)

  const volunteerRoleCards = [
    { key: "food", label: "Food", color: "text-green-700", bg: "bg-green-50", tourOnly: true },
    { key: "raffle", label: "Raffle", color: "text-purple-700", bg: "bg-purple-50", tourOnly: true },
    { key: "spotter", label: "Spotter", color: "text-teal-700", bg: "bg-teal-50" },
    { key: "board_rescue", label: "Board Rescue", color: "text-blue-700", bg: "bg-blue-50" },
    { key: "lifeguard", label: "Lifeguard", color: "text-rose-700", bg: "bg-rose-50" },
    { key: "registration", label: "Registration", color: "text-blue-700", bg: "bg-blue-50" },
    { key: "setup_teardown", label: "Setup/Tear Down", color: "text-amber-700", bg: "bg-amber-50" },
    { key: "equipment_handling", label: "Equipment Handling", color: "text-slate-700", bg: "bg-slate-50" },
    { key: "snacks_drinks", label: "Snacks/Drinks", color: "text-emerald-700", bg: "bg-emerald-50" },
    { key: "buddy", label: "Buddy", color: "text-cyan-700", bg: "bg-cyan-50" },
    { key: "instructor", label: "Instructor", color: "text-orange-700", bg: "bg-orange-50" },
  ].filter((card) => !card.tourOnly || showTourOnlyRoleCards)
  const capacityColor =
    participantCapacity && registered >= participantCapacity
      ? "bg-danger"
      : percentFull > 80
      ? "bg-warning"
      : "bg-ocean";

  return (
    <div className="p-4 space-y-6">
      {filterSummary}
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

      <button
        type="button"
        onClick={() => navigate("/feedback")}
        className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-left shadow-sm transition hover:bg-indigo-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-900">Review Test Feedback</p>
            <p className="mt-1 text-sm text-indigo-800">Follow the release loop before building anything new.</p>
            <p className="mt-1 text-xs text-indigo-700">{getReleaseTag()}</p>
          </div>
          <span className="rounded-full border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-indigo-700">
            Open /feedback
          </span>
        </div>
      </button>

      {/* Overall Event Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Events"
          value={totalEvents}
          color="text-ocean"
          onClick={() => navigate("/events?type=all")}
          title="Open all events"
        />
        <StatCard
          label="Published Events"
          value={publishedEvents}
          color="text-success"
          onClick={() => navigate("/events?status=published&type=all")}
          title="Open published events"
        />
        <StatCard
          label="Draft Events"
          value={draftEvents}
          color="text-warning"
          onClick={() => navigate("/events?status=draft&type=all")}
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

      {selectedFeaturedImageUrl && (
        <img
          src={selectedFeaturedImageUrl}
          alt={event?.title ? `${event.title} featured` : "Event featured image"}
          className="mt-2 h-44 w-full rounded-lg border border-slate-200 object-cover"
          loading="lazy"
        />
      )}

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
              const featuredImageUrl = normalizeExternalUrl(liveEvent.featured_image)
              return (
              <div key={liveEvent.id} className={`rounded-lg p-3 ${tone.cardClass}`}>
                {featuredImageUrl && (
                  <img
                    src={featuredImageUrl}
                    alt={liveEvent.title ? `${liveEvent.title} featured` : "Event featured image"}
                    className="mb-2 h-24 w-full rounded-md border border-slate-200 object-cover"
                    loading="lazy"
                  />
                )}
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
            <p className="text-xs text-gray-500">Group and role totals for this event</p>
          </div>
          <span className="text-xs font-medium text-gray-500">{filteredBreakdown.volunteers} total • {filteredBreakdown.versatile} flexible</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {volunteerBreakdownTypeOptions.map((option) => {
            const selected = volunteerBreakdownTypeFilter === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setVolunteerBreakdownTypeFilter(option.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  selected
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title={`Show volunteer stats for ${option.label}`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Groups</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            {[
              { key: "beach", label: "Beach Group", color: "text-sky-700", bg: "bg-sky-50" },
              { key: "water", label: "Water Group", color: "text-cyan-700", bg: "bg-cyan-50" },
            ].map(({ key, label, color, bg }) => (
              <div
                key={key}
                className={`${bg} rounded-lg p-3 text-center cursor-pointer transition hover:brightness-95`}
                onClick={() => navigate(`/events/${event.id}?participants=volunteers`)}
                role="button"
                tabIndex={0}
                title={`Open volunteer roster for ${label}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    navigate(`/events/${event.id}?participants=volunteers`)
                  }
                }}
              >
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-2xl font-semibold ${color}`}>{filteredBreakdown.groupCounts[key] ?? 0}</p>
                <p className="mt-1 text-[11px] text-gray-600">Flexible: {filteredBreakdown.flexibleGroupCounts[key] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Volunteer Roles</p>
            <p className="text-[11px] text-gray-500">Counts reflect selected role pills only. Flexible totals are shown separately.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {volunteerRoleCards.map(({ key, label, color, bg }) => (
            <div
              key={key}
              className={`${bg} rounded-lg p-3 text-center cursor-pointer transition hover:brightness-95`}
              onClick={() => navigate(`/events/${event.id}?participants=volunteers&volunteer_role=${encodeURIComponent(key)}`)}
              role="button"
              tabIndex={0}
              title={`Open volunteer roster filtered to ${label}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  navigate(`/events/${event.id}?participants=volunteers&volunteer_role=${encodeURIComponent(key)}`)
                }
              }}
            >
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-semibold ${color}`}>{filteredBreakdown.roleCounts[key] ?? 0}</p>
            </div>
          ))}
          </div>
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