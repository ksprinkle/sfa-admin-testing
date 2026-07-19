import { useCallback, useEffect, useRef, useState } from "react"
import { fetchEvents, fetchEventSummary } from "../api/events"
import { useNavigate } from "react-router-dom";
import { getReleaseTag } from "../config/release"
import { normalizeExternalUrl } from "../utils/externalUrl"

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
    labelClass: "text-secondary",
    valueClass: "text-ocean",
    pillClass: "border-gray-300 bg-gray-100 text-secondary",
  }
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
const DASHBOARD_PREFERENCES_STORAGE_KEY = "sfa.dashboardPreferences"
const DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY = "sfa.dashboardRefreshIntervalMs"
const DASHBOARD_REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "5 minutes", value: 300000 },
]
const DEFAULT_DASHBOARD_REFRESH_INTERVAL_MS = 0
const DEFAULT_DASHBOARD_WIDGET_VISIBILITY = {
  quickActions: true,
  overallEventStats: true,
  eventsByType: true,
  liveEventSummary: true,
  eventParticipantCards: true,
  volunteerBreakdown: true,
  participantCapacity: true,
  checkInProgress: true,
}
const DEFAULT_DASHBOARD_LAYOUT_MODE = "comfortable"
const DASHBOARD_WIDGET_OPTIONS = [
  ["quickActions", "Quick Actions"],
  ["overallEventStats", "Overall Stats"],
  ["eventsByType", "Events by Type"],
  ["liveEventSummary", "Live Event Summary"],
  ["eventParticipantCards", "Event Participant Cards"],
  ["volunteerBreakdown", "Volunteer Breakdown"],
  ["participantCapacity", "Participant Capacity"],
  ["checkInProgress", "Check-In Progress"],
]

function readDashboardPreferences() {
  if (typeof window === "undefined") {
    return {
      layoutMode: DEFAULT_DASHBOARD_LAYOUT_MODE,
      widgetVisibility: { ...DEFAULT_DASHBOARD_WIDGET_VISIBILITY },
    }
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY)
    if (!raw) {
      return {
        layoutMode: DEFAULT_DASHBOARD_LAYOUT_MODE,
        widgetVisibility: { ...DEFAULT_DASHBOARD_WIDGET_VISIBILITY },
      }
    }

    const parsed = JSON.parse(raw)
    const layoutMode = parsed?.layoutMode === "compact" ? "compact" : DEFAULT_DASHBOARD_LAYOUT_MODE
    const widgetVisibility = {
      ...DEFAULT_DASHBOARD_WIDGET_VISIBILITY,
      ...(parsed?.widgetVisibility && typeof parsed.widgetVisibility === "object" ? parsed.widgetVisibility : {}),
    }

    return { layoutMode, widgetVisibility }
  } catch {
    return {
      layoutMode: DEFAULT_DASHBOARD_LAYOUT_MODE,
      widgetVisibility: { ...DEFAULT_DASHBOARD_WIDGET_VISIBILITY },
    }
  }
}

function readDashboardRefreshIntervalMs() {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_REFRESH_INTERVAL_MS

  const stored = Number(window.localStorage.getItem(DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY))
  const supported = DASHBOARD_REFRESH_OPTIONS.find((option) => option.value === stored)
  return supported ? supported.value : DEFAULT_DASHBOARD_REFRESH_INTERVAL_MS
}

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
  const [participantSummaryByEvent, setParticipantSummaryByEvent] = useState({})
  const [mainSummaryEventFilter, setMainSummaryEventFilter] = useState("all")
  const [volunteerBreakdownByType, setVolunteerBreakdownByType] = useState({})
  const [volunteerBreakdownTypeFilter, setVolunteerBreakdownTypeFilter] = useState("all")
  const [layoutMode, setLayoutMode] = useState(() => readDashboardPreferences().layoutMode)
  const [widgetVisibility, setWidgetVisibility] = useState(() => readDashboardPreferences().widgetVisibility)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() => readDashboardRefreshIntervalMs())
  const [isCustomizationMenuOpen, setIsCustomizationMenuOpen] = useState(false)
  const customizationMenuRef = useRef(null)

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
    if (!eventId) return
    navigate(`/events/${eventId}${getFilterQuery()}`);
  };

  const handleCheckIn = (eventId) => {
    if (!eventId) return
    navigate(`/events/${eventId}/checkin${getFilterQuery()}`);
  };

  const loadData = useCallback(async () => {
    try {
      const events = await fetchEvents()
      setEvents(events)

      const published = events.filter((candidate) => candidate.status?.toLowerCase() === "published")
      setLiveEvents(published)

      // Pick a default event for summary cards while still showing all live events.
      const active = published[0] || null

      if (!active) {
        setEvent(null)
        setRegistered(0)
        setWaitlisted(0)
        setCheckedIn(0)
        setClearedToParticipate(0)
        setVolunteers(0)
        setWaiversMissing(0)
        setVersatileVolunteers(0)
        setParticipantSummaryByEvent({})
        setMainSummaryEventFilter("all")
        setVolunteerTypeCounts(DEFAULT_VOLUNTEER_COUNTS)
        setVolunteerGroupCounts(DEFAULT_VOLUNTEER_GROUP_COUNTS)
        setVolunteerFlexibleGroupCounts(DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS)
        setVolunteerBreakdownByType({})
        setLoading(false)
        return
      }

      setEvent(active)

      // Γ£à fetch summary here (correct place)
      const summary = await fetchEventSummary(active.id)

      const summariesByType = {}
      const participantSummariesByEvent = {}
      const liveSummaryCandidates = (published.length > 0 ? published : [active]).filter(Boolean)
      const liveSummarySettled = await Promise.allSettled(
        liveSummaryCandidates.map((evt) => fetchEventSummary(evt.id))
      )

      for (const result of liveSummarySettled) {
        if (result.status !== "fulfilled") continue

        const item = result.value
        const matchingEvent = liveSummaryCandidates.find((evt) => String(evt.id) === String(item?.event_id))
        const eventTypeKey = String(matchingEvent?.event_type || "unspecified").trim().toLowerCase() || "unspecified"
        const eventKey = `event:${matchingEvent?.id || item?.event_id || eventTypeKey}`
        const existing = summariesByType[eventKey] || {
          label: matchingEvent?.title || `Event ${matchingEvent?.id || item?.event_id || "Unknown"}`,
          subLabel: matchingEvent?.start_date || "",
          eventId: matchingEvent?.id || item?.event_id || null,
          eventTypeKey,
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
        summariesByType[eventKey] = existing

        participantSummariesByEvent[eventKey] = {
          label: matchingEvent?.title || `Event ${matchingEvent?.id || item?.event_id || "Unknown"}`,
          subLabel: matchingEvent?.start_date || "",
          eventId: matchingEvent?.id || item?.event_id || null,
          registered: Number(item.registered_count ?? item.participant_count) || 0,
          waitlisted: Number(item.waitlist_count) || 0,
          checkedIn: Number(item.checked_in_count) || 0,
          clearedToParticipate: Number(item.cleared_to_participate_count) || 0,
          volunteers: Number(item.volunteer_count) || 0,
          waiversMissing: Number(item.waivers_missing) || 0,
          participantCapacity: Number(
            matchingEvent?.capacity?.participants ?? matchingEvent?.participant_capacity
          ) || 0,
        }
      }

      const hasLiveSummaryData = Object.keys(summariesByType).length > 0
      if (!hasLiveSummaryData) {
        const fallbackTypeKey = String(active?.event_type || "unspecified").trim().toLowerCase() || "unspecified"
        const fallbackKey = `event:${active?.id || fallbackTypeKey}`
        summariesByType[fallbackKey] = {
          label: active?.title || formatEventType(fallbackTypeKey),
          subLabel: active?.start_date || "",
          eventId: active?.id || null,
          eventTypeKey: fallbackTypeKey,
          volunteers: Number(summary.volunteer_count) || 0,
          versatile: Number(summary.versatile_volunteer_count) || 0,
          roleCounts: normalizeVolunteerTypeCounts(summary.volunteer_type_counts),
          groupCounts: normalizeVolunteerGroupCounts(summary.volunteer_group_counts),
          flexibleGroupCounts: normalizeFlexibleVolunteerGroupCounts(summary.volunteer_flexible_group_counts),
        }

        participantSummariesByEvent[fallbackKey] = {
          label: active?.title || formatEventType(fallbackTypeKey),
          subLabel: active?.start_date || "",
          eventId: active?.id || null,
          registered: Number(summary.registered_count ?? summary.participant_count) || 0,
          waitlisted: Number(summary.waitlist_count) || 0,
          checkedIn: Number(summary.checked_in_count) || 0,
          clearedToParticipate: Number(summary.cleared_to_participate_count) || 0,
          volunteers: Number(summary.volunteer_count) || 0,
          waiversMissing: Number(summary.waivers_missing) || 0,
          participantCapacity: Number(active?.capacity?.participants ?? active?.participant_capacity) || 0,
        }
      }

      setParticipantSummaryByEvent(participantSummariesByEvent)
      const activeSummaryKey = `event:${active?.id}`
      setMainSummaryEventFilter((previous) => {
        if (previous !== "all" && participantSummariesByEvent[previous]) {
          return previous
        }
        if (participantSummariesByEvent[activeSummaryKey]) {
          return activeSummaryKey
        }
        return "all"
      })
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
  }, [])

  // Manual refresh button handler
  const handleManualRefresh = () => {
    setLoading(true)
    loadData()
  }

useEffect(() => {
  loadData()
}, [loadData])

  // Refresh data when returning to dashboard
  useEffect(() => {
    const handleFocus = () => loadData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadData])

  useEffect(() => {
    if (typeof window === "undefined") return

    window.localStorage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ layoutMode, widgetVisibility }),
    )
  }, [layoutMode, widgetVisibility])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY, String(refreshIntervalMs))
  }, [refreshIntervalMs])

  useEffect(() => {
    if (!refreshIntervalMs || refreshIntervalMs <= 0) return undefined

    const timer = window.setInterval(() => {
      void loadData()
    }, refreshIntervalMs)

    return () => window.clearInterval(timer)
  }, [loadData, refreshIntervalMs])

  const toggleWidgetVisibility = (widgetKey) => {
    setWidgetVisibility((previous) => ({
      ...previous,
      [widgetKey]: !previous[widgetKey],
    }))
  }

  const restoreDashboardDefaults = () => {
    setLayoutMode(DEFAULT_DASHBOARD_LAYOUT_MODE)
    setWidgetVisibility({ ...DEFAULT_DASHBOARD_WIDGET_VISIBILITY })
    setRefreshIntervalMs(DEFAULT_DASHBOARD_REFRESH_INTERVAL_MS)
    setIsCustomizationMenuOpen(false)
  }

  const applySavedDashboardPreferences = useCallback(() => {
    const savedPreferences = readDashboardPreferences()
    setLayoutMode(savedPreferences.layoutMode)
    setWidgetVisibility(savedPreferences.widgetVisibility)
    setRefreshIntervalMs(readDashboardRefreshIntervalMs())
  }, [])

  useEffect(() => {
    applySavedDashboardPreferences()
  }, [applySavedDashboardPreferences])

  useEffect(() => {
    function handleStorage(event) {
      if (
        event.key === DASHBOARD_PREFERENCES_STORAGE_KEY
        || event.key === DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY
      ) {
        applySavedDashboardPreferences()
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [applySavedDashboardPreferences])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!customizationMenuRef.current) return
      if (!customizationMenuRef.current.contains(event.target)) {
        setIsCustomizationMenuOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsCustomizationMenuOpen(false)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])


  const totalEvents = events.length
  const publishedEvents = events.filter(
    (candidate) => candidate.status?.toLowerCase() === "published"
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
      .sort((a, b) => (volunteerBreakdownByType[a]?.label || "").localeCompare(volunteerBreakdownByType[b]?.label || ""))
      .map((key) => {
        const row = volunteerBreakdownByType[key]
        return {
          key,
          label: row?.subLabel ? `${row.label} (${row.subLabel})` : (row?.label || key),
        }
      }),
  ]

  const filteredBreakdown = (() => {
    if (volunteerBreakdownTypeFilter === "all") {
      const allRows = Object.values(volunteerBreakdownByType)
      if (allRows.length > 0) {
        return allRows.reduce(
          (acc, row) => ({
            volunteers: acc.volunteers + (Number(row?.volunteers) || 0),
            versatile: acc.versatile + (Number(row?.versatile) || 0),
            roleCounts: mergeCountMaps(acc.roleCounts, row?.roleCounts || {}),
            groupCounts: mergeCountMaps(acc.groupCounts, row?.groupCounts || {}),
            flexibleGroupCounts: mergeCountMaps(acc.flexibleGroupCounts, row?.flexibleGroupCounts || {}),
          }),
          {
            volunteers: 0,
            versatile: 0,
            roleCounts: { ...DEFAULT_VOLUNTEER_COUNTS },
            groupCounts: { ...DEFAULT_VOLUNTEER_GROUP_COUNTS },
            flexibleGroupCounts: { ...DEFAULT_VOLUNTEER_FLEXIBLE_GROUP_COUNTS },
          }
        )
      }

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

  const selectedVolunteerBreakdown =
    volunteerBreakdownTypeFilter === "all"
      ? null
      : volunteerBreakdownByType[volunteerBreakdownTypeFilter] || null
  const volunteerBreakdownContextLabel = selectedVolunteerBreakdown
    ? (selectedVolunteerBreakdown.subLabel
        ? `${selectedVolunteerBreakdown.label} (${selectedVolunteerBreakdown.subLabel})`
        : selectedVolunteerBreakdown.label)
    : "All Live Events"
  const volunteerBreakdownEventIdForNavigation = selectedVolunteerBreakdown?.eventId || event?.id || null

  const hasLiveTourBreakdown = Object.values(volunteerBreakdownByType)
    .some((row) => row?.eventTypeKey === "tour")
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

  const mainSummaryTypeOptions = [
    { key: "all", label: "All Live Events" },
    ...Object.keys(participantSummaryByEvent)
      .sort((a, b) => (participantSummaryByEvent[a]?.label || "").localeCompare(participantSummaryByEvent[b]?.label || ""))
      .map((key) => {
        const row = participantSummaryByEvent[key]
        return {
          key,
          label: row?.subLabel ? `${row.label} (${row.subLabel})` : (row?.label || key),
        }
      }),
  ]

  const selectedMainSummary =
    mainSummaryEventFilter === "all"
      ? null
      : participantSummaryByEvent[mainSummaryEventFilter] || null

  const mainSummaryStats = (() => {
    if (mainSummaryEventFilter === "all") {
      const allRows = Object.values(participantSummaryByEvent)
      if (allRows.length > 0) {
        const totalCapacity = allRows.reduce((sum, row) => sum + (Number(row?.participantCapacity) || 0), 0)
        const hasAnyCapacity = allRows.some((row) => Number(row?.participantCapacity) > 0)

        return allRows.reduce(
          (acc, row) => ({
            registered: acc.registered + (Number(row?.registered) || 0),
            waitlisted: acc.waitlisted + (Number(row?.waitlisted) || 0),
            checkedIn: acc.checkedIn + (Number(row?.checkedIn) || 0),
            clearedToParticipate: acc.clearedToParticipate + (Number(row?.clearedToParticipate) || 0),
            volunteers: acc.volunteers + (Number(row?.volunteers) || 0),
            waiversMissing: acc.waiversMissing + (Number(row?.waiversMissing) || 0),
            participantCapacity: hasAnyCapacity ? totalCapacity : 0,
          }),
          {
            registered: 0,
            waitlisted: 0,
            checkedIn: 0,
            clearedToParticipate: 0,
            volunteers: 0,
            waiversMissing: 0,
            participantCapacity: hasAnyCapacity ? totalCapacity : 0,
          }
        )
      }

      return {
        registered,
        waitlisted,
        checkedIn,
        clearedToParticipate,
        volunteers,
        waiversMissing,
        participantCapacity: Number(event?.capacity?.participants ?? event?.participant_capacity) || 0,
      }
    }

    if (selectedMainSummary) {
      return {
        registered: selectedMainSummary.registered || 0,
        waitlisted: selectedMainSummary.waitlisted || 0,
        checkedIn: selectedMainSummary.checkedIn || 0,
        clearedToParticipate: selectedMainSummary.clearedToParticipate || 0,
        volunteers: selectedMainSummary.volunteers || 0,
        waiversMissing: selectedMainSummary.waiversMissing || 0,
        participantCapacity: selectedMainSummary.participantCapacity || 0,
      }
    }

    return {
      registered,
      waitlisted,
      checkedIn,
      clearedToParticipate,
      volunteers,
      waiversMissing,
      participantCapacity: Number(event?.capacity?.participants ?? event?.participant_capacity) || 0,
    }
  })()

  const summaryRegistered = mainSummaryStats.registered
  const summaryWaitlisted = mainSummaryStats.waitlisted
  const summaryCheckedIn = mainSummaryStats.checkedIn
  const summaryClearedToParticipate = mainSummaryStats.clearedToParticipate
  const summaryVolunteers = mainSummaryStats.volunteers
  const summaryWaiversMissing = mainSummaryStats.waiversMissing
  const participantCapacity = mainSummaryStats.participantCapacity
  const eventParticipantsTotal = summaryRegistered + summaryWaitlisted
  const selectedMainSummaryContextLabel = selectedMainSummary
    ? (selectedMainSummary.subLabel
        ? `${selectedMainSummary.label} (${selectedMainSummary.subLabel})`
        : selectedMainSummary.label)
    : "All Live Events"
  const mainSummaryEventIdForNavigation = selectedMainSummary?.eventId || null
  const canOpenFilteredEventRoster = Boolean(mainSummaryEventIdForNavigation)

  const hasMultipleLiveEvents = liveEvents.length > 1
  const selectedFeaturedImageUrl = normalizeExternalUrl(event?.featured_image)
  const percentFull = participantCapacity
    ? Math.min((summaryRegistered / participantCapacity) * 100, 100)
    : 0
  const capacityColor =
    participantCapacity && registered >= participantCapacity
      ? "bg-danger"
      : percentFull > 80
      ? "bg-warning"
      : "bg-ocean";

  const topStatsGridClass = layoutMode === "compact"
    ? "grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4"
    : "grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 xl:grid-cols-4"

  let filterSummary = null
  if (currentParticipantFilter || currentVolunteerType) {
    const parts = []
    if (currentParticipantFilter) {
      parts.push(`Participants: ${currentParticipantFilter.charAt(0).toUpperCase() + currentParticipantFilter.slice(1)}`)
    }
    if (currentVolunteerType) {
      parts.push(`Role: ${currentVolunteerType.charAt(0).toUpperCase() + currentVolunteerType.slice(1)}`)
    }
    filterSummary = (
      <div className="mb-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs font-medium text-blue-800">
        Showing: {parts.join(", ")}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {filterSummary}
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-semibold flex-1">Dashboard</h1>
        <div ref={customizationMenuRef} className="relative mr-2">
          <button
            type="button"
            onClick={() => setIsCustomizationMenuOpen((previous) => !previous)}
            className="px-3 py-1 border border-slate-300 bg-white text-slate-700 rounded hover:bg-slate-50 text-sm"
            title="Customize dashboard"
            aria-haspopup="dialog"
            aria-expanded={isCustomizationMenuOpen}
            aria-controls="dashboard-customization-menu"
          >
            Customize
          </button>

          {isCustomizationMenuOpen ? (
            <div
              id="dashboard-customization-menu"
              role="dialog"
              aria-label="Dashboard customization menu"
              className="absolute right-0 z-20 mt-2 w-[min(92vw,320px)] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Dashboard Customization</p>
                <button
                  type="button"
                  onClick={restoreDashboardDefaults}
                  className="text-xs font-medium text-blue-700 hover:text-blue-900"
                >
                  Restore defaults
                </button>
              </div>

              <p className="mt-1 text-xs text-secondary">Show or hide sections and tune your dashboard display.</p>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-secondary">Layout</span>
                <div className="flex items-center gap-1">
                  {["comfortable", "compact"].map((option) => {
                    const selected = layoutMode === option
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setLayoutMode(option)}
                        aria-pressed={selected}
                        className={`rounded-full border px-2 py-0.5 text-xs capitalize ${selected ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="mt-3 block text-xs text-secondary">
                Auto refresh
                <select
                  value={refreshIntervalMs}
                  onChange={(event) => setRefreshIntervalMs(Number(event.target.value) || 0)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                >
                  {DASHBOARD_REFRESH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DASHBOARD_WIDGET_OPTIONS.map(([key, label]) => {
                  const isVisible = Boolean(widgetVisibility[key])
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleWidgetVisibility(key)}
                      aria-pressed={isVisible}
                      className={`rounded-lg border px-2 py-1 text-left text-xs ${isVisible ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                      title={`${isVisible ? "Hide" : "Show"} ${label}`}
                    >
                      {isVisible ? "Visible" : "Hidden"} - {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        <button
          onClick={handleManualRefresh}
          className="ml-2 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          title="Refresh dashboard"
        >
          Refresh
        </button>
      </div>

      {widgetVisibility.quickActions ? <button
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
      </button> : null}

      {widgetVisibility.quickActions ? <button
        type="button"
        onClick={() => navigate("/waiver-templates")}
        className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-left shadow-sm transition hover:bg-sky-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sky-900">Manage Waiver Templates</p>
            <p className="mt-1 text-sm text-sky-800">Create draft versions, preview content, and activate one immutable Active waiver.</p>
          </div>
          <span className="rounded-full border border-sky-300 bg-white px-2 py-1 text-xs font-semibold text-sky-700">
            Open /waiver-templates
          </span>
        </div>
      </button> : null}

      {widgetVisibility.quickActions ? <button
        type="button"
        onClick={() => navigate("/volunteer-dashboard")}
        className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left shadow-sm transition hover:bg-emerald-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Volunteer Operational Dashboard</p>
            <p className="mt-1 text-sm text-emerald-800">Read-only current state projection for assignment, check-in, documents, and action-required status.</p>
          </div>
          <span className="rounded-full border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
            Open /volunteer-dashboard
          </span>
        </div>
      </button> : null}

      {widgetVisibility.quickActions ? <button
        type="button"
        onClick={() => navigate("/executive-dashboard")}
        className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-left shadow-sm transition hover:bg-blue-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">Executive Analytics Dashboard</p>
            <p className="mt-1 text-sm text-blue-800">Read-only analytics projection with metric keys, calculation timestamps, and canonical data sources.</p>
          </div>
          <span className="rounded-full border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-700">
            Open /executive-dashboard
          </span>
        </div>
      </button> : null}

      {widgetVisibility.quickActions ? <button
        type="button"
        onClick={() => navigate("/audit-log")}
        className="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 text-left shadow-sm transition hover:bg-violet-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-900">Audit Log</p>
            <p className="mt-1 text-sm text-violet-800">Review administrative activity recorded across the app.</p>
          </div>
          <span className="rounded-full border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-violet-700">
            Open /audit-log
          </span>
        </div>
      </button> : null}

      {widgetVisibility.quickActions ? <button
        type="button"
        onClick={() => navigate("/permissions")}
        className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-left shadow-sm transition hover:bg-rose-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-rose-900">Permissions Management</p>
            <p className="mt-1 text-sm text-rose-800">Search users, review roles, and change access.</p>
          </div>
          <span className="rounded-full border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-700">
            Open /permissions
          </span>
        </div>
      </button> : null}

      {widgetVisibility.quickActions ? <button
        type="button"
        onClick={() => navigate("/automation")}
        className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-left shadow-sm transition hover:bg-amber-100/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Automation</p>
            <p className="mt-1 text-sm text-amber-800">Manage workflow definitions, execute workflows manually, and review execution history.</p>
          </div>
          <span className="rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-700">
            Open /automation
          </span>
        </div>
      </button> : null}

      {/* Overall Event Stats */}
      {widgetVisibility.overallEventStats ? <div className={topStatsGridClass}>
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
      </div> : null}

      {widgetVisibility.eventsByType ? <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Events by Type</h2>
            <p className="text-xs text-secondary">
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
      </div> : null}

      {event ? (
        <>
          {/* Live Event Stats */}
          {widgetVisibility.liveEventSummary ? <div
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

            <p className="text-sm text-secondary">
              {event.title} • {event.start_date}
            </p>
            <p className="text-xs font-medium text-secondary">
              Event Type: {formatEventType(event.event_type)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-ocean/30 bg-ocean/10 px-2 py-0.5 text-ocean">
                Active: {participantCapacity ? `${summaryRegistered}/${participantCapacity}` : `${summaryRegistered}/no max`}
              </span>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
                Waitlist: {summaryWaitlisted}
              </span>
              <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-secondary">
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
                        <p className="text-xs text-secondary">
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
                    )
                  })}
                </div>
              </div>
            )}
          </div> : null}

          {hasMultipleLiveEvents && (
            <div className="bg-white rounded-xl shadow p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Main Summary Filter</h2>
                  <p className="text-xs text-secondary">Select which live event drives the main summary cards.</p>
                </div>
                <span className="text-xs font-medium text-secondary">Showing: {selectedMainSummaryContextLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mainSummaryTypeOptions.map((option) => {
                  const selected = mainSummaryEventFilter === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setMainSummaryEventFilter(option.key)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        selected
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                      title={`Show main summary stats for ${option.label}`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Registered"
              value={summaryRegistered}
              color="text-ocean"
              onClick={canOpenFilteredEventRoster ? () => navigate(`/events/${mainSummaryEventIdForNavigation}?participants=registered`) : undefined}
              title={canOpenFilteredEventRoster ? "Open event roster filtered to registered participants" : "Choose a specific event in Main Summary Filter to open event roster"}
            />
            <StatCard
              label="Waitlisted"
              value={summaryWaitlisted}
              color="text-warning"
              onClick={canOpenFilteredEventRoster ? () => navigate(`/events/${mainSummaryEventIdForNavigation}?participants=waitlisted`) : undefined}
              title={canOpenFilteredEventRoster ? "Open event roster filtered to waitlisted participants" : "Choose a specific event in Main Summary Filter to open event roster"}
            />
            <StatCard
              label="Cleared to Participate"
              value={summaryClearedToParticipate}
              color="text-success"
              onClick={canOpenFilteredEventRoster ? () => navigate(`/events/${mainSummaryEventIdForNavigation}?participants=cleared`) : undefined}
              title={canOpenFilteredEventRoster ? "Open event roster filtered to waiver-verified checked-in participants" : "Choose a specific event in Main Summary Filter to open event roster"}
            />
            <StatCard
              label="Checked In"
              value={summaryCheckedIn}
              color="text-success"
              onClick={canOpenFilteredEventRoster ? () => navigate(`/events/${mainSummaryEventIdForNavigation}?participants=checked_in`) : undefined}
              title={canOpenFilteredEventRoster ? "Open event roster filtered to checked-in participants" : "Choose a specific event in Main Summary Filter to open event roster"}
            />
            <StatCard
              label="Volunteers"
              value={summaryVolunteers}
              color="text-ocean"
              onClick={canOpenFilteredEventRoster ? () => navigate(`/events/${mainSummaryEventIdForNavigation}?participants=volunteers`) : undefined}
              title={canOpenFilteredEventRoster ? "Open event roster filtered to volunteers" : "Choose a specific event in Main Summary Filter to open event roster"}
            />
            <StatCard
              label="Waivers Missing"
              value={summaryWaiversMissing}
              color="text-danger"
              onClick={canOpenFilteredEventRoster ? () => navigate(`/events/${mainSummaryEventIdForNavigation}?participants=waiver_missing`) : undefined}
              title={canOpenFilteredEventRoster ? "Open event roster filtered to missing waivers" : "Choose a specific event in Main Summary Filter to open event roster"}
            />
          </div>

          {/* Volunteer Type Breakdown */}
          <div className="hidden bg-white rounded-xl shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Volunteer Breakdown</h2>
                <p className="text-xs text-secondary">Group and role totals for {volunteerBreakdownContextLabel}</p>
              </div>
              <span className="text-xs font-medium text-secondary">{filteredBreakdown.volunteers} total • {filteredBreakdown.versatile} flexible</span>
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Groups</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                {[
                  { key: "beach", label: "Beach Group", color: "text-sky-700", bg: "bg-sky-50" },
                  { key: "water", label: "Water Group", color: "text-cyan-700", bg: "bg-cyan-50" },
                ].map(({ key, label, color, bg }) => (
                  <div
                    key={key}
                    className={`${bg} rounded-lg p-3 text-center cursor-pointer transition hover:brightness-95`}
                    onClick={() => volunteerBreakdownEventIdForNavigation && navigate(`/events/${volunteerBreakdownEventIdForNavigation}?participants=volunteers`)}
                    role="button"
                    tabIndex={0}
                    title={`Open volunteer roster for ${label}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        if (volunteerBreakdownEventIdForNavigation) {
                          navigate(`/events/${volunteerBreakdownEventIdForNavigation}?participants=volunteers`)
                        }
                      }
                    }}
                  >
                    <p className="text-xs text-secondary mb-1">{label}</p>
                    <p className={`text-2xl font-semibold ${color}`}>{filteredBreakdown.groupCounts[key] ?? 0}</p>
                    <p className="mt-1 text-[11px] text-secondary">Flexible: {filteredBreakdown.flexibleGroupCounts[key] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Volunteer Roles</p>
                <p className="text-[11px] text-secondary">Counts reflect selected role pills only. Flexible totals are shown separately.</p>
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
                    <p className="text-xs text-secondary mb-1">{label}</p>
                    <p className={`text-2xl font-semibold ${color}`}>{filteredBreakdown.roleCounts[key] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>


          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <p className="text-sm font-medium text-secondary">
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
                <p className="text-xs text-secondary">
                  {summaryRegistered} of {participantCapacity} spots filled
                </p>
              </>
            ) : (
              <p className="text-xs text-secondary">No participant capacity set for the selected summary filter.</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <p className="text-sm font-medium text-secondary">
              Check-In Progress
            </p>

            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500"
                style={{ width: `${summaryRegistered > 0 ? (summaryCheckedIn / summaryRegistered) * 100 : 0}%` }}
              />
            </div>

            <p className="text-xs text-secondary">
              {summaryCheckedIn} of {summaryRegistered} registered participants checked in
            </p>
          </div>

          {summaryWaitlisted > 0 && (
            <div className="bg-warning/10 border border-warning rounded-lg p-3 text-sm text-warning">
              {summaryWaitlisted} participant(s) currently on waitlist
            </div>
          )}

          <div className="flex gap-4 mt-6">

            <button
              onClick={() => handleViewRoster(mainSummaryEventIdForNavigation)}
              disabled={!canOpenFilteredEventRoster}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
            >
              View Full Roster
            </button>

            <button
              onClick={() => handleCheckIn(mainSummaryEventIdForNavigation)}
              disabled={!canOpenFilteredEventRoster}
              className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
            >
              Check In
            </button>

          </div>

          {hasMultipleLiveEvents && !canOpenFilteredEventRoster && (
            <p className="text-xs text-secondary">
              Select a specific event in Main Summary Filter to open roster and check-in actions.
            </p>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No active event found. Overall dashboard stats and workflow shortcuts are still available below.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4" style={{ display: "none" }}>
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
          {widgetVisibility.volunteerBreakdown ? <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Volunteer Breakdown</h2>
            <p className="text-xs text-secondary">Group and role totals for {volunteerBreakdownContextLabel}</p>
          </div>
          <span className="text-xs font-medium text-secondary">{filteredBreakdown.volunteers} total ΓÇó {filteredBreakdown.versatile} flexible</span>
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Groups</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            {[
              { key: "beach", label: "Beach Group", color: "text-sky-700", bg: "bg-sky-50" },
              { key: "water", label: "Water Group", color: "text-cyan-700", bg: "bg-cyan-50" },
            ].map(({ key, label, color, bg }) => (
              <div
                key={key}
                className={`${bg} rounded-lg p-3 text-center cursor-pointer transition hover:brightness-95`}
                onClick={() => volunteerBreakdownEventIdForNavigation && navigate(`/events/${volunteerBreakdownEventIdForNavigation}?participants=volunteers`)}
                role="button"
                tabIndex={0}
                title={`Open volunteer roster for ${label}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    if (volunteerBreakdownEventIdForNavigation) {
                      navigate(`/events/${volunteerBreakdownEventIdForNavigation}?participants=volunteers`)
                    }
                  }
                }}
              >
                <p className="text-xs text-secondary mb-1">{label}</p>
                <p className={`text-2xl font-semibold ${color}`}>{filteredBreakdown.groupCounts[key] ?? 0}</p>
                <p className="mt-1 text-[11px] text-secondary">Flexible: {filteredBreakdown.flexibleGroupCounts[key] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Volunteer Roles</p>
            <p className="text-[11px] text-secondary">Counts reflect selected role pills only. Flexible totals are shown separately.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {volunteerRoleCards.map(({ key, label, color, bg }) => (
            <div
              key={key}
              className={`${bg} rounded-lg p-3 text-center cursor-pointer transition hover:brightness-95`}
              onClick={() => volunteerBreakdownEventIdForNavigation && navigate(`/events/${volunteerBreakdownEventIdForNavigation}?participants=volunteers&volunteer_role=${encodeURIComponent(key)}`)}
              role="button"
              tabIndex={0}
              title={`Open volunteer roster filtered to ${label}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  if (volunteerBreakdownEventIdForNavigation) {
                    navigate(`/events/${volunteerBreakdownEventIdForNavigation}?participants=volunteers&volunteer_role=${encodeURIComponent(key)}`)
                  }
                }
              }}
            >
              <p className="text-xs text-secondary mb-1">{label}</p>
              <p className={`text-2xl font-semibold ${color}`}>{filteredBreakdown.roleCounts[key] ?? 0}</p>
            </div>
          ))}
          </div>
        </div>
          </div> : null}


    </div>
  )
}

export function StatCard({ label, value, color, onClick, title, cardClass = "", labelColor = "text-secondary" }) {
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
