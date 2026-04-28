import { useEffect, useRef, useState } from "react"


import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { fetchAdminEvent, fetchEventParticipants, updateParticipantSession, updateParticipantPriority, duplicateEvent, saveEventAsTemplate } from "../api/events"
import { fetchNoShowCandidates, promoteNoShowSlots } from "../api/no_show"
import BackButton from "../components/BackButton"
import SyncStateIndicator from "../components/SyncStateIndicator"

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"

import { DragOverlay } from "@dnd-kit/core"

const EVENT_MODE_KEY = "sfa.event.mode"
const EVENT_DETAIL_PARTICIPANTS_CACHE_PREFIX = "sfa.offline.eventdetail.participants."
const EVENT_DETAIL_ACTION_QUEUE_PREFIX = "sfa.offline.eventdetail.queue."
const NON_RETRYABLE_STATUS_CODES = new Set([400, 404])
const RECOVERABLE_STATUS_CODES = new Set([409, 429, 500, 502, 503, 504])

function buildQueueItemId(action, entityId, updatedAt) {
  return String(action?.id || `${String(action?.type || "action")}:${String(entityId || "unknown")}:${Number(updatedAt || Date.now())}`)
}
const PRIORITY_LEVELS = [
  { value: 1, label: "High", dotClass: "bg-red-500" },
  { value: 2, label: "Medium", dotClass: "bg-amber-400" },
  { value: 3, label: "Low", dotClass: "bg-gray-500" },
  { value: 0, label: "Unset", dotClass: "bg-gray-300" },
]
const CHAPTER_SCHEDULE_DEFAULT = {
  schedule_rule_type: "nth_weekday",
  schedule_months: [5, 6, 7, 8, 9],
  schedule_weekday: 5,
  schedule_week_numbers: [2, 3],
}
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
]

function parseIntegerCsv(value) {
  return String(value || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n))
}

function formatEventType(eventType) {
  if (!eventType) return "Unspecified"

  return eventType
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildLocationSummary(eventInfo) {
  const location = eventInfo?.location || {}
  return [location.venue, location.city, location.state].filter(Boolean).join(", ") || "Location details not set"
}

function buildMapUrl(eventInfo) {
  // Use manual map URL if provided
  if (eventInfo?.map_url) {
    return eventInfo.map_url
  }

  const latitude = eventInfo?.location?.latitude
  const longitude = eventInfo?.location?.longitude

  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
  }

  const fallbackLocation = buildLocationSummary(eventInfo)
  if (fallbackLocation !== "Location details not set") {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackLocation)}`
  }

  return null
}

function normalizeExternalUrl(rawUrl) {
  const value = String(rawUrl || "").trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith("//")) return `https:${value}`
  return `https://${value}`
}

function buildWeatherUrl(eventInfo) {
  const manualUrl = normalizeExternalUrl(eventInfo?.weather_report_url)
  if (manualUrl) return manualUrl

  const latitude = eventInfo?.location?.latitude
  const longitude = eventInfo?.location?.longitude

  if (latitude != null && longitude != null) {
    return `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`
  }

  return null
}

function buildSurfUrl(eventInfo) {
  const manualUrl = normalizeExternalUrl(eventInfo?.surf_report_url)
  if (manualUrl) return manualUrl

  const latitude = eventInfo?.location?.latitude
  const longitude = eventInfo?.location?.longitude

  if (latitude != null && longitude != null) {
    return `https://www.magicseaweed.com/Forecast/Search?q=${latitude},${longitude}`
  }

  return null
}

function getEventParticipantsCacheKey(eventId) {
  return `${EVENT_DETAIL_PARTICIPANTS_CACHE_PREFIX}${String(eventId || "")}`
}

function getEventQueueKey(eventId) {
  return `${EVENT_DETAIL_ACTION_QUEUE_PREFIX}${String(eventId || "")}`
}

function getCachedEventParticipants(eventId) {
  try {
    const raw = localStorage.getItem(getEventParticipantsCacheKey(eventId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCachedEventParticipants(eventId, participants) {
  try {
    localStorage.setItem(getEventParticipantsCacheKey(eventId), JSON.stringify(Array.isArray(participants) ? participants : []))
  } catch {
    // Ignore storage failures.
  }
}

function normalizeQueuedEventAction(action) {
  if (!action || typeof action !== "object") return null
  if (!action.type || action.participantId == null) return null

  const updatedAt = Number.isFinite(Number(action.updatedAt)) ? Number(action.updatedAt) : Date.now()
  const syncStatus = action.syncStatus === "failed"
    ? "failed"
    : action.syncStatus === "synced"
      ? "synced"
      : action.status === "failed"
        ? "failed"
        : action.status === "synced"
          ? "synced"
          : "pending"
  const lastError = String(action.lastError || action.error || "")

  return {
    ...action,
    id: buildQueueItemId(action, action.participantId, updatedAt),
    participantId: String(action.participantId),
    syncStatus,
    status: syncStatus,
    retryable: action.retryable !== false,
    lastStatus: Number.isFinite(Number(action.lastStatus)) ? Number(action.lastStatus) : null,
    lastError,
    error: lastError || null,
    updatedAt,
    lastAttemptAt: updatedAt,
  }
}

function getSyncStatus(entityId, queue) {
  return (queue || []).find((item) => String(item.participantId) === String(entityId) && item.syncStatus !== "synced") || null
}

function dedupeEventQueue(actions) {
  const byKey = new Map()
  for (const action of actions || []) {
    const normalized = normalizeQueuedEventAction(action)
    if (!normalized) continue
    const actionKey =
      normalized.type === "priority_update"
        ? `${normalized.type}:${normalized.participantId}`
        : `${normalized.type}:${normalized.participantId}:${normalized.id || normalized.updatedAt}`
    byKey.set(actionKey, normalized)
  }
  return [...byKey.values()]
}

function getQueuedEventActions(eventId) {
  try {
    const raw = localStorage.getItem(getEventQueueKey(eventId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? dedupeEventQueue(parsed) : []
  } catch {
    return []
  }
}

function saveQueuedEventActions(eventId, actions) {
  try {
    localStorage.setItem(getEventQueueKey(eventId), JSON.stringify(dedupeEventQueue(actions)))
  } catch {
    // Ignore storage failures.
  }
}

function isOfflineError(err) {
  const msg = String(err?.message || "").toLowerCase()
  return !navigator.onLine || msg.includes("failed to fetch") || msg.includes("load failed") || msg.includes("network")
}

function getQueueErrorMeta(err) {
  const status = Number(err?.status)
  const safeStatus = Number.isFinite(status) ? status : null
  const detail = String(err?.message || "Unknown error")

  if (safeStatus === 404) {
    return { retryable: false, status: safeStatus, detail, summary: "participant no longer exists" }
  }
  if (safeStatus === 400) {
    return { retryable: false, status: safeStatus, detail, summary: "invalid participant state" }
  }
  if (safeStatus === 409) {
    return { retryable: true, status: safeStatus, detail, summary: "capacity or state conflict" }
  }

  return {
    retryable: RECOVERABLE_STATUS_CODES.has(safeStatus) || safeStatus == null || !NON_RETRYABLE_STATUS_CODES.has(safeStatus),
    status: safeStatus,
    detail,
    summary: "server rejected the update",
  }
}

function enqueueEventAction(eventId, action) {
  const normalized = normalizeQueuedEventAction({
    ...action,
    syncStatus: "pending",
    status: "pending",
    retryable: true,
    lastStatus: null,
    lastError: "",
    error: null,
    updatedAt: Date.now(),
    lastAttemptAt: Date.now(),
  })
  if (!normalized) return getQueuedEventActions(eventId)

  const queue = getQueuedEventActions(eventId)

  if (normalized.type === "priority_update") {
    const filtered = queue.filter((item) => !(item.type === normalized.type && String(item.participantId) === String(normalized.participantId)))
    const next = [...filtered, normalized]
    saveQueuedEventActions(eventId, next)
    return next
  }

  const next = [...queue, normalized]
  saveQueuedEventActions(eventId, next)
  return next
}

function EventDetail() {
    const [noShows, setNoShows] = useState([])
    const [promoteLoading, setPromoteLoading] = useState(false)
    const [noShowError, setNoShowError] = useState(null)

    // Fetch no-show candidates
    async function refreshNoShows() {
      setNoShowError(null); // Always clear error before fetch
      try {
        const ids = await fetchNoShowCandidates(eventId);
        setNoShows(Array.isArray(ids) ? ids : []);
      } catch (err) {
        // Log the actual error for debugging
        console.error("No-show fetch error:", err);
        setNoShows([]);
        setNoShowError("Failed to fetch no-show candidates");
      }
    }

    // Manual promotion for no-show slots
    async function handlePromoteNoShows() {
      setPromoteLoading(true)
      setNoShowError(null)
      try {
        await promoteNoShowSlots(eventId)
        await refreshParticipants()
        await refreshNoShows()
      } catch (err) {
        setNoShowError("Promotion failed")
      } finally {
        setPromoteLoading(false)
      }
    }
  const { eventId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams()
  const participantFilter = (searchParams.get("participants") || "all").toLowerCase()
  useEffect(() => {
    if (typeof window !== "undefined" && participantFilter) {
      window.localStorage.setItem("sfa.lastParticipantFilter", participantFilter);
    }
  }, [participantFilter]);
  const volunteerTypeAliases = {
    surf_buddy: "buddy",
    surf_instructor: "instructor",
  }
  // Restore volunteerTypeFilter from localStorage if not present in URL, and sync URL if needed
  const [volunteerTypeFilterRaw, setVolunteerTypeFilterRaw] = useState((searchParams.get("volunteer_type") || searchParams.get("volunteerType") || "").trim().toLowerCase());
  useEffect(() => {
    let raw = (searchParams.get("volunteer_type") || searchParams.get("volunteerType") || "").trim().toLowerCase();
    if (!raw && typeof window !== "undefined") {
      const saved = window.localStorage.getItem("sfa.volunteerTypeFilter");
      if (saved) {
        // Update URL to include the saved filter
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("participants", "volunteers");
        nextParams.set("volunteer_type", saved);
        window.localStorage.setItem("sfa.volunteerTypeFilter", saved);
        setSearchParams(nextParams, { replace: true });
        raw = saved;
      }
    }
    setVolunteerTypeFilterRaw(raw);
  }, [searchParams, setSearchParams]);

  // Always update both URL and localStorage when a pill is clicked
  const applyVolunteerTypeFilter = (roleKey) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("participants", "volunteers");
    nextParams.delete("volunteer_role");
    if (roleKey) {
      nextParams.set("volunteer_type", roleKey);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("sfa.volunteerTypeFilter", roleKey);
      }
    } else {
      nextParams.delete("volunteer_type");
      nextParams.delete("volunteerType");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("sfa.volunteerTypeFilter");
      }
    }
    setSearchParams(nextParams);
  };
  const volunteerTypeFilter = volunteerTypeAliases[volunteerTypeFilterRaw] || volunteerTypeFilterRaw;
  const volunteerRoleFilterRaw = (searchParams.get("volunteer_role") || "").trim().toLowerCase()
  const volunteerRoleFilter = volunteerTypeAliases[volunteerRoleFilterRaw] || volunteerRoleFilterRaw

  // Utility: Refresh participants from API
  async function refreshParticipants() {
    try {
      const data = await fetchEventParticipants(eventId)
      setParticipants(data || [])
      saveCachedEventParticipants(eventId, data || [])
    } catch (err) {
      console.error("Failed to refresh participants", err)
      const cached = getCachedEventParticipants(eventId)
      if (cached.length > 0) {
        setParticipants(cached)
      }
    }
  }

  // WebSocket: Listen for real-time updates and refresh participants
  useEffect(() => {
    const apiBase = import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`)
    const wsUrl = apiBase.replace(/^http/, "ws") + "/api/ws/updates";
    let ws = null;
    let reconnectTimer = null;
    let isCancelled = false;

    const connect = () => {
      if (isCancelled) return;
      ws = new window.WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "participant_update") {
            refreshParticipants();
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (isCancelled) return;
        reconnectTimer = window.setTimeout(connect, 1000);
      };

      ws.onerror = () => {
        // Let onclose handle reconnect timing.
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && ws.readyState === window.WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [eventId]);

  // Fallback sync: periodically refresh while visible to avoid stale UI if
  // websocket reconnect is delayed on some devices/networks.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        refreshParticipants();
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [eventId]);

  // Priority legend kept consistent with Participants page.
  const PriorityLegend = () => (
      <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <span className="font-semibold uppercase tracking-wide text-gray-500">Priority legend</span>
        {PRIORITY_LEVELS.map((level) => (
          <span key={level.value} className="inline-flex items-center gap-2">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white">
              <span className={`h-2.5 w-2.5 rounded-full ${level.dotClass}`} />
            </span>
            <span>{level.label}</span>
          </span>
        ))}
      </div>
    );
  const navigate = useNavigate()
  // (eventId already declared above)

  const [participants, setParticipants] = useState([])
  const [eventInfo, setEventInfo] = useState(null)
  const [eventMode, setEventMode] = useState(localStorage.getItem(EVENT_MODE_KEY) === "on")
  const [eventStartAt, setEventStartAt] = useState(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [activeTransform, setActiveTransform] = useState(null)
  const [dragError, setDragError] = useState(null)
  const [queuedEventActions, setQueuedEventActions] = useState(() => getQueuedEventActions(eventId))
  const [queueNotice, setQueueNotice] = useState("")
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine)
  const [duplicateLoading, setDuplicateLoading] = useState(false)
  const [duplicateError, setDuplicateError] = useState("")
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false)
  const [saveTemplateError, setSaveTemplateError] = useState("")
  const [saveTemplateMessage, setSaveTemplateMessage] = useState("")
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false)
  const [saveTemplateNameInput, setSaveTemplateNameInput] = useState("")
  const [useChapterSchedule, setUseChapterSchedule] = useState(true)
  const [scheduleMonthsInput, setScheduleMonthsInput] = useState(CHAPTER_SCHEDULE_DEFAULT.schedule_months.join(","))
  const [scheduleWeekdayInput, setScheduleWeekdayInput] = useState(String(CHAPTER_SCHEDULE_DEFAULT.schedule_weekday))
  const [scheduleWeekNumbersInput, setScheduleWeekNumbersInput] = useState(CHAPTER_SCHEDULE_DEFAULT.schedule_week_numbers.join(","))
  const queueSyncRef = useRef(false)

  const pendingQueueCount = queuedEventActions.filter((item) => item.syncStatus !== "failed").length
  const failedQueueCount = queuedEventActions.filter((item) => item.syncStatus === "failed").length
  const queueStateByParticipant = queuedEventActions.reduce((acc, item) => {
    const participantId = String(item.participantId)
    const current = acc[participantId]
    if (item.syncStatus === "failed") {
      acc[participantId] = "failed"
      return acc
    }
    if (!current) {
      acc[participantId] = "pending"
    }
    return acc
  }, {})

  const persistQueuedEventActions = (nextQueue) => {
    const normalized = dedupeEventQueue(nextQueue)
    saveQueuedEventActions(eventId, normalized)
    setQueuedEventActions(normalized)
    return normalized
  }

  const retryRecoverableQueueActions = () => {
    const next = queuedEventActions.map((item) => {
      if (item.syncStatus === "failed" && item.retryable) {
        return {
          ...item,
          syncStatus: "pending",
          status: "pending",
          lastStatus: null,
          lastError: "",
          error: null,
          updatedAt: Date.now(),
          lastAttemptAt: Date.now(),
        }
      }
      return item
    })
    persistQueuedEventActions(next)
    setQueueNotice("")
    processQueuedEventActions()
  }

  const dismissFailedQueueActions = () => {
    const next = queuedEventActions.filter((item) => item.syncStatus !== "failed")
    persistQueuedEventActions(next)
    setQueueNotice("")
  }

  const retryQueueItem = (queueItemId) => {
    const next = queuedEventActions.map((item) => {
      if (String(item.id) !== String(queueItemId) || item.syncStatus !== "failed" || !item.retryable) {
        return item
      }
      return {
        ...item,
        syncStatus: "pending",
        status: "pending",
        lastStatus: null,
        lastError: "",
        error: null,
        updatedAt: Date.now(),
        lastAttemptAt: Date.now(),
      }
    })
    persistQueuedEventActions(next)
    setQueueNotice("")
    processQueuedEventActions()
  }

  const updateParticipantsLocal = (updater) => {
    setParticipants((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater
      saveCachedEventParticipants(eventId, next)
      return next
    })
  }

  const participantFilterLabels = {
    all: "All participants",
    registered: "Registered",
    waitlisted: "Waitlisted",
    cleared: "Cleared to Participate",
    volunteers: "Volunteers",
    checked_in: "Checked In",
    waiver_missing: "Waivers Missing",
  }

  const volunteerTypeFilterLabels = {
    food: "Food",
    raffle: "Raffle",
    beach: "Beach",
    buddy: "Buddy",
    instructor: "Instructor",
    spotter: "Spotter",
    board_rescue: "Board Rescue",
    lifeguard: "Lifeguard",
    registration: "Registration",
    setup_teardown: "Setup/Tear Down",
    equipment_handling: "Equipment Handling",
    snacks_drinks: "Snacks/Drinks",
  }
  const volunteerTypeFilterKeys = ["food", "raffle", "beach", "buddy", "instructor"]

  const activeVolunteerRoleFilter = volunteerRoleFilter || volunteerTypeFilter
  const activeFilterLabel = activeVolunteerRoleFilter
    ? `Volunteers: ${volunteerTypeFilterLabels[activeVolunteerRoleFilter] || activeVolunteerRoleFilter}`
    : (participantFilterLabels[participantFilter] || participantFilterLabels.all)

  const openParticipantDetails = (participantId) => {
    if (!participantId) return
    const participant = participants.find((item) => String(item.id) === String(participantId))
    const nextParams = new URLSearchParams()
    nextParams.set("participant_id", String(participantId))
    if (eventInfo?.id) {
      nextParams.set("event_id", String(eventInfo.id))
    }
    if (eventInfo?.event_type) {
      nextParams.set("event_type", String(eventInfo.event_type).trim().toLowerCase())
    }
    if (participant?.session_id) {
      nextParams.set("session_id", String(participant.session_id))
    }
    navigate(`/participants?${nextParams.toString()}`)
  }

  const handleDuplicateEvent = async () => {
    if (duplicateLoading) return

    const confirmed = window.confirm("Duplicate this event as a new draft event?")
    if (!confirmed) return

    setDuplicateError("")
    setDuplicateLoading(true)

    try {
      const created = await duplicateEvent(eventId)
      if (!created?.id) {
        throw new Error("Duplicate completed but new event id was not returned")
      }
      navigate(`/events/${created.id}`)
    } catch (err) {
      setDuplicateError(String(err?.message || "Failed to duplicate event"))
    } finally {
      setDuplicateLoading(false)
    }
  }

  const handleOpenSaveTemplateModal = () => {
    if (saveTemplateLoading) return

    setSaveTemplateNameInput(String(eventInfo?.title || ""))
    setUseChapterSchedule(true)
    setScheduleMonthsInput(CHAPTER_SCHEDULE_DEFAULT.schedule_months.join(","))
    setScheduleWeekdayInput(String(CHAPTER_SCHEDULE_DEFAULT.schedule_weekday))
    setScheduleWeekNumbersInput(CHAPTER_SCHEDULE_DEFAULT.schedule_week_numbers.join(","))
    setSaveTemplateError("")
    setSaveTemplateModalOpen(true)
  }

  const handleCloseSaveTemplateModal = () => {
    if (saveTemplateLoading) return
    setSaveTemplateModalOpen(false)
  }

  const handleSaveAsTemplate = async () => {
    if (saveTemplateLoading) return

    const templateName = String(saveTemplateNameInput || eventInfo?.title || "Event Template").trim() || "Event Template"

    let schedulePayload
    if (useChapterSchedule) {
      schedulePayload = { ...CHAPTER_SCHEDULE_DEFAULT }
    } else {
      const months = parseIntegerCsv(scheduleMonthsInput)
      const weekNumbers = parseIntegerCsv(scheduleWeekNumbersInput)
      const weekday = Number(scheduleWeekdayInput)

      if (!months.length || !weekNumbers.length || !Number.isInteger(weekday)) {
        setSaveTemplateError("Enter valid schedule fields before saving")
        return
      }

      schedulePayload = {
        schedule_rule_type: "nth_weekday",
        schedule_months: months,
        schedule_weekday: weekday,
        schedule_week_numbers: weekNumbers,
      }
    }

    setSaveTemplateError("")
    setSaveTemplateMessage("")
    setSaveTemplateLoading(true)

    try {
      const created = await saveEventAsTemplate(eventId, {
        template_name: templateName,
        ...schedulePayload,
      })
      setSaveTemplateMessage(`Template created with schedule rules: ${created?.name || templateName}`)
      setSaveTemplateModalOpen(false)
    } catch (err) {
      setSaveTemplateError(String(err?.message || "Failed to create template from event"))
    } finally {
      setSaveTemplateLoading(false)
    }
  }


  const normalizeVolunteerType = (value) => {
    const normalized = (value || "").trim().toLowerCase()
    return volunteerTypeAliases[normalized] || normalized
  }

  const matchesParticipantFilter = (participant) => {
    const isVolunteer = (participant.role || "").toLowerCase() === "volunteer"

    if (participantFilter === "registered" || participantFilter === "confirmed") {
      if (participant.is_waitlisted) return false
    } else if (participantFilter === "waitlisted") {
      if (!participant.is_waitlisted) return false
    } else if (participantFilter === "cleared") {
      if (!(participant.checked_in && participant.waiver_verified)) return false
    } else if (participantFilter === "volunteers") {
      if (!isVolunteer) return false
    } else if (participantFilter === "checked_in") {
      if (!participant.checked_in) return false
    } else if (participantFilter === "waiver_missing") {
      if (participant.waiver_verified) return false
    }

    if (activeVolunteerRoleFilter) {
      if (!isVolunteer) return false
      const primaryRole = normalizeVolunteerType(participant.volunteer_type)
      const additionalRoles = Array.isArray(participant.volunteer_additional_types)
        ? participant.volunteer_additional_types.map((value) => normalizeVolunteerType(value))
        : []
      return primaryRole === activeVolunteerRoleFilter || additionalRoles.includes(activeVolunteerRoleFilter)
    }

    return true
  }

  const visibleParticipants = participants.filter(matchesParticipantFilter)

  async function processQueuedEventActions() {
    if (queueSyncRef.current) return
    if (!navigator.onLine) {
      setBrowserOnline(false)
      return
    }

    const queued = getQueuedEventActions(eventId)
    if (!queued.length) {
      setQueuedEventActions([])
      setQueueNotice("")
      return
    }

    queueSyncRef.current = true
    const remaining = []
    let needsRefresh = false

    try {
      for (let i = 0; i < queued.length; i += 1) {
        const action = queued[i]

        if (action.syncStatus === "failed") {
          remaining.push(action)
          continue
        }

        try {
          if (action.type === "session_move") {
            await updateParticipantSession(action.participantId, action.targetSessionId)
            needsRefresh = true
            continue
          }
          if (action.type === "priority_update") {
            await updateParticipantPriority(action.participantId, action.priority)
            needsRefresh = true
            continue
          }
        } catch (err) {
          if (isOfflineError(err)) {
            remaining.push(
              ...queued.slice(i).map((entry) => ({
                ...entry,
                syncStatus: entry.syncStatus === "failed" ? "failed" : "pending",
                status: entry.syncStatus === "failed" ? "failed" : "pending",
                error: entry.lastError || entry.error || null,
                updatedAt: Date.now(),
                lastAttemptAt: Date.now(),
              }))
            )
            break
          }

          const meta = getQueueErrorMeta(err)
          remaining.push({
            ...action,
            syncStatus: "failed",
            status: "failed",
            retryable: meta.retryable,
            lastStatus: meta.status,
            lastError: meta.detail,
            error: meta.detail,
            updatedAt: Date.now(),
            lastAttemptAt: Date.now(),
          })
          setQueueNotice(`1 queued change failed to sync: ${meta.summary}.`)
          console.error("Queued event action failed", action, err)
        }
      }
    } finally {
      persistQueuedEventActions(remaining)
      queueSyncRef.current = false
    }

    if (needsRefresh) {
      await refreshParticipants()
    }
  }

  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true)
      processQueuedEventActions()
    }
    const onOffline = () => {
      setBrowserOnline(false)
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [eventId])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && getQueuedEventActions(eventId).length > 0) {
        processQueuedEventActions()
      }
    }, 5000)

    const onFocus = () => {
      if (navigator.onLine && getQueuedEventActions(eventId).length > 0) {
        processQueuedEventActions()
      }
    }

    window.addEventListener("focus", onFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [eventId])

  // ✅ stable sensors setup
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
  // drag move/cleanup will be handled on the DndContext (must be inside it)

  // ✅ stable data loading logic
  useEffect(() => {
    if (!eventId || eventId === "new") return

    const toEventStartDate = (startDate, startTime) => {
      if (!startDate || !startTime) return null
      const isoLike = `${startDate}T${startTime}`
      const parsed = new Date(isoLike)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    async function loadAll() {
      setLoading(true)
      try {
        const [data, eventData] = await Promise.all([
          fetchEventParticipants(eventId),
          fetchAdminEvent(eventId),
        ])

        setParticipants(data || [])
        saveCachedEventParticipants(eventId, data || [])
        setEventInfo(eventData || null)
        setEventStartAt(toEventStartDate(eventData?.start_date, eventData?.start_time))
        await processQueuedEventActions()
        await refreshNoShows()
      } catch (err) {
        const cached = getCachedEventParticipants(eventId)
        setParticipants(cached)
        setEventInfo(null)
        setNoShows([])
        setEventStartAt(null)
      } finally {
        setLoading(false)
      }
    }

    loadAll()
  }, [eventId])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  
  // ✅ stable ordering by session and natural name order
  const sortedParticipants = [...visibleParticipants].sort((a, b) => {
    const sessionA = a.session_id || ""
    const sessionB = b.session_id || ""

    if (sessionA !== sessionB) {
      return sessionA.localeCompare(sessionB)
    }

    if (a.checked_in !== b.checked_in) {
      return a.checked_in ? -1 : 1
    }

    const lastNameComparison = a.last_name.localeCompare(b.last_name)
    if (lastNameComparison !== 0) {
      return lastNameComparison
    }

    return a.first_name.localeCompare(b.first_name)
  })


  // Build a lookup from session UUID → session name, ordered by start_time/name from API
  const sessionOrder = (eventInfo?.sessions || []).map(s => s.id)
  const sessionNameMap = Object.fromEntries((eventInfo?.sessions || []).map(s => [s.id, s.name]))

  const unknownSessionIds = Array.from(
    new Set(
      sortedParticipants
        .map((p) => p.session_id)
        .filter((sessionId) => Boolean(sessionId) && !sessionOrder.includes(sessionId))
    )
  ).sort((left, right) => String(left).localeCompare(String(right)))

  const hasUnassignedParticipants = sortedParticipants.some((p) => !p.session_id)

  // Always show configured sessions, then unknown session ids, then waitlist/unassigned when present.
  const sortedSessionIds = [
    ...sessionOrder,
    ...unknownSessionIds,
    ...(hasUnassignedParticipants ? ["UNASSIGNED"] : []),
  ]

  const groupedParticipants = sortedSessionIds.map((sessionId) => ({
    sessionId,
    participants: sortedParticipants.filter((p) => (p.session_id || "UNASSIGNED") === sessionId),
  }))

  const isVolunteer = (participant) => (participant?.role || "").toLowerCase().trim() === "volunteer"

  const isSessionFull = (sessionId) => {
    const count = sortedParticipants.filter(
      p => p.session_id === sessionId && !isVolunteer(p)
    ).length
    return count >= 15
  }

  const getSessionStatus = (sessionId) => {
    const participantCount = sortedParticipants.filter(
      p => p.session_id === sessionId && !isVolunteer(p)
    ).length
    const volunteerCount = sortedParticipants.filter(
      p => p.session_id === sessionId && isVolunteer(p)
    ).length

    if (participantCount >= 15) {
      return { status: `Full${volunteerCount ? ` (${volunteerCount} volunteers)` : ""}`, emoji: '🔴', color: 'text-red-500', participantCount, volunteerCount }
    }

    if (participantCount >= 13) {
      return { status: `Almost Full${volunteerCount ? ` (${volunteerCount} volunteers)` : ""}`, emoji: '🟡', color: 'text-yellow-500', participantCount, volunteerCount }
    }

    return { status: `Open${volunteerCount ? ` (${volunteerCount} volunteers)` : ""}`, emoji: '🟢', color: 'text-green-500', participantCount, volunteerCount }
  }

  const formatCountdown = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    }

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  const getSessionSoftStatus = (sessionIndex, group) => {
    if (participantFilter === "waitlisted") {
      return {
        text: "Showing waitlisted participants for manual review",
        className: "text-amber-700",
      }
    }

    if (participantFilter === "checked_in") {
      return {
        text: "Showing checked-in participants only",
        className: "text-green-700",
      }
    }

    if (participantFilter === "cleared") {
      return {
        text: "Showing waiver-verified participants who are checked in",
        className: "text-green-700",
      }
    }

    if (volunteerTypeFilter) {
      return {
        text: `Showing ${volunteerTypeFilterLabels[volunteerTypeFilter] || volunteerTypeFilter} volunteers`,
        className: "text-blue-700",
      }
    }

    if (participantFilter === "volunteers") {
      return {
        text: "Showing volunteer roster",
        className: "text-blue-700",
      }
    }

    if (participantFilter === "waiver_missing") {
      return {
        text: "Showing participants with missing waiver verification",
        className: "text-red-700",
      }
    }

    if (eventStartAt) {
      const sessionStartMs = eventStartAt.getTime() + (sessionIndex * 60 * 60 * 1000)
      const remainingMs = sessionStartMs - nowMs

      if (remainingMs > 0) {
        return {
          text: `Session starts in: ${formatCountdown(remainingMs)}`,
          className: "text-blue-700",
        }
      }
    }

    const notCheckedInCount = group.filter((p) => !p.checked_in && !p.is_waitlisted).length
    if (notCheckedInCount > 0) {
      return {
        text: `⚠️ ${notCheckedInCount} participant${notCheckedInCount === 1 ? "" : "s"} not checked in`,
        className: "text-amber-700",
      }
    }

    return {
      text: "🟢 All non-waitlisted participants checked in",
      className: "text-green-700",
    }
  }

  const toggleEventMode = () => {
    setEventMode((prev) => {
      const next = !prev
      localStorage.setItem(EVENT_MODE_KEY, next ? "on" : "off")
      return next
    })
  }

  // ✅ stable move logic extracted to a function
  async function handleMoveParticipant(id, targetSessionId) {
    updateParticipantsLocal(prev =>
      prev.map(p =>
        String(p.id) === String(id)
          ? { ...p, session_id: targetSessionId, is_waitlisted: false }
          : p
      )
    )

    try {
      await updateParticipantSession(id, targetSessionId)
    } catch (err) {
      if (isOfflineError(err)) {
        const nextQueue = enqueueEventAction(eventId, {
          type: "session_move",
          participantId: id,
          targetSessionId,
        })
        persistQueuedEventActions(nextQueue)
        setDragError("Offline: session move saved locally and queued for sync.")
        return
      }
      await refreshParticipants()
      throw err
    }
  }

  // ✅ stable drag handlers with proper multi-select logic
  function handleDragStart(event) {
    setActiveId(String(event.active.id))
    setDragError(null)
  }

  // ✅ stable drag end logic with proper multi-select handling
  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = String(active.id)

    if (!String(over.id).startsWith("session-")) return

    const targetSessionId = over.id.replace("session-", "")

    const idsToMove = selectedIds.includes(activeId)
      ? selectedIds
      : [activeId]

    const isParticipantSeat = (person) => !isVolunteer(person)

    // Check if target session has capacity
    const currentInSession = participants.filter(
      p => p.session_id === targetSessionId && isParticipantSeat(p)
    ).length
    const movingParticipantSeats = idsToMove.filter((id) => {
      const person = participants.find((p) => String(p.id) === String(id))
      return isParticipantSeat(person)
    }).length

    if (currentInSession + movingParticipantSeats > 15) {
      // Session would exceed capacity
      setDragError("Cannot move to full session")
      return
    }

    try {
      for (const id of idsToMove) {
        await handleMoveParticipant(id, targetSessionId)
      }
    } catch (err) {
      console.error("Move failed", err)
    }

    setSelectedIds([])
  }

  function DroppableSession({ sessionId, children }) {
    const { setNodeRef } = useDroppable({
      id: `session-${sessionId}`,
    })

    return (
      <div
        ref={setNodeRef}
        className={`bg-white rounded-xl border p-4 min-h-[120px] ${isSessionFull(sessionId) ? 'border-red-500 bg-red-100' : ''}`}
      >
        {isSessionFull(sessionId) && (
          <div className="text-red-500 font-bold text-center mb-2">FULL</div>
        )}
        {children}
      </div>
    )
  }

  // ✅ stable component with proper selection logic
  function DraggableParticipant({ p }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: String(p.id),
    });
    const isActive = activeId === String(p.id);
    const isSelected = selectedIds.includes(String(p.id));
    const isGroupDragging = selectedIds.includes(activeId);
    const index = selectedIds.indexOf(String(p.id));
    const appliedTransform =
      transform && isActive
        ? transform
        : isGroupDragging && isSelected
        ? activeTransform
        : null;
    const style = {
      transform: appliedTransform
        ? `translate3d(${appliedTransform.x + index * 4}px, ${
            appliedTransform.y + index * 4
          }px, 0)`
        : undefined,
      zIndex: isActive ? 1000 : "auto",
    };
    // Clamp priority between 1 and 3 (0 = unset)
    const minPriority = 1;
    const maxPriority = 3;
    const clampedPriority = Math.max(0, Math.min(maxPriority, p.priority));
    let dotColor = "bg-gray-500";
    if (clampedPriority === 1) dotColor = "bg-red-500";
    else if (clampedPriority === 2) dotColor = "bg-amber-400";
    else if (clampedPriority === 3) dotColor = "bg-gray-500";
    else if (clampedPriority === 0) dotColor = "bg-gray-300";
    // Priority arrow controls
    const handlePriorityChange = async (delta) => {
      let newPriority = clampedPriority + delta;
      if (newPriority < 1) newPriority = 1;
      if (newPriority > 3) newPriority = 3;
      updateParticipantsLocal(prev => prev.map(part =>
        part.id === p.id ? { ...part, priority: newPriority } : part
      ));
      try {
        await updateParticipantPriority(p.id, newPriority);
      } catch (err) {
        if (isOfflineError(err)) {
          const nextQueue = enqueueEventAction(eventId, {
            type: "priority_update",
            participantId: p.id,
            priority: newPriority,
          })
          persistQueuedEventActions(nextQueue)
          setDragError("Offline: priority change saved locally and queued for sync.")
          return
        }
        await refreshParticipants()
      }
    };
    const isVolunteerCard = (p.role || "").trim().toLowerCase() === "volunteer"
    const baseRoleCardClass = isVolunteerCard
      ? "bg-cyan-50/45 border-cyan-200"
      : "bg-amber-50/35 border-amber-200"
    const syncItem = getSyncStatus(p.id, queuedEventActions)
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          const id = String(p.id);
          setSelectedIds(prev => {
            if (e.ctrlKey || e.metaKey) {
              if (prev.includes(id)) {
                return prev.filter(i => i !== id);
              }
              return [...prev, id];
            }
            return [id];
          });
        }}
        className={`select-none cursor-grab w-full px-3 py-2 rounded-lg text-sm border ${
          selectedIds.includes(String(p.id))
            ? `${baseRoleCardClass} ring-2 ring-blue-300 border-blue-500`
            : baseRoleCardClass
        }`}
      >
        <button
          type="button"
          onPointerDown={(e) => { e.stopPropagation() }}
          onClick={(e) => {
            e.stopPropagation()
            openParticipantDetails(p.id)
          }}
          className="flex items-center gap-1.5 font-medium text-sky-800 hover:underline cursor-pointer text-left w-full"
          title="Open participant details"
        >
          <SyncStateIndicator state={queueStateByParticipant[String(p.id)] || "synced"} />
          <span>{p.first_name} {p.last_name}</span>
        </button>
        <div className="text-xs text-gray-500">
          {p.email}
        </div>
        {syncItem?.syncStatus === "pending" && (
          <div className="mt-1 text-xs text-amber-600">Syncing...</div>
        )}
        {syncItem?.syncStatus === "failed" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-red-600">Failed</span>
            {syncItem.retryable && (
              <button
                type="button"
                onPointerDown={(e) => { e.stopPropagation() }}
                onClick={(e) => {
                  e.stopPropagation()
                  retryQueueItem(syncItem.id)
                }}
                className="text-blue-600 underline"
              >
                Retry
              </button>
            )}
            {syncItem.error && (
              <span className="text-gray-500">({syncItem.error})</span>
            )}
          </div>
        )}
        <div className="mt-1 text-xs font-medium space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${
                p.checked_in
                  ? "bg-green-500"
                  : p.is_waitlisted
                  ? "bg-yellow-400"
                  : "bg-red-500"
              }`}
            />
            <span className={p.checked_in ? "text-green-700" : p.is_waitlisted ? "text-yellow-700" : "text-red-700"}>
              {p.checked_in ? "Checked In" : p.is_waitlisted ? "Waitlisted" : "Not Checked In"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${
                p.waiver_verified ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className={p.waiver_verified ? "text-green-700" : "text-red-700"}>
              {p.waiver_verified ? "Waiver Verified" : "Waiver Pending"}
            </span>
          </div>
        </div>
        {!eventMode && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs flex items-center gap-2">
              Priority:
              <span className={`inline-block w-4 h-4 rounded-full border-2 ${dotColor} border-gray-300`} />
            </span>
          </div>
        )}
      </div>
    );
  }

  if (loading) return <div className="p-6">Loading...</div>

  const mapUrl = buildMapUrl(eventInfo)
  const weatherUrl = buildWeatherUrl(eventInfo)
  const surfUrl = buildSurfUrl(eventInfo)
  const featuredImageUrl = normalizeExternalUrl(eventInfo?.featured_image)
  const hasResources = mapUrl || weatherUrl || surfUrl

  return (
    <div className="relative p-6 space-y-6" onClick={() => setSelectedIds([])}>

      {/* Drag error notification at top of page */}
      {dragError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50 flex items-center gap-4">
          <span>{dragError}</span>
          <button
            onClick={() => setDragError(null)}
            className="ml-2 px-2 py-1 bg-white text-red-600 rounded hover:bg-gray-100 text-xs font-semibold border border-red-200"
            title="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      {(pendingQueueCount > 0 || failedQueueCount > 0) && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div>
            Offline queue active: {pendingQueueCount} pending · {failedQueueCount} failed.
            {!browserOnline ? " Device is offline." : " Syncing will continue while online."}
          </div>
          {queueNotice && <div>{queueNotice}</div>}
          {failedQueueCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={retryRecoverableQueueActions}
                className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
              >
                Retry recoverable
              </button>
              <button
                type="button"
                onClick={dismissFailedQueueActions}
                className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
              >
                Dismiss failed
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto text-[11px] text-gray-500 sm:text-xs">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="whitespace-nowrap hover:text-gray-700"
            >
              Dashboard
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => navigate("/events")}
              className="whitespace-nowrap hover:text-gray-700"
            >
              Events
            </button>
            <span>/</span>
            <span className="font-medium text-gray-700">Event Participants</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Event Participants</h1>
            {eventInfo?.event_type && (
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800">
                Event Type: {formatEventType(eventInfo.event_type)}
              </span>
            )}
          </div>
          {eventInfo?.title && (
            <p className="text-sm text-gray-600">
              {eventInfo.title}
              {eventInfo.start_date ? ` • ${eventInfo.start_date}` : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Viewing: {activeFilterLabel}
            </span>
            {(participantFilter !== "all" || activeVolunteerRoleFilter) && (
              <button
                type="button"
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams)
                  nextParams.delete("participants")
                  nextParams.delete("volunteer_type")
                  nextParams.delete("volunteerType")
                  nextParams.delete("volunteer_role")
                  setSearchParams(nextParams)
                }}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Clear filter
              </button>
            )}
            {(participantFilter === "volunteers" || activeVolunteerRoleFilter) && (
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyVolunteerTypeFilter("")}
                  className={`rounded-full border px-2 py-1 text-[11px] transition ${
                    volunteerTypeFilter
                      ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      : "border-sky-300 bg-sky-50 text-sky-800"
                  }`}
                  title="Show all volunteers"
                >
                  All Volunteers
                </button>
                {volunteerTypeFilterKeys.map((roleKey) => {
                  const selected = volunteerTypeFilter === roleKey
                  return (
                    <button
                      key={roleKey}
                      type="button"
                      onClick={() => applyVolunteerTypeFilter(roleKey)}
                      className={`rounded-full border px-2 py-1 text-[11px] transition ${
                        selected
                          ? "border-sky-300 bg-sky-50 text-sky-800"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                      title={`Show only ${volunteerTypeFilterLabels[roleKey]} volunteers`}
                    >
                      {volunteerTypeFilterLabels[roleKey]}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
          <BackButton fallbackTo="/events" />
          <button
            type="button"
            onClick={() => navigate("/events")}
            className="px-3 py-2 sm:py-1 rounded border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Go back to Events list"
          >
            Events List
          </button>
          <button
            onClick={toggleEventMode}
            className={`px-3 py-2 sm:py-1 rounded text-sm font-semibold ${eventMode ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"}`}
            title="Toggle simplified event-day UI"
          >
            Event Mode {eventMode ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => { refreshParticipants(); refreshNoShows(); }}
            className="px-3 py-2 sm:py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
            title="Refresh participants"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            onClick={handleDuplicateEvent}
            disabled={duplicateLoading}
            className={`px-3 py-2 sm:py-1 rounded text-sm font-semibold ${duplicateLoading ? "bg-slate-300 text-slate-600 cursor-not-allowed" : "bg-sky-600 text-white hover:bg-sky-700"}`}
            title="Create a new draft event with the same configuration"
          >
            {duplicateLoading ? "Duplicating..." : "Duplicate Event"}
          </button>
          <button
            type="button"
            onClick={handleOpenSaveTemplateModal}
            disabled={saveTemplateLoading}
            className={`px-3 py-2 sm:py-1 rounded text-sm font-semibold ${saveTemplateLoading ? "bg-slate-300 text-slate-600 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
            title="Create an event template from this event"
          >
            {saveTemplateLoading ? "Saving Template..." : "Save as Template"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/event-templates")}
            className="px-3 py-2 sm:py-1 rounded text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700"
            title="Go to Event Templates"
          >
            Templates
          </button>
          </div>
          {duplicateError && (
            <p className="text-xs text-red-600">{duplicateError}</p>
          )}
          {saveTemplateError && (
            <p className="text-xs text-red-600">{saveTemplateError}</p>
          )}
          {saveTemplateMessage && (
            <p className="text-xs text-emerald-700">{saveTemplateMessage}</p>
          )}
        </div>
      </div>

      {saveTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Save as Template</h3>
            <p className="mt-1 text-sm text-slate-600">Create template from this event?</p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block font-medium">Template Name</span>
                <input
                  type="text"
                  value={saveTemplateNameInput}
                  onChange={(e) => setSaveTemplateNameInput(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Template name"
                />
              </label>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useChapterSchedule}
                  onChange={(e) => setUseChapterSchedule(e.target.checked)}
                  className="mt-1"
                />
                <span>Use Chapter Schedule (2nd & 3rd Saturday, May-Sep)</span>
              </label>

              {!useChapterSchedule && (
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      <span className="mb-1 block">Months</span>
                      <input
                        type="text"
                        value={scheduleMonthsInput}
                        onChange={(e) => setScheduleMonthsInput(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2"
                        placeholder="5,6,7,8,9"
                      />
                    </label>

                    <label className="text-sm text-slate-700">
                      <span className="mb-1 block">Weekday</span>
                      <select
                        value={scheduleWeekdayInput}
                        onChange={(e) => setScheduleWeekdayInput(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2"
                      >
                        {WEEKDAY_OPTIONS.map((option) => (
                          <option key={option.value} value={String(option.value)}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-slate-700 sm:col-span-2">
                      <span className="mb-1 block">Weeks</span>
                      <input
                        type="text"
                        value={scheduleWeekNumbersInput}
                        onChange={(e) => setScheduleWeekNumbersInput(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2"
                        placeholder="2,3"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseSaveTemplateModal}
                disabled={saveTemplateLoading}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={saveTemplateLoading}
                className={`rounded px-4 py-2 text-sm font-semibold ${saveTemplateLoading ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
              >
                {saveTemplateLoading ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {eventInfo && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">Event Logistics</h2>
              <p className="text-sm text-slate-600">{buildLocationSummary(eventInfo)}</p>
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className={`rounded-full px-3 py-1 ${eventInfo.location?.beach_accessibility ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                  {eventInfo.location?.beach_accessibility ? "Beach access confirmed" : "Beach access needs review"}
                </span>
                {eventInfo.start_time && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    Starts at {String(eventInfo.start_time).slice(0, 5)}
                  </span>
                )}
              </div>
            </div>

            {(featuredImageUrl || hasResources) && (
              <div className="w-full space-y-3 lg:max-w-sm">
                {featuredImageUrl && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={featuredImageUrl}
                      alt={eventInfo?.title ? `${eventInfo.title} featured` : "Event featured image"}
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                {hasResources && (
                  <div className="flex flex-wrap gap-2">
                    {mapUrl && (
                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
                      >
                        Open map
                      </a>
                    )}
                    {weatherUrl && (
                      <a
                        href={weatherUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
                      >
                        Weather report
                      </a>
                    )}
                    {surfUrl && (
                      <a
                        href={surfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
                      >
                        Surf report
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {eventInfo.directions && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Directions</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{eventInfo.directions}</p>
              </div>
            )}
            {eventInfo.parking_info && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Parking</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{eventInfo.parking_info}</p>
              </div>
            )}
            {eventInfo.lodging_info && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Lodging</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{eventInfo.lodging_info}</p>
              </div>
            )}
            {eventInfo.beach_access_notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-900">Beach Access Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{eventInfo.beach_access_notes}</p>
              </div>
            )}
            {eventInfo.internal_notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900">Internal Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{eventInfo.internal_notes}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {!eventMode && <PriorityLegend />}

      {!eventMode && (
        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold">No-Show Candidates:</span>
            <span className="text-red-600 font-bold">{noShows.length}</span>
          </div>
          <button
            onClick={handlePromoteNoShows}
            disabled={promoteLoading || noShows.length === 0}
            className={`px-4 py-2 rounded text-white ${promoteLoading || noShows.length === 0 ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {promoteLoading ? 'Promoting...' : 'Promote Waitlist to Fill No-Shows'}
          </button>
          {noShowError && <span className="text-red-500 text-sm">{noShowError}</span>}
        </div>
      )}

      <button
        onClick={() => navigate(`/events/${eventId}/checkin`)}
        className={`w-full bg-green-600 text-white rounded-xl font-semibold ${eventMode ? "py-6 text-2xl" : "py-4"}`}
      >
        ✔ Start Event Check-In
      </button>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={(event) => {
          if (event.delta) setActiveTransform(event.delta)
        }}
        onDragEnd={(event) => {
          setActiveTransform(null)
          handleDragEnd(event)
        }}
        onDragCancel={() => setActiveTransform(null)}
      >

        {/* Debug: log groupedParticipants structure */}


        {sortedParticipants.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No participants match the selected filter.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {groupedParticipants.map((groupData, idx) => {
            const sessionId = groupData.sessionId
            const group = groupData.participants
            const softStatus = getSessionSoftStatus(idx, group)
            const sessionLabel = sessionId === "UNASSIGNED" ? "Waitlist / Unassigned" : (sessionNameMap[sessionId] || `Session ${idx + 1}`)
            const sessionStatus = getSessionStatus(sessionId)
            return (
              <DroppableSession key={sessionId} sessionId={sessionId}>
                <div className="flex justify-between mb-2">
                  <h3 className="font-semibold">{sessionLabel} {sessionStatus.emoji}</h3>
                  <span className={sessionStatus.color}>{sessionStatus.participantCount} / 15</span>
                </div>
                <div className={`mb-3 text-xs font-medium ${softStatus.className}`}>
                  {softStatus.text}
                </div>
                {/* Render draggable participant cards for this session */}
                <div className="space-y-2">
                  {group.map(p => (
                    <DraggableParticipant key={p.id} p={p} />
                  ))}
                </div>
              </DroppableSession>
            );
          })}
        </div>

        {/* Shows stacked cards while dragging multiple items */}
        <DragOverlay>
          {activeId ? (
            selectedIds.includes(activeId) && selectedIds.length > 1 ? (
              <div className="relative">
                {selectedIds.slice(0, 3).map((id, index) => {
                  const p = participants.find(x => String(x.id) === id)
                  if (!p) return null

                  return (
                    <div
                      key={id}
                      className="absolute bg-white shadow-xl rounded-lg px-3 py-2 border text-sm w-48"
                      style={{
                        top: index * 6,
                        left: index * 6,
                        zIndex: 100 - index,
                        opacity: 1 - index * 0.2,
                      }}
                    >
                      <div className="font-medium">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.email}
                      </div>
                    </div>
                  )
                })}

                {selectedIds.length > 3 && (
                  <div
                    className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded"
                    style={{ top: 22, left: 22 }}
                  >
                    +{selectedIds.length - 3}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white shadow-xl rounded-lg px-3 py-2 border text-sm">
                {
                  participants.find(p => String(p.id) === activeId)?.first_name
                }{" "}
                {
                  participants.find(p => String(p.id) === activeId)?.last_name
                }
              </div>
            )
          ) : null}
        </DragOverlay>

      </DndContext>

      {dragError && (
        <div className="mt-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {dragError}
        </div>
      )}
    </div>
  )
}
export default EventDetail