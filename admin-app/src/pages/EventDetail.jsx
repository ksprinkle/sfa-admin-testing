import { useEffect, useRef, useState } from "react"


import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { fetchAdminEvent, fetchEventParticipants, updateParticipantSession, updateParticipantPriority, updateParticipantType, duplicateEvent, saveEventAsTemplate, createAdminParticipant, fetchEventSessionStats, fetchRecommendedSessions, evaluateAssignment, getSessionProjection } from "../api/events"
import { fetchNoShowCandidates, promoteNoShowSlots } from "../api/no_show"
import { getWsBase } from "../api/baseUrl"
import BackButton from "../components/BackButton"
import Button from "../components/Button"
import Card from "../components/Card"
import SyncStateIndicator from "../components/SyncStateIndicator"
import ParticipantForm from "../components/ParticipantForm"

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
const RECENTLY_MOVED_TTL_MS = 2 * 60 * 1000

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

function normalizeParticipantFormEventType(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "chapter" || normalized === "tour") return normalized
  return null
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
  const participantIdRaw = action.participantId ?? action.participant_id
  if (!action.type || participantIdRaw == null) return null

  const normalizedParticipantId = String(participantIdRaw)
  const targetSessionIdRaw = action.targetSessionId ?? action.newSessionId ?? action.new_session_id
  const normalizedTargetSessionId = targetSessionIdRaw == null ? null : String(targetSessionIdRaw)

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
    id: buildQueueItemId(action, normalizedParticipantId, updatedAt),
    participantId: normalizedParticipantId,
    participant_id: normalizedParticipantId,
    targetSessionId: normalizedTargetSessionId,
    new_session_id: normalizedTargetSessionId,
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

function SyncStatusIcon({ status }) {
  if (status === "pending") {
    return <span className="ml-0.5 inline-block animate-spin text-xs text-amber-600">⏳</span>
  }

  if (status === "failed") {
    return <span className="ml-0.5 inline-block text-xs text-red-500">●</span>
  }

  if (status === "synced") {
    return <span className="ml-0.5 inline-block text-xs text-green-500">✓</span>
  }

  return null
}

function dedupeEventQueue(actions) {
  const byKey = new Map()
  for (const action of actions || []) {
    const normalized = normalizeQueuedEventAction(action)
    if (!normalized) continue
    const actionKey =
      normalized.type === "priority_update"
        ? `${normalized.type}:${normalized.participantId}`
        : normalized.type === "move_participant_session" && normalized.idempotency_key
          ? `${normalized.type}:${normalized.idempotency_key}`
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

  // Utility: Refresh participants from 
  async function refreshParticipants() {
    try {
      const data = await fetchEventParticipants(eventId)
      setParticipants(data || [])
      saveCachedEventParticipants(eventId, data || [])

      try {
        const statsPayload = await fetchEventSessionStats(eventId)
        const nextStats = Object.fromEntries(
          (Array.isArray(statsPayload?.sessions) ? statsPayload.sessions : []).map((sessionStats) => [
            String(sessionStats?.session_id || ""),
            sessionStats,
          ]).filter(([sessionStatsId]) => sessionStatsId)
        )
        setSessionStatsById(nextStats)

        try {
          const requestId = ++projectionRequestIdRef.current
          const projection = await getSessionProjection(eventId, 10)
          if (requestId !== projectionRequestIdRef.current) return
          // Build per-session flags from projection result
          // willBeFull: session appears in projections within the next 3 steps
          // atRisk:     session name appears in a warning string
          const nextProjection = {}
          const projections = Array.isArray(projection?.projections) ? projection.projections : []
          const warnings = Array.isArray(projection?.warnings) ? projection.warnings : []
          const fillingSoonThreshold = Math.min(3, projections.length)

          projections.forEach(({ step, assigned_session_id }) => {
            const sid = String(assigned_session_id || "")
            if (!sid) return
            if (!nextProjection[sid]) nextProjection[sid] = { willBeFull: false, atRisk: false }
            if (step <= fillingSoonThreshold) nextProjection[sid].willBeFull = true
          })

          warnings.forEach((w) => {
            const sid = String(w?.session_id || "")
            if (!sid) return
            if (!nextProjection[sid]) nextProjection[sid] = { willBeFull: false, atRisk: false }
            nextProjection[sid].atRisk = true
          })

          setProjectionBySession(nextProjection)
          setProjectionResult(projection)
        } catch {
          // Projection is non-critical; silently skip on failure.
        }
      } catch {
        // Keep existing stats if session stats refresh fails.
      }
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
    const wsUrl = getWsBase() + "/api/ws/updates";
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
      <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-secondary">
        <span className="font-semibold uppercase tracking-wide text-secondary">Priority legend</span>
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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false)
  const [bulkAssignMessage, setBulkAssignMessage] = useState("")
  const [bulkAssignSmartMode, setBulkAssignSmartMode] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [sessionStatsById, setSessionStatsById] = useState({})
  const [editingParticipantTopRecommendationId, setEditingParticipantTopRecommendationId] = useState("")
  const [createToast, setCreateToast] = useState(null)
  const [saveTemplateNameInput, setSaveTemplateNameInput] = useState("")
  const [useChapterSchedule, setUseChapterSchedule] = useState(true)
  const [scheduleMonthsInput, setScheduleMonthsInput] = useState(CHAPTER_SCHEDULE_DEFAULT.schedule_months.join(","))
  const [scheduleWeekdayInput, setScheduleWeekdayInput] = useState(String(CHAPTER_SCHEDULE_DEFAULT.schedule_weekday))
  const [scheduleWeekNumbersInput, setScheduleWeekNumbersInput] = useState(CHAPTER_SCHEDULE_DEFAULT.schedule_week_numbers.join(","))
  const [moveInFlightByType, setMoveInFlightByType] = useState({
    water: false,
    beach: false,
  })
  const [hoverGuidanceBySession, setHoverGuidanceBySession] = useState({})
  const [hoverGuidanceLoadingSessionId, setHoverGuidanceLoadingSessionId] = useState("")
  const [projectionBySession, setProjectionBySession] = useState({})
  const [projectionResult, setProjectionResult] = useState(null)
  const queueSyncRef = useRef(false)
  const createToastTimerRef = useRef(null)
  const retriedCreateQueueIdsRef = useRef(new Set())
  const recentlyMovedRef = useRef(new Map())
  const hoverGuidanceDebounceRef = useRef(null)
  const hoverGuidanceRequestSeqRef = useRef(0)
  const hoverGuidanceCacheRef = useRef(new Map())
  const projectionRequestIdRef = useRef(0)

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

  const dismissCreateToast = () => {
    if (createToastTimerRef.current) {
      window.clearTimeout(createToastTimerRef.current)
      createToastTimerRef.current = null
    }
    setCreateToast(null)
  }

  const showCreateToast = (message, options = {}) => {
    const {
      tone = "success",
      retryQueueItemId = null,
      durationMs = 2600,
    } = options

    if (createToastTimerRef.current) {
      window.clearTimeout(createToastTimerRef.current)
      createToastTimerRef.current = null
    }

    setCreateToast({ message, tone, retryQueueItemId })

    if (durationMs > 0) {
      createToastTimerRef.current = window.setTimeout(() => {
        setCreateToast(null)
        createToastTimerRef.current = null
      }, durationMs)
    }
  }

  useEffect(() => {
    return () => {
      if (createToastTimerRef.current) {
        window.clearTimeout(createToastTimerRef.current)
      }
      if (hoverGuidanceDebounceRef.current) {
        window.clearTimeout(hoverGuidanceDebounceRef.current)
      }
    }
  }, [])

  const clearHoverGuidance = () => {
    if (hoverGuidanceDebounceRef.current) {
      window.clearTimeout(hoverGuidanceDebounceRef.current)
      hoverGuidanceDebounceRef.current = null
    }
    hoverGuidanceRequestSeqRef.current += 1
    setHoverGuidanceBySession({})
    setHoverGuidanceLoadingSessionId("")
  }

  const scheduleHoverGuidanceEvaluation = (participantId, targetSessionId) => {
    if (!participantId || !targetSessionId) {
      clearHoverGuidance()
      return
    }

    const cacheKey = `${String(participantId)}:${String(targetSessionId)}`

    if (hoverGuidanceDebounceRef.current) {
      window.clearTimeout(hoverGuidanceDebounceRef.current)
      hoverGuidanceDebounceRef.current = null
    }

    const cached = hoverGuidanceCacheRef.current.get(cacheKey)
    if (cached) {
      const currentSessionId = Object.keys(hoverGuidanceBySession)[0] || ""
      const currentGuidance = hoverGuidanceBySession[currentSessionId]
      const isAlreadyShowingCachedResult = (
        String(currentSessionId) === String(targetSessionId)
        && currentGuidance === cached
        && String(hoverGuidanceLoadingSessionId || "") !== String(targetSessionId)
      )

      if (isAlreadyShowingCachedResult) {
        return
      }

      setHoverGuidanceBySession({ [String(targetSessionId)]: cached })
      setHoverGuidanceLoadingSessionId("")
      return
    }

    setHoverGuidanceLoadingSessionId(String(targetSessionId))

    hoverGuidanceDebounceRef.current = window.setTimeout(async () => {
      const requestSeq = hoverGuidanceRequestSeqRef.current + 1
      hoverGuidanceRequestSeqRef.current = requestSeq

      try {
        const guidance = await evaluateAssignment(participantId, targetSessionId)
        if (requestSeq !== hoverGuidanceRequestSeqRef.current) return

        hoverGuidanceCacheRef.current.set(cacheKey, guidance)
        setHoverGuidanceBySession({ [String(targetSessionId)]: guidance })
      } catch {
        if (requestSeq !== hoverGuidanceRequestSeqRef.current) return
        setHoverGuidanceBySession({})
      } finally {
        if (requestSeq === hoverGuidanceRequestSeqRef.current) {
          setHoverGuidanceLoadingSessionId("")
        }
      }
    }, 180)
  }

  const retryRecoverableQueueActions = () => {
    queuedEventActions
      .filter((item) => item.syncStatus === "failed" && item.retryable && item.type === "create_participant")
      .forEach((item) => {
        retriedCreateQueueIdsRef.current.add(String(item.id))
      })

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
    const retryTarget = queuedEventActions.find((item) => String(item.id) === String(queueItemId))
    if (retryTarget?.type === "create_participant") {
      retriedCreateQueueIdsRef.current.add(String(queueItemId))
    }

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

  const retryAllFailed = (queue) => {
    ;(queue || [])
      .filter((item) => item.status === "failed")
      .forEach((item) => retryQueueItem(item.id))
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
          if (action.type === "session_move" || action.type === "move_participant_session") {
            const queuedSessionId = action.targetSessionId
            if (!queuedSessionId) {
              throw new Error("Queued session move is missing target session")
            }
            await updateParticipantSession(action.participantId, queuedSessionId)
            needsRefresh = true
            continue
          }
          if (action.type === "priority_update") {
            await updateParticipantPriority(action.participantId, action.priority)
            needsRefresh = true
            continue
          }
          if (action.type === "create_participant") {
            await createAdminParticipant(action.payload || {})
            if (retriedCreateQueueIdsRef.current.delete(String(action.id))) {
              showCreateToast("Participant synced", { tone: "success" })
            }
            needsRefresh = true
            continue
          }
          if (action.type === "edit_participant") {
            await updateParticipantType(action.participantId, action.payload || {})
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
          const failedAction = {
            ...action,
            syncStatus: "failed",
            status: "failed",
            retryable: meta.retryable,
            lastStatus: meta.status,
            lastError: meta.detail,
            error: meta.detail,
            updatedAt: Date.now(),
            lastAttemptAt: Date.now(),
          }
          remaining.push(failedAction)
          if (action.type === "create_participant") {
            showCreateToast("Failed to sync participant", {
              tone: "error",
              retryQueueItemId: failedAction.id,
              durationMs: 0,
            })
          }
          if (action.type === "move_participant_session" || action.type === "session_move") {
            showCreateToast("Move failed to sync. Tap to retry.", {
              tone: "error",
              retryQueueItemId: failedAction.id,
              durationMs: 0,
            })
          }
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
        const [data, eventData, statsPayload] = await Promise.all([
          fetchEventParticipants(eventId),
          fetchAdminEvent(eventId),
          fetchEventSessionStats(eventId),
        ])

        setParticipants(data || [])
        saveCachedEventParticipants(eventId, data || [])
        setEventInfo(eventData || null)
        setSessionStatsById(
          Object.fromEntries(
            (Array.isArray(statsPayload?.sessions) ? statsPayload.sessions : []).map((sessionStats) => [
              String(sessionStats?.session_id || ""),
              sessionStats,
            ]).filter(([sessionStatsId]) => sessionStatsId)
          )
        )
        setEventStartAt(toEventStartDate(eventData?.start_date, eventData?.start_time))
        await processQueuedEventActions()
        await refreshNoShows()
      } catch (err) {
        const cached = getCachedEventParticipants(eventId)
        setParticipants(cached)
        setEventInfo(null)
        setSessionStatsById({})
        setNoShows([])
        setEventStartAt(null)
      } finally {
        setLoading(false)
      }
    }

    loadAll()
  }, [eventId])

  useEffect(() => {
    let cancelled = false

    async function loadEditingParticipantRecommendation() {
      if (!editingParticipant?.id) {
        setEditingParticipantTopRecommendationId("")
        return
      }

      try {
        const recommendations = await fetchRecommendedSessions(editingParticipant.id)
        if (!cancelled) {
          setEditingParticipantTopRecommendationId(String(recommendations?.[0]?.session_id || ""))
        }
      } catch {
        if (!cancelled) {
          setEditingParticipantTopRecommendationId("")
        }
      }
    }

    loadEditingParticipantRecommendation()

    return () => {
      cancelled = true
    }
  }, [editingParticipant?.id])

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


  // Build a lookup from session UUID → session name, ordered by start_time/name from 
  const sessionOrder = (eventInfo?.sessions || []).map(s => s.id)
  const sessionNameMap = Object.fromEntries((eventInfo?.sessions || []).map(s => [s.id, s.name]))

  const unknownSessionIds = Array.from(
    new Set(
      sortedParticipants
        .map((p) => p.session_id)
        .filter((sessionId) => Boolean(sessionId) && !sessionOrder.includes(sessionId))
    )
  ).sort((left, right) => String(left).localeCompare(String(right)))

  const isBoardUnassignedParticipant = (participant) => !participant?.session_id && !participant?.is_waitlisted
  const isBoardWaitlistedParticipant = (participant) => !participant?.session_id && Boolean(participant?.is_waitlisted)

  const hasUnassignedParticipants = sortedParticipants.some(isBoardUnassignedParticipant)
  const hasWaitlistedParticipants = sortedParticipants.some(isBoardWaitlistedParticipant)

  // Always show configured sessions, then unknown session ids, then holding buckets.
  const sortedSessionIds = [
    ...sessionOrder,
    ...unknownSessionIds,
    ...(hasUnassignedParticipants ? ["UNASSIGNED"] : []),
    ...(hasWaitlistedParticipants ? ["WAITLISTED"] : []),
  ]

  const groupedParticipants = sortedSessionIds.map((sessionId) => ({
    sessionId,
    participants: sortedParticipants.filter((participant) => {
      if (sessionId === "UNASSIGNED") return isBoardUnassignedParticipant(participant)
      if (sessionId === "WAITLISTED") return isBoardWaitlistedParticipant(participant)
      return participant?.session_id === sessionId
    }),
  }))

  const isVolunteer = (participant) => (participant?.role || "").toLowerCase().trim() === "volunteer"

  const getSessionCapacity = (sessionId) => {
    const matchedSession = (Array.isArray(eventInfo?.sessions) ? eventInfo.sessions : []).find(
      (session) => String(session?.id || "") === String(sessionId || "")
    )
    const parsedCapacity = Number(matchedSession?.capacity)
    return Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 15
  }

  const isSessionFull = (sessionId, sourceParticipants = sortedParticipants, extraAssignments = 0) => {
    const count = sourceParticipants.filter(
      p => p.session_id === sessionId && !isVolunteer(p)
    ).length
    return (count + Number(extraAssignments || 0)) >= getSessionCapacity(sessionId)
  }

  const getSessionStatus = (sessionId) => {
    if (sessionId === "UNASSIGNED") {
      const participantCount = sortedParticipants.filter(
        (participant) => isBoardUnassignedParticipant(participant) && !isVolunteer(participant)
      ).length
      return { status: "Needs assignment", emoji: '🟦', color: 'text-sky-600', participantCount, volunteerCount: 0 }
    }

    if (sessionId === "WAITLISTED") {
      const participantCount = sortedParticipants.filter(
        (participant) => isBoardWaitlistedParticipant(participant) && !isVolunteer(participant)
      ).length
      return { status: "Waitlisted", emoji: '🟨', color: 'text-amber-600', participantCount, volunteerCount: 0 }
    }

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

  const getSessionSoftStatus = (sessionId, sessionIndex, group) => {
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

    if (sessionId === "UNASSIGNED") {
      return {
        text: "Ready for session assignment",
        className: "text-sky-700",
      }
    }

    if (sessionId === "WAITLISTED") {
      return {
        text: "Held back from auto-assign until manually promoted",
        className: "text-amber-700",
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

  const getSessionStaffingIndicators = (sessionId) => {
    if (sessionId === "UNASSIGNED" || sessionId === "WAITLISTED") return null
    const sessionPeople = participants.filter((p) => p.session_id === sessionId)
    const activeSessionPeople = sessionPeople.filter((p) => !p.removed_at)
    const participantCount = activeSessionPeople.filter((p) => !isVolunteer(p)).length
    const assistanceCount = activeSessionPeople.filter((p) => !isVolunteer(p) && Boolean(p.requires_assistance)).length
    const waterCount = activeSessionPeople.filter((p) => isVolunteer(p) && (p.volunteer_type || "").toLowerCase() === "water").length
    const beachCount = activeSessionPeople.filter((p) => isVolunteer(p) && (p.volunteer_type || "").toLowerCase() === "beach").length
    const requiredWater = Math.ceil(participantCount / 3) + assistanceCount
    const requiredBeach = Math.ceil(participantCount / 5)
    return { participantCount, waterCount, beachCount, assistanceCount, requiredWater, requiredBeach }
  }

  const getSessionAssistanceHeat = (staffing) => {
    const participantCount = Number(staffing?.participantCount || 0)
    const assistanceCount = Number(staffing?.assistanceCount || 0)
    const assistanceRatio = participantCount > 0 ? assistanceCount / participantCount : 0

    const displayCount = assistanceCount > 5 ? "5+" : assistanceCount
    const countSuffix = assistanceCount > 0 ? ` (${displayCount})` : ""

    if (assistanceRatio >= 0.4) {
      return {
        emoji: "🔴",
        label: `High Assistance${countSuffix}`,
        className: "border-red-200 bg-red-50 text-red-700",
      }
    }

    if (assistanceRatio >= 0.2) {
      return {
        emoji: "🟡",
        label: `Moderate${countSuffix}`,
        className: "border-amber-200 bg-amber-50 text-amber-700",
      }
    }

    return {
      emoji: "🟢",
      label: "Low",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    }
  }

  const staffingIndicatorColor = (count, required) => {
    if (required === 0 || count >= required) return "text-green-600"
    if (count >= required - 1) return "text-yellow-600"
    return "text-red-600"
  }

  const getSessionLabel = (sessionId) => {
    if (sessionId === "UNASSIGNED") return "Unassigned"
    if (sessionId === "WAITLISTED") return "Waitlisted"
    if (sessionNameMap[sessionId]) return sessionNameMap[sessionId]
    const index = sortedSessionIds.findIndex((id) => id === sessionId)
    if (index >= 0) return `Session ${index + 1}`
    return "Session"
  }

  const getSessionVisualState = (sessionId) => {
    const sessionStats = sessionStatsById[String(sessionId || "")]
    const capacity = Number(sessionStats?.capacity || 0)
    const currentCount = Number(sessionStats?.current_count || 0)
    const fillRatio = capacity > 0 ? currentCount / capacity : 0
    const isTopRecommendation = String(sessionId || "") !== "" && String(sessionId || "") === String(editingParticipantTopRecommendationId || "")

    if (isTopRecommendation) {
      return {
        cardClass: "border-sky-400 ring-2 ring-sky-100",
        badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
        badgeLabel: "Top recommendation",
      }
    }

    if (capacity > 0 && fillRatio > 0.9) {
      return {
        cardClass: "border-red-300 bg-red-50/70",
        badgeClass: "",
        badgeLabel: "",
      }
    }

    if (capacity > 0 && fillRatio < 0.5) {
      return {
        cardClass: "border-amber-300 bg-amber-50/70",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        badgeLabel: "Underutilized",
      }
    }

    return {
      cardClass: "",
      badgeClass: "",
      badgeLabel: "",
    }
  }

  const findSurplusSession = (targetSessionId, volunteerType) => {
    const countKey = volunteerType === "water" ? "waterCount" : "beachCount"
    const requiredKey = volunteerType === "water" ? "requiredWater" : "requiredBeach"
    let donorSessionId = null
    let smallestPositiveSurplus = Number.POSITIVE_INFINITY

    for (const candidateSessionId of sortedSessionIds) {
      if (candidateSessionId === "UNASSIGNED" || candidateSessionId === "WAITLISTED" || candidateSessionId === targetSessionId) continue
      const staffing = getSessionStaffingIndicators(candidateSessionId)
      if (!staffing) continue
      const surplus = staffing[countKey] - staffing[requiredKey]
      if (surplus > 0 && surplus < smallestPositiveSurplus) {
        smallestPositiveSurplus = surplus
        donorSessionId = candidateSessionId
      }
    }

    if (donorSessionId === targetSessionId) return null
    return donorSessionId
  }

  const cleanupRecentlyMoved = () => {
    const now = Date.now()
    for (const [participantId, timestamp] of recentlyMovedRef.current.entries()) {
      if (now - Number(timestamp || 0) > RECENTLY_MOVED_TTL_MS) {
        recentlyMovedRef.current.delete(participantId)
      }
    }
  }

  const isMoveQueuedForTarget = (participantId, targetSessionId) => {
    const idempotencyKey = `${String(participantId)}:${String(targetSessionId)}`
    return queuedEventActions.some((item) => (
      item.syncStatus !== "failed"
      && item.type === "move_participant_session"
      && (
        item.idempotency_key === idempotencyKey
        || (
          String(item.participantId) === String(participantId)
          && String(item.targetSessionId || "") === String(targetSessionId)
        )
      )
    ))
  }

  const scoreVolunteerForSession = (volunteer, targetSessionId, context) => {
    let score = 0

    if (Boolean(volunteer?.volunteer_is_versatile)) {
      score += 2
    }

    if (Number(context?.targetAssistanceCount || 0) > 0) {
      score += 2
    }

    if (Number(context?.donorSurplus || 0) > 1) {
      score += 1
    }

    if (Number(context?.donorSurplus || 0) === 1) {
      score -= 1
    }

    return score
  }

  const getMoveCandidates = (targetSessionId, volunteerType, limit = 1, options = { preview: true }) => {
    const preview = options?.preview !== false
    cleanupRecentlyMoved()

    const donorSessionId = findSurplusSession(targetSessionId, volunteerType)
    if (!donorSessionId) return []

    const targetStaffing = getSessionStaffingIndicators(targetSessionId)
    const donorStaffing = getSessionStaffingIndicators(donorSessionId)
    const donorCount = volunteerType === "water"
      ? Number(donorStaffing?.waterCount || 0)
      : Number(donorStaffing?.beachCount || 0)
    const donorRequired = volunteerType === "water"
      ? Number(donorStaffing?.requiredWater || 0)
      : Number(donorStaffing?.requiredBeach || 0)
    const donorSurplus = donorCount - donorRequired
    const scoringContext = {
      volunteerType,
      donorSessionId,
      donorSurplus,
      targetAssistanceCount: Number(targetStaffing?.assistanceCount || 0),
    }

    const donorSessionPeople = participants.filter((participant) => String(participant.session_id || "") === String(donorSessionId))
    const scoredCandidates = donorSessionPeople
      .filter((participant) => {
        if (participant.removed_at) return false
        if (recentlyMovedRef.current.has(String(participant.id))) return false
        if (!isVolunteer(participant)) return false
        if (normalizeVolunteerType(participant.volunteer_type) !== volunteerType) return false
        if (isMoveQueuedForTarget(participant.id, targetSessionId)) return false
        return true
      })
      .map((volunteer) => ({
        volunteer,
        score: scoreVolunteerForSession(volunteer, targetSessionId, scoringContext),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score

        if (Boolean(right.volunteer.volunteer_is_versatile) !== Boolean(left.volunteer.volunteer_is_versatile)) {
          return Number(Boolean(right.volunteer.volunteer_is_versatile)) - Number(Boolean(left.volunteer.volunteer_is_versatile))
        }

        const leftLast = String(left.volunteer.last_name || "")
        const rightLast = String(right.volunteer.last_name || "")
        const lastNameDiff = leftLast.localeCompare(rightLast)
        if (lastNameDiff !== 0) return lastNameDiff

        return String(left.volunteer.first_name || "").localeCompare(String(right.volunteer.first_name || ""))
      })

    const selected = []
    const safeLimit = Math.max(0, Number(limit) || 0)

    for (const entry of scoredCandidates) {
      const candidate = entry.volunteer
      if (selected.length >= safeLimit) break
      if (!candidate?.id) continue

      const participantId = String(candidate.id)
      if (!preview) {
        recentlyMovedRef.current.set(participantId, Date.now())
      }

      selected.push({
        donorSessionId,
        participantId,
        idempotencyKey: `${participantId}:${String(targetSessionId)}`,
        participant: candidate,
      })
    }

    return selected
  }

  const getShortfallForType = (sessionId, volunteerType) => {
    const staffing = getSessionStaffingIndicators(sessionId)
    if (!staffing) return 0
    return volunteerType === "water"
      ? Math.max(0, staffing.requiredWater - staffing.waterCount)
      : Math.max(0, staffing.requiredBeach - staffing.beachCount)
  }

  const getMaxMoveCountForType = (sessionId, volunteerType) => {
    const shortfall = getShortfallForType(sessionId, volunteerType)
    if (shortfall <= 0) return 0
    const previewCandidates = getMoveCandidates(sessionId, volunteerType, 3, { preview: true })
    return Math.max(0, Math.min(3, shortfall, previewCandidates.length))
  }

  const handleGuidedVolunteerMoveBatch = (targetSessionId, volunteerType, requestedCount = 1) => {
    if (moveInFlightByType[volunteerType]) return

    const maxMoveCount = getMaxMoveCountForType(targetSessionId, volunteerType)
    if (maxMoveCount <= 0) return

    const desiredMoves = Math.max(1, Math.min(maxMoveCount, Number(requestedCount) || 1))
    let remainingShortfall = getShortfallForType(targetSessionId, volunteerType)
    if (remainingShortfall <= 0) return

    setMoveInFlightByType((prev) => ({ ...prev, [volunteerType]: true }))

    let movedCount = 0
    let endedByNoCandidate = false

    for (let i = 0; i < desiredMoves; i += 1) {
      cleanupRecentlyMoved()

      if (remainingShortfall <= 0) {
        break
      }

      const selectedMoves = getMoveCandidates(targetSessionId, volunteerType, 1, { preview: false })
      const candidate = selectedMoves[0]
      if (!candidate) {
        endedByNoCandidate = true
        break
      }

      movedCount += 1
      remainingShortfall = Math.max(0, remainingShortfall - 1)

      void handleMoveParticipant(candidate.participantId, targetSessionId, { smooth: true }).catch((err) => {
        console.error("Guided volunteer move failed", err)
        setDragError(`Unable to move ${volunteerType} volunteer right now`)
      })
    }

    if (movedCount > 0) {
      const roleLabel = volunteerType === "water" ? "Water" : "Beach"
      const targetSessionLabel = getSessionLabel(targetSessionId)
      if (movedCount === desiredMoves) {
        showCreateToast(`Moved ${movedCount} ${roleLabel} volunteer${movedCount === 1 ? "" : "s"} to ${targetSessionLabel}`, {
          tone: "success",
        })
      } else if (endedByNoCandidate) {
        showCreateToast(`Moved ${movedCount} of ${desiredMoves} volunteers (no more available)`, {
          tone: "info",
        })
      }
    } else if (endedByNoCandidate) {
      setDragError(`No ${volunteerType} volunteer available to move`)
    }

    window.setTimeout(() => {
      setMoveInFlightByType((prev) => ({ ...prev, [volunteerType]: false }))
    }, 300)
  }

    const formatPreviewVolunteerName = (participant) => {
      const firstName = String(participant?.first_name || "").trim()
      const lastName = String(participant?.last_name || "").trim()
      const lastInitial = lastName ? `${lastName.charAt(0).toUpperCase()}.` : ""
      return `${firstName}${lastInitial ? ` ${lastInitial}` : ""}`.trim()
    }

    const formatPreviewVolunteerList = (selectedCandidates) => {
      const maxDisplay = 2
      const visibleCandidates = selectedCandidates.slice(0, maxDisplay)
      const remainingCount = Math.max(0, selectedCandidates.length - maxDisplay)

      const visibleText = visibleCandidates
      .map(({ participant }) => {
        const name = formatPreviewVolunteerName(participant)
        const tags = []
        if (participant?.volunteer_is_versatile) tags.push("Versatile")
        return tags.length > 0 ? `${name} (${tags.join(", ")})` : name
      })
      .join(", ")

      if (remainingCount > 0) {
        return `${visibleText} +${remainingCount}`
      }

      return visibleText
    }

    const buildPreviewReasonText = (selectedCandidates, targetSessionId, volunteerType) => {
      const firstSelection = selectedCandidates?.[0]
      const firstVolunteer = firstSelection?.participant
      if (!firstVolunteer) return ""

      const reasons = []

      if (Boolean(firstVolunteer.volunteer_is_versatile)) {
        reasons.push("this volunteer is versatile")
      }

      const targetStaffing = getSessionStaffingIndicators(targetSessionId)
      if (Number(targetStaffing?.assistanceCount || 0) > 0) {
        reasons.push("this session has participants needing assistance")
      }

      const donorSessionId = firstSelection?.donorSessionId
      const donorStaffing = donorSessionId ? getSessionStaffingIndicators(donorSessionId) : null
      if (donorStaffing) {
        const donorCount = volunteerType === "water"
          ? Number(donorStaffing.waterCount || 0)
          : Number(donorStaffing.beachCount || 0)
        const donorRequired = volunteerType === "water"
          ? Number(donorStaffing.requiredWater || 0)
          : Number(donorStaffing.requiredBeach || 0)
        if (donorCount - donorRequired > 1) {
          reasons.push("they are from a well-staffed session")
        }
      }

      const topReasons = reasons.slice(0, 2)
      if (!topReasons.length) return { tooltip: "", inline: "" }
      const tooltip = `Selected because: ${topReasons.map((r) => `• ${r}`).join(" ")}`
      const inline = `Selected because:\n${topReasons.map((r) => `• ${r}`).join("\n")}`
      return { tooltip, inline }
    }

  const getSessionStaffingGuidance = (sessionId) => {
    const staffing = getSessionStaffingIndicators(sessionId)
    if (!staffing) return []

    const suggestions = []
    const waterShortfall = Math.max(0, staffing.requiredWater - staffing.waterCount)
    const beachShortfall = Math.max(0, staffing.requiredBeach - staffing.beachCount)
    const hasShortfall = waterShortfall > 0 || beachShortfall > 0
    const donorSessions = new Set()

    if (!hasShortfall) return suggestions

    const needsParts = []

    if (waterShortfall > 0) {
      needsParts.push(`${waterShortfall} Water`)
      const waterDonor = findSurplusSession(sessionId, "water")
      if (waterDonor) {
        donorSessions.add(waterDonor)
      }
    }

    if (beachShortfall > 0) {
      needsParts.push(`${beachShortfall} Beach`)
      const beachDonor = findSurplusSession(sessionId, "beach")
      if (beachDonor) {
        donorSessions.add(beachDonor)
      }
    }

    suggestions.push(`Needs ${needsParts.join(", ")} volunteer${needsParts.length > 1 ? "s" : ""}`)

    if (donorSessions.size === 0) {
      suggestions.push("No available volunteers to reassign")
      return suggestions
    }

    if (donorSessions.size === 1) {
      const [onlyDonor] = Array.from(donorSessions)
      suggestions.push(`Consider moving volunteers from ${getSessionLabel(onlyDonor)}`)
      return suggestions
    }

    Array.from(donorSessions).forEach((donorSessionId) => {
      suggestions.push(`Consider moving volunteers from ${getSessionLabel(donorSessionId)}`)
    })

    return suggestions
  }

  const toggleEventMode = () => {
    setEventMode((prev) => {
      const next = !prev
      localStorage.setItem(EVENT_MODE_KEY, next ? "on" : "off")
      return next
    })
  }

  // ✅ stable move logic extracted to a function
  async function handleMoveParticipant(id, targetSessionId, options = {}) {
    const { smooth = false } = options
    const applyOptimisticMove = () => {
      updateParticipantsLocal(prev =>
        prev.map(p =>
          String(p.id) === String(id)
            ? { ...p, session_id: targetSessionId, is_waitlisted: false }
            : p
        )
      )
    }

    if (smooth) {
      window.requestAnimationFrame(() => {
        applyOptimisticMove()
      })
    } else {
      applyOptimisticMove()
    }

    try {
      await updateParticipantSession(id, targetSessionId)
    } catch (err) {
      if (isOfflineError(err)) {
        const movePayload = {
          participant_id: String(id),
          new_session_id: String(targetSessionId),
          idempotency_key: `${String(id)}:${String(targetSessionId)}`,
        }
        const nextQueue = enqueueEventAction(eventId, {
          type: "move_participant_session",
          ...movePayload,
        })
        persistQueuedEventActions(nextQueue)
        setDragError("Offline: session move saved locally and queued for sync.")
        return
      }
      await refreshParticipants()
      throw err
    }
  }

  async function queueAssignment(participantId, targetSessionId) {
    await handleMoveParticipant(participantId, targetSessionId)
  }

  // Add a button to auto-assign all unassigned participants
  // Use existing queueAssignment and recommendation endpoint
  async function handleAutoAssignUnassignedParticipants() {
    if (bulkAssignLoading) return

    const unassigned = participants.filter((participant) => {
      if (participant?.removed_at) return false
      if (isVolunteer(participant)) return false
      return !participant?.session_id
    })

    if (!unassigned.length) {
      setBulkAssignMessage("No unassigned participants to auto-assign.")
      return
    }

    setBulkAssignLoading(true)
    setBulkAssignMessage("")

    let assignedCount = 0
    let skippedCount = 0
    let failedCount = 0
    let avoidedCount = 0
    let warningCount = 0
    const warningNames = []
    let nearlyFullIssueCount = 0
    let assistanceImbalanceRiskCount = 0
    let betterAlternativeUsedCount = 0
    const queuedAssignmentsBySession = new Map()

    const evaluateSmartTarget = async (participantId, preferredSessionId) => {
      const initial = await evaluateAssignment(participantId, preferredSessionId)

      if (initial?.status === "warn") {
        warningCount += 1
      }

      if (initial?.status !== "avoid") {
        return {
          targetSessionId: preferredSessionId,
          status: initial?.status || "good",
          guidance: initial,
        }
      }

      const suggestedSessionId = String(initial?.suggested_alternative_session_id || "")
      if (!suggestedSessionId) {
        return {
          targetSessionId: "",
          status: "avoid",
          guidance: initial,
        }
      }

      const alternate = await evaluateAssignment(participantId, suggestedSessionId)
      if (alternate?.status === "avoid") {
        return {
          targetSessionId: "",
          status: "avoid",
          guidance: alternate,
        }
      }

      if (alternate?.status === "warn") {
        warningCount += 1
      }

      return {
        targetSessionId: suggestedSessionId,
        status: alternate?.status || "good",
        guidance: alternate,
      }
    }

    try {
      for (const participant of unassigned) {
        try {
          const data = await fetchRecommendedSessions(participant.id)

          if (!data.length) {
            skippedCount += 1
            continue
          }

          const best = data[0]
          let targetSessionId = String(best?.session_id || "")

          if (!targetSessionId) {
            skippedCount += 1
            continue
          }

          if (bulkAssignSmartMode) {
            try {
              const smartChoice = await evaluateSmartTarget(participant.id, targetSessionId)

              if (!smartChoice.targetSessionId || smartChoice.status === "avoid") {
                avoidedCount += 1
                skippedCount += 1
                continue
              }

              if (smartChoice.status === "warn") {
                const participantName = `${participant.first_name || "Participant"} ${participant.last_name || ""}`.trim()
                warningNames.push(participantName)

                const warningMessages = Array.isArray(smartChoice.guidance?.messages)
                  ? smartChoice.guidance.messages.map((message) => String(message || "").toLowerCase())
                  : []
                const warningText = warningMessages.join(" ")

                if (warningText.includes("nearly full") || warningText.includes("capacity") || warningText.includes("full")) {
                  nearlyFullIssueCount += 1
                }

                if (warningText.includes("assistance") || warningText.includes("imbalance") || warningText.includes("balance")) {
                  assistanceImbalanceRiskCount += 1
                }

                console.warn("Bulk assign warning", {
                  participant_id: participant.id,
                  participant_name: participantName,
                  session_id: smartChoice.targetSessionId,
                  messages: smartChoice.guidance?.messages || [],
                })
              }

              if (String(smartChoice.targetSessionId || "") !== String(best?.session_id || "")) {
                betterAlternativeUsedCount += 1
              }

              targetSessionId = String(smartChoice.targetSessionId || "")
            } catch {
              // If smart guidance fails, keep best recommendation so bulk assign still runs.
            }
          }

          if (!targetSessionId) {
            skippedCount += 1
            continue
          }

          const queuedForTarget = Number(queuedAssignmentsBySession.get(targetSessionId) || 0)

          // EXTRA SAFETY: recommendation data may be slightly stale during a batch.
          if (best?.is_full || isSessionFull(targetSessionId, sortedParticipants, queuedForTarget)) {
            skippedCount += 1
            continue
          }

          await queueAssignment(participant.id, targetSessionId)
          queuedAssignmentsBySession.set(targetSessionId, queuedForTarget + 1)
          assignedCount += 1
        } catch {
          failedCount += 1
        }

        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      await refreshParticipants()
      if (!bulkAssignSmartMode) {
        setBulkAssignMessage(
          [
            "Bulk assignment complete:",
            `- ${assignedCount} participants assigned`,
            `- ${skippedCount} skipped`,
            `- ${failedCount} failed`,
          ].join("\n")
        )
      } else {
        const warningPreview = warningNames.slice(0, 3).join(", ")
        const warningLine = warningCount > 0
          ? `- ${warningCount} had warnings (capacity or balance)${warningPreview ? `: ${warningPreview}${warningNames.length > 3 ? ", ..." : ""}` : ""}`
          : "- 0 had warnings (capacity or balance)"

        const summaryLines = [
          "Bulk assignment complete:",
          `- ${assignedCount} participants assigned`,
          `- ${skippedCount} skipped (no safe session)`,
          `- ${avoidedCount} avoided high-risk session${avoidedCount === 1 ? "" : "s"}`,
          warningLine,
          `- ${failedCount} failed`,
          "",
          "Top issues:",
          `- Nearly full sessions: ${nearlyFullIssueCount}`,
          `- Assistance imbalance risk: ${assistanceImbalanceRiskCount}`,
          `- Better alternative used: ${betterAlternativeUsedCount}`,
        ]

        setBulkAssignMessage(summaryLines.join("\n"))
      }
    } finally {
      setBulkAssignLoading(false)
      refreshParticipants()
    }
  }

  function handleCreateParticipantSubmit(payload) {
    const localId = `local-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const selectedSession = (Array.isArray(eventInfo?.sessions) ? eventInfo.sessions : [])
      .find((session) => String(session.id) === String(payload.session_id || ""))

    updateParticipantsLocal((prev) => [
      {
        id: localId,
        event_id: payload.event_id,
        session_id: payload.session_id || null,
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        role: payload.role || "participant",
        is_minor: Boolean(payload.is_minor),
        requires_assistance: Boolean(payload.requires_assistance),
        checked_in: false,
        is_waitlisted: false,
        priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : 0,
        waiver_signed: false,
        waiver_verified: false,
        session_name: selectedSession?.name || null,
        notes: payload.notes || null,
      },
      ...prev,
    ])

    const nextQueue = enqueueEventAction(eventId, {
      type: "create_participant",
      participantId: localId,
      payload,
    })
    persistQueuedEventActions(nextQueue)
    if (navigator.onLine) {
      showCreateToast("Participant added", { tone: "success" })
    } else {
      showCreateToast("Participant saved (syncing...)", { tone: "info" })
    }
    setCreateModalOpen(false)
    processQueuedEventActions()
  }

  function handleOpenEditParticipant(participant) {
    if (!participant?.id) return
    setEditingParticipant(participant)
    setEditModalOpen(true)
  }

  function handleEditParticipantSubmit(payload) {
    if (!editingParticipant?.id) return

    const participantId = String(editingParticipant.id)
    const selectedSession = (Array.isArray(eventInfo?.sessions) ? eventInfo.sessions : [])
      .find((session) => String(session.id) === String(payload.session_id || ""))

    updateParticipantsLocal((prev) => prev.map((participant) => {
      if (String(participant.id) !== participantId) return participant

      const nextRole = String(payload.role || participant.role || "participant").trim().toLowerCase()
      return {
        ...participant,
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        role: nextRole,
        is_minor: Boolean(payload.is_minor),
        requires_assistance: Boolean(payload.requires_assistance),
        priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : 0,
        notes: payload.notes || null,
        session_id: payload.session_id || null,
        session_name: payload.session_id ? (selectedSession?.name || null) : null,
        volunteer_type: nextRole === "volunteer" ? (payload.volunteer_type || null) : null,
        volunteer_additional_types: nextRole === "volunteer"
          ? (Array.isArray(payload.volunteer_additional_types) ? payload.volunteer_additional_types : [])
          : [],
        volunteer_is_versatile: nextRole === "volunteer" ? Boolean(payload.volunteer_is_versatile) : false,
      }
    }))

    const nextQueue = enqueueEventAction(eventId, {
      type: "edit_participant",
      participantId,
      payload,
    })
    persistQueuedEventActions(nextQueue)
    setEditModalOpen(false)
    setEditingParticipant(null)
    processQueuedEventActions()
  }

  // ✅ stable drag handlers with proper multi-select logic
  function handleDragStart(event) {
    setActiveId(String(event.active.id))
    setDragError(null)
    clearHoverGuidance()
  }

  function handleDragMove(event) {
    if (event.delta) setActiveTransform(event.delta)

    const activeParticipantId = String(event?.active?.id || "")
    const overId = String(event?.over?.id || "")

    if (!activeParticipantId || !overId.startsWith("session-")) {
      clearHoverGuidance()
      return
    }

    const targetSessionId = overId.replace("session-", "")
    const activeParticipant = participants.find((participant) => String(participant.id) === activeParticipantId)

    if (!activeParticipant) {
      clearHoverGuidance()
      return
    }

    if (isVolunteer(activeParticipant) || String(activeParticipant.session_id || "") === String(targetSessionId || "")) {
      clearHoverGuidance()
      return
    }

    scheduleHoverGuidanceEvaluation(activeParticipantId, targetSessionId)
  }

  // ✅ stable drag end logic with proper multi-select handling
  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    clearHoverGuidance()

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

  function DroppableSession({ sessionId, children, className = "" }) {
    const { setNodeRef } = useDroppable({
      id: `session-${sessionId}`,
    })
    const guidance = hoverGuidanceBySession[String(sessionId || "")]
    const isGuidanceLoading = String(hoverGuidanceLoadingSessionId || "") === String(sessionId || "")

    const guidanceClass = guidance?.status === "good"
      ? "ring-2 ring-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]"
      : guidance?.status === "warn"
        ? "border-2 border-amber-400"
        : guidance?.status === "avoid"
          ? "border-2 border-red-500"
          : ""

    const guidanceText = guidance?.status === "good"
      ? "Good fit"
      : guidance?.status === "warn"
        ? "May cause imbalance"
        : guidance?.status === "avoid"
          ? "Not recommended"
          : ""

    const guidanceTextClass = guidance?.status === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : guidance?.status === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : guidance?.status === "avoid"
          ? "border-red-200 bg-red-50 text-red-700"
          : ""

    return (
      <div
        ref={setNodeRef}
        className={`relative bg-white rounded-xl border p-4 min-h-[120px] ${isSessionFull(sessionId) ? 'border-red-500 bg-red-100' : ''} ${guidanceClass} ${className}`.trim()}
      >
        {(guidanceText || isGuidanceLoading) && (
          <div className="pointer-events-none absolute right-2 top-2 z-10">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isGuidanceLoading ? "border-slate-200 bg-slate-50 text-secondary" : guidanceTextClass}`}>
              {isGuidanceLoading ? "Checking..." : guidanceText}
            </span>
          </div>
        )}
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
        <div className="text-xs text-secondary">
          {p.email}
        </div>
        {p.requires_assistance && (
          <span className="mt-1 inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
            Needs Assistance
          </span>
        )}
        {syncItem?.syncStatus === "pending" && (
          <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <SyncStatusIcon status={syncItem.status} />
            <span>Syncing</span>
          </div>
        )}
        {syncItem?.syncStatus === "failed" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-red-600">
              <SyncStatusIcon status={syncItem.status} />
              <span>Failed</span>
            </span>
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
              <span className="text-secondary">({syncItem.error})</span>
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
  const participantFormEventId = eventId ? String(eventId) : null
  const participantFormEventType = normalizeParticipantFormEventType(eventInfo?.event_type)

  return (
    <div className="relative mx-auto w-full max-w-[1300px] p-6 space-y-6" onClick={() => setSelectedIds([])}>

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
                onClick={() => retryAllFailed(queuedEventActions)}
                className="text-xs text-blue-600 underline"
              >
                Retry All Failed ({failedQueueCount})
              </button>
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

      {createToast && (
        <div className="fixed right-4 top-4 z-50 rounded border px-4 py-3 text-sm shadow-lg bg-white">
          <div className="flex items-center gap-3">
            <span
              className={`font-medium ${
                createToast.tone === "error"
                  ? "text-red-700"
                  : createToast.tone === "info"
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              {createToast.message}
            </span>
            {createToast.retryQueueItemId && (
              <button
                type="button"
                onClick={() => {
                  retryQueueItem(createToast.retryQueueItemId)
                  dismissCreateToast()
                }}
                className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              >
                Retry
                <button
                  type="button"
                  onPointerDown={(e) => { e.stopPropagation() }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenEditParticipant(p)
                  }}
                  className="mt-1 text-xs text-sky-700 underline"
                >
                  Edit
                </button>
              </button>
            )}
            <button
              type="button"
              onClick={dismissCreateToast}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto text-[11px] text-secondary sm:text-xs">
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
            <span className="font-medium text-secondary">Event Participants</span>
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
            <p className="text-sm text-secondary">
              {eventInfo.title}
              {eventInfo.start_date ? ` • ${eventInfo.start_date}` : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-secondary">
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
          <Button
            type="button"
            onClick={() => navigate("/events")}
            variant="neutral"
            className="px-3 py-2 sm:py-1 rounded border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Go back to Events list"
          >
            Events List
          </Button>
          <Button
            onClick={toggleEventMode}
            variant={eventMode ? "success" : "neutral"}
            className={`px-3 py-2 sm:py-1 rounded text-sm font-semibold ${!eventMode ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : ""}`}
            title="Toggle simplified event-day UI"
          >
            Event Mode {eventMode ? "ON" : "OFF"}
          </Button>
          <Button
            onClick={() => { refreshParticipants(); refreshNoShows(); }}
            variant="neutral"
            className="px-3 py-2 sm:py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
            title="Refresh participants"
          >
            ↻ Refresh
          </Button>
          <Button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            variant="success"
            className="px-3 py-2 sm:py-1 rounded text-sm"
            title="Add participant"
          >
            Add Participant
          </Button>
          {/* Add a button to auto-assign all unassigned participants */}
          <Button
            type="button"
            onClick={handleAutoAssignUnassignedParticipants}
            disabled={bulkAssignLoading}
            variant="primary"
            className={`px-3 py-2 sm:py-1 rounded text-sm ${bulkAssignLoading ? "bg-slate-300 text-slate-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
            title="Auto-assign unassigned participants using recommendations"
          >
            {bulkAssignLoading ? "Auto-Assigning..." : "Auto-Assign Unassigned"}
          </Button>
          <label className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-secondary">
            <input
              type="checkbox"
              checked={bulkAssignSmartMode}
              onChange={(e) => setBulkAssignSmartMode(Boolean(e.target.checked))}
              disabled={bulkAssignLoading}
            />
            Smart Mode (respects warnings)
          </label>
          <Button
            type="button"
            onClick={handleDuplicateEvent}
            disabled={duplicateLoading}
            variant="primary"
            className={`px-3 py-2 sm:py-1 rounded text-sm ${duplicateLoading ? "bg-slate-300 text-slate-600 cursor-not-allowed" : "bg-sky-600 text-white hover:bg-sky-700"}`}
            title="Create a new draft event with the same configuration"
          >
            {duplicateLoading ? "Duplicating..." : "Duplicate Event"}
          </Button>
          <Button
            type="button"
            onClick={handleOpenSaveTemplateModal}
            disabled={saveTemplateLoading}
            variant="primary"
            className={`px-3 py-2 sm:py-1 rounded text-sm ${saveTemplateLoading ? "bg-slate-300 text-slate-600 cursor-not-allowed" : "bg-sky-600 text-white hover:bg-sky-700"}`}
            title="Create an event template from this event"
          >
            {saveTemplateLoading ? "Saving Template..." : "Save as Template"}
          </Button>
          <Button
            type="button"
            onClick={() => navigate("/event-templates")}
            variant="primary"
            className="px-3 py-2 sm:py-1 text-sm"
            title="Using Templates retains details from the chosen template. Details can be edited after creation."
          >
            Templates
          </Button>
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
            {bulkAssignMessage && (
              <p className="whitespace-pre-line text-xs text-secondary">{bulkAssignMessage}</p>
            )}
          </div>
        </div>
      </Card>

      {saveTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Save as Template</h3>
            <p className="mt-1 text-sm text-secondary">Create template from this event?</p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm text-secondary">
                <span className="mb-1 block font-medium">Template Name</span>
                <input
                  type="text"
                  value={saveTemplateNameInput}
                  onChange={(e) => setSaveTemplateNameInput(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Template name"
                />
              </label>

              <label className="flex items-start gap-2 text-sm text-secondary">
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
                    <label className="text-sm text-secondary">
                      <span className="mb-1 block">Months</span>
                      <input
                        type="text"
                        value={scheduleMonthsInput}
                        onChange={(e) => setScheduleMonthsInput(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2"
                        placeholder="5,6,7,8,9"
                      />
                    </label>

                    <label className="text-sm text-secondary">
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

                    <label className="text-sm text-secondary sm:col-span-2">
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

      <ParticipantForm
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateParticipantSubmit}
        sessions={Array.isArray(eventInfo?.sessions) ? eventInfo.sessions : []}
        eventId={participantFormEventId}
        eventType={participantFormEventType}
        defaultEventId={String(eventId || "")}
        lockEvent={true}
        title="Add Participant"
        submitLabel="Add Participant"
        projectionBySession={projectionBySession}
      />

      <ParticipantForm
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingParticipant(null)
        }}
        onSubmit={handleEditParticipantSubmit}
        sessions={Array.isArray(eventInfo?.sessions) ? eventInfo.sessions : []}
        eventId={participantFormEventId}
        eventType={participantFormEventType}
        defaultEventId={String(eventId || "")}
        initialData={editingParticipant}
        lockEvent={true}
        title="Edit Participant"
        submitLabel="Save Changes"
        projectionBySession={projectionBySession}
      />

      {eventInfo && (
        <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Card.Header className="text-lg">Event Logistics</Card.Header>
              <p className="text-sm text-secondary">{buildLocationSummary(eventInfo)}</p>
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className={`rounded-full px-3 py-1 ${eventInfo.location?.beach_accessibility ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                  {eventInfo.location?.beach_accessibility ? "Beach access confirmed" : "Beach access needs review"}
                </span>
                {eventInfo.start_time && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-secondary">
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
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{eventInfo.directions}</p>
              </div>
            )}
            {eventInfo.parking_info && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Parking</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{eventInfo.parking_info}</p>
              </div>
            )}
            {eventInfo.lodging_info && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Lodging</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{eventInfo.lodging_info}</p>
              </div>
            )}
            {eventInfo.beach_access_notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-1">
                <h3 className="text-sm font-semibold text-slate-900">Beach Access Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{eventInfo.beach_access_notes}</p>
              </div>
            )}
            {eventInfo.internal_notes && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900">Internal Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{eventInfo.internal_notes}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {!eventMode && <PriorityLegend />}

      {!eventMode && (
        <Card className="mb-0 p-4">
          <div className="mb-2">
            <Card.Header>No-Show Management</Card.Header>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold">No-Show Candidates:</span>
            <span className="text-red-600 font-bold">{noShows.length}</span>
          </div>
          <Button
            onClick={handlePromoteNoShows}
            disabled={promoteLoading || noShows.length === 0}
            variant="danger"
            className={`${promoteLoading || noShows.length === 0 ? 'bg-gray-400' : ''}`}
          >
            {promoteLoading ? 'Promoting...' : 'Promote Waitlist to Fill No-Shows'}
          </Button>
          {noShowError && <span className="text-red-500 text-sm">{noShowError}</span>}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3">
          <Card.Header>Event-Day Actions</Card.Header>
        </div>
        <div className="space-y-3">
          <Button
            onClick={() => navigate(`/events/${eventId}/checkin`)}
            variant="success"
            className={`w-full rounded-xl font-semibold ${eventMode ? "py-6 text-2xl" : "py-4"}`}
          >
            ✔ Start Event Check-In
          </Button>

          <Button
            onClick={() => navigate(`/events/${eventId}/fast-assign`)}
            variant="primary"
            className={`w-full rounded-xl font-semibold ${eventMode ? "py-5 text-xl" : "py-3 text-sm"}`}
          >
            ⚡ Fast Assign
          </Button>
        </div>
      </Card>

      {(() => {
        const realSessions = groupedParticipants.filter(({ sessionId }) => {
          if (!sessionId || sessionId === "UNASSIGNED" || sessionId === "WAITLISTED") return false
          return true
        })
        const totalSessions = realSessions.length
        let sessionsNeedingAttention = 0
        let highAssistanceSessions = 0
        let moderateAssistanceSessions = 0
        for (const { sessionId } of realSessions) {
          const staffing = getSessionStaffingIndicators(sessionId)
          if (!staffing) continue
          const waterShortfall = Math.max(0, staffing.requiredWater - staffing.waterCount)
          const beachShortfall = Math.max(0, staffing.requiredBeach - staffing.beachCount)
          if (waterShortfall > 0 || beachShortfall > 0) sessionsNeedingAttention++
          const heat = getSessionAssistanceHeat(staffing)
          if (heat?.label.startsWith("High")) highAssistanceSessions++
          else if (heat?.label.startsWith("Moderate")) moderateAssistanceSessions++
        }
        const allGood = sessionsNeedingAttention === 0 && totalSessions > 0
        return (
          <Card className="p-3">
            <div className="mb-2">
              <Card.Header>Staffing Overview</Card.Header>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-secondary">Staffing:</span>
            {sessionsNeedingAttention > 0 && (
              <span className="animate-pulse rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                ⚠️ {sessionsNeedingAttention} need{sessionsNeedingAttention === 1 ? "s" : ""} attention
              </span>
            )}
            {highAssistanceSessions > 0 && (
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-red-800">
                🔴 {highAssistanceSessions} high assistance
              </span>
            )}
            {moderateAssistanceSessions > 0 && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-700">
                🟡 {moderateAssistanceSessions} moderate
              </span>
            )}
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-secondary">
              📊 {totalSessions} session{totalSessions === 1 ? "" : "s"}
            </span>
            {allGood && (
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-700">
                ✓ All sessions staffed
              </span>
            )}
            </div>
          </Card>
        )
      })()}

      {(() => {
        if (!projectionResult) return null
        const projections = Array.isArray(projectionResult.projections) ? projectionResult.projections : []
        const warnings = Array.isArray(projectionResult.warnings) ? projectionResult.warnings : []
        const finalState = Array.isArray(projectionResult.final_state) ? projectionResult.final_state : []
        if (projections.length === 0 && warnings.length === 0) return null

        // Count session appearances in first 3 steps
        const countBySession = {}
        projections.slice(0, 3).forEach(({ assigned_session_id }) => {
          const sid = String(assigned_session_id || "")
          if (sid) countBySession[sid] = (countBySession[sid] || 0) + 1
        })
        const topSid = Object.entries(countBySession).sort((a, b) => b[1] - a[1])[0]?.[0]
        const topSession = topSid ? finalState.find((s) => String(s.session_id) === topSid) : null
        const topName = topSession?.name || (topSid ? getSessionLabel(topSid) : null)
        const topCount = topSid ? countBySession[topSid] : 0

        // Sessions to avoid: full in final_state or have a structured warning
        const avoidSessions = finalState
          .filter((s) => {
            const sid = String(s.session_id || "")
            const available = (s.capacity || 0) - (s.current_count || 0)
            const hasWarning = warnings.some((w) => String(w?.session_id || "") === sid)
            return available <= 0 || hasWarning
          })
          .slice(0, 2)

        const suggestions = []
        if (topName && topCount > 0) {
          suggestions.push({
            type: "go",
            text: `Next best: ${topName} (${topCount === 1 ? "1 upcoming" : `${topCount} upcoming`})`,
          })
        }
        avoidSessions.forEach((s) => {
          const sid = String(s.session_id || "")
          const available = (s.capacity || 0) - (s.current_count || 0)
          const sessionWarning = warnings.find((w) => String(w?.session_id || "") === sid)
          const reason = available <= 0 ? "full" : (sessionWarning?.message || "at risk")
          const name = s.name || getSessionLabel(sid)
          suggestions.push({ type: "avoid", text: `Avoid ${name} — ${reason}` })
        })

        const shown = suggestions.slice(0, 3)
        if (shown.length === 0) return null

        return (
          <Card className="border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-500">Next Best Actions</p>
            <ul className="space-y-1">
              {shown.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-blue-900">
                  <span className="mt-0.5 shrink-0">{s.type === "go" ? "→" : "✕"}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })()}

      <Card className="p-5">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={(event) => {
          setActiveTransform(null)
          handleDragEnd(event)
        }}
        onDragCancel={() => {
          setActiveTransform(null)
          clearHoverGuidance()
        }}
      >

        {/* Debug: log groupedParticipants structure */}


        {sortedParticipants.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-secondary">
            No participants match the selected filter.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {groupedParticipants.map((groupData, idx) => {
            const sessionId = groupData.sessionId
            const group = groupData.participants
            const isHoldingBucket = sessionId === "UNASSIGNED" || sessionId === "WAITLISTED"
            const softStatus = getSessionSoftStatus(sessionId, idx, group)
            const sessionLabel = getSessionLabel(sessionId)
            const sessionStatus = getSessionStatus(sessionId)
            const sessionStats = sessionStatsById[String(sessionId || "")]
            const availableSpots = Number(
              sessionStats?.available_spots ?? (
                Number(sessionStats?.capacity || 0) - Number(sessionStats?.current_count || 0)
              )
            )
            const availabilityBadge = !isHoldingBucket && Number.isFinite(availableSpots)
              ? (availableSpots === 0 ? "Full" : availableSpots <= 2 ? "Nearly Full" : "")
              : ""
            const sessionVisualState = isHoldingBucket
              ? { cardClass: "", badgeClass: "", badgeLabel: "" }
              : getSessionVisualState(sessionId)
            const staffing = getSessionStaffingIndicators(sessionId)
            const assistanceHeat = staffing ? getSessionAssistanceHeat(staffing) : null
            const staffingGuidance = staffing ? getSessionStaffingGuidance(sessionId) : []
            const waterShortfall = staffing ? Math.max(0, staffing.requiredWater - staffing.waterCount) : 0
            const beachShortfall = staffing ? Math.max(0, staffing.requiredBeach - staffing.beachCount) : 0
            const waterMaxMoveCount = getMaxMoveCountForType(sessionId, "water")
            const beachMaxMoveCount = getMaxMoveCountForType(sessionId, "beach")
            const showWaterMoveButton = waterMaxMoveCount > 0
            const showBeachMoveButton = beachMaxMoveCount > 0
            const waterMoveCounts = showWaterMoveButton ? Array.from({ length: waterMaxMoveCount }, (_, index) => index + 1) : []
            const beachMoveCounts = showBeachMoveButton ? Array.from({ length: beachMaxMoveCount }, (_, index) => index + 1) : []
            const waterPreviewCandidates = showWaterMoveButton
              ? getMoveCandidates(sessionId, "water", waterMaxMoveCount, { preview: true })
              : []
            const beachPreviewCandidates = showBeachMoveButton
              ? getMoveCandidates(sessionId, "beach", beachMaxMoveCount, { preview: true })
              : []
            const waterPreviewReason = waterPreviewCandidates.length > 0
              ? buildPreviewReasonText(waterPreviewCandidates, sessionId, "water")
              : { tooltip: "", inline: "" }
            const beachPreviewReason = beachPreviewCandidates.length > 0
              ? buildPreviewReasonText(beachPreviewCandidates, sessionId, "beach")
              : { tooltip: "", inline: "" }
            const waterSuggestedCount = Math.min(waterShortfall, waterPreviewCandidates.length, 3)
            const beachSuggestedCount = Math.min(beachShortfall, beachPreviewCandidates.length, 3)
            const canSuggestWater = waterSuggestedCount >= 1 && !moveInFlightByType.water && waterShortfall > 0 && waterPreviewCandidates.length > 0
            const canSuggestBeach = beachSuggestedCount >= 1 && !moveInFlightByType.beach && beachShortfall > 0 && beachPreviewCandidates.length > 0
            const sessionIsBalanced = staffing != null
              && waterShortfall === 0 && beachShortfall === 0
              && (staffing.requiredWater > 0 || staffing.requiredBeach > 0)
            const projFlags = !isHoldingBucket ? (projectionBySession[String(sessionId || "")] || null) : null
            return (
              <DroppableSession key={sessionId} sessionId={sessionId} className={sessionVisualState.cardClass}>
                <div className="flex justify-between mb-2">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <span>{sessionLabel}</span>
                    {availabilityBadge && (
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${availabilityBadge === "Full" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                      >
                        {availabilityBadge}
                      </span>
                    )}
                    {sessionVisualState.badgeLabel && (
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sessionVisualState.badgeClass}`}>
                        {sessionVisualState.badgeLabel}
                      </span>
                    )}
                    {assistanceHeat && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${assistanceHeat.className}`}>
                        <span>{assistanceHeat.emoji}</span>
                        <span>{assistanceHeat.label}</span>
                      </span>
                    )}
                    {projFlags?.willBeFull && !availabilityBadge && (
                      <span
                        title="Projected to fill within the next 3 assignments"
                        className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700"
                      >
                        ↑ Filling soon
                      </span>
                    )}
                    {projFlags?.atRisk && (
                      <span
                        title="Projection warnings detected for this session"
                        className="inline-flex items-center rounded-full border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700"
                      >
                        ⚠ At risk
                      </span>
                    )}
                  </h3>
                  <span className={sessionStatus.color}>{isHoldingBucket ? sessionStatus.participantCount : `${sessionStatus.participantCount} / 15`}</span>
                </div>
                <div className={`mb-3 text-xs font-medium ${softStatus.className}`}>
                  {softStatus.text}
                </div>
                {staffing && (
                  <div className="mb-3 flex items-center gap-3 text-xs border-t border-gray-100 pt-2">
                    <span className={`font-medium ${staffingIndicatorColor(staffing.waterCount, staffing.requiredWater)}`}>
                      Water: {staffing.waterCount} / {staffing.requiredWater}
                    </span>
                    <span className={`font-medium ${staffingIndicatorColor(staffing.beachCount, staffing.requiredBeach)}`}>
                      Beach: {staffing.beachCount} / {staffing.requiredBeach}
                    </span>
                    <span className="text-secondary">
                      Assistance: {staffing.assistanceCount}
                    </span>
                  </div>
                )}
                {sessionIsBalanced && (
                  <div className="mb-2 text-[11px] text-emerald-600">✓ All set — staffing looks good</div>
                )}
                {staffingGuidance.length > 0 && (
                  <div className="mb-3 space-y-1 text-xs text-amber-700">
                    {staffingGuidance.map((suggestion, suggestionIndex) => (
                      <div key={`${sessionId}-guidance-${suggestionIndex}`}>{suggestion}</div>
                    ))}
                    {waterShortfall > 0 && waterPreviewCandidates.length > 0 && (
                      <div>
                        <div
                          className="inline-flex max-w-full items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-secondary"
                          title={waterPreviewReason.tooltip || undefined}
                        >
                          <span className="font-medium">Moving Water:</span>
                          <span className="ml-1">{formatPreviewVolunteerList(waterPreviewCandidates)}</span>
                        </div>
                        {waterPreviewReason.inline && (
                          <div className="mt-1 whitespace-pre-line text-[10px] text-secondary">{waterPreviewReason.inline}</div>
                        )}
                      </div>
                    )}
                    {beachShortfall > 0 && beachPreviewCandidates.length > 0 && (
                      <div>
                        <div
                          className="inline-flex max-w-full items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-secondary"
                          title={beachPreviewReason.tooltip || undefined}
                        >
                          <span className="font-medium">Moving Beach:</span>
                          <span className="ml-1">{formatPreviewVolunteerList(beachPreviewCandidates)}</span>
                        </div>
                        {beachPreviewReason.inline && (
                          <div className="mt-1 whitespace-pre-line text-[10px] text-secondary">{beachPreviewReason.inline}</div>
                        )}
                      </div>
                    )}
                    {(canSuggestWater || canSuggestBeach || moveInFlightByType.water || moveInFlightByType.beach) && (waterSuggestedCount >= 1 || beachSuggestedCount >= 1) && (
                      <div className="mt-2 space-y-1">
                        <div className="flex flex-wrap gap-2">
                          {waterSuggestedCount >= 1 && (
                            <button
                              key={`${sessionId}-water-suggest`}
                              type="button"
                              onClick={() => handleGuidedVolunteerMoveBatch(sessionId, "water", waterSuggestedCount)}
                              disabled={!canSuggestWater}
                              title={`Suggested: move ${waterSuggestedCount} Water volunteer${waterSuggestedCount === 1 ? "" : "s"} to this session`}
                              aria-label={`Suggested: move ${waterSuggestedCount} Water volunteer${waterSuggestedCount === 1 ? "" : "s"} to this session`}
                              className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition-opacity ${
                                !canSuggestWater
                                  ? "border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed opacity-60"
                                  : "border-sky-400 bg-sky-100 text-sky-900 hover:bg-sky-200"
                              }`}
                            >
                              ★ Move {waterSuggestedCount} Water Volunteer{waterSuggestedCount === 1 ? "" : "s"}
                            </button>
                          )}
                          {beachSuggestedCount >= 1 && (
                            <button
                              key={`${sessionId}-beach-suggest`}
                              type="button"
                              onClick={() => handleGuidedVolunteerMoveBatch(sessionId, "beach", beachSuggestedCount)}
                              disabled={!canSuggestBeach}
                              title={`Suggested: move ${beachSuggestedCount} Beach volunteer${beachSuggestedCount === 1 ? "" : "s"} to this session`}
                              aria-label={`Suggested: move ${beachSuggestedCount} Beach volunteer${beachSuggestedCount === 1 ? "" : "s"} to this session`}
                              className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition-opacity ${
                                !canSuggestBeach
                                  ? "border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed opacity-60"
                                  : "border-sky-400 bg-sky-100 text-sky-900 hover:bg-sky-200"
                              }`}
                            >
                              ★ Move {beachSuggestedCount} Beach Volunteer{beachSuggestedCount === 1 ? "" : "s"}
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-secondary">
                          {waterSuggestedCount >= 1 && beachSuggestedCount >= 1
                            ? `Based on shortage (Water: ${waterShortfall}, Beach: ${beachShortfall}) and available volunteers (${waterPreviewCandidates.length}W / ${beachPreviewCandidates.length}B)`
                            : waterSuggestedCount >= 1
                              ? `Based on shortage (${waterShortfall}) and available volunteers (${waterPreviewCandidates.length})`
                              : `Based on shortage (${beachShortfall}) and available volunteers (${beachPreviewCandidates.length})`
                          }
                        </div>
                      </div>
                    )}
                    {(showWaterMoveButton || showBeachMoveButton) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {waterMoveCounts.map((count) => (
                          <button
                            key={`${sessionId}-water-move-${count}`}
                            type="button"
                            onClick={() => handleGuidedVolunteerMoveBatch(sessionId, "water", count)}
                            disabled={moveInFlightByType.water}
                            title={`Move ${count} Water volunteer${count === 1 ? "" : "s"} from suggested session`}
                            aria-label={`Move ${count} Water volunteer${count === 1 ? "" : "s"} from suggested session`}
                            className={`rounded border px-2 py-1 text-[11px] font-semibold ${moveInFlightByType.water ? "border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed" : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"}`}
                          >
                            Move {count} Water Volunteer{count === 1 ? "" : "s"}
                          </button>
                        ))}
                        {beachMoveCounts.map((count) => (
                          <button
                            key={`${sessionId}-beach-move-${count}`}
                            type="button"
                            onClick={() => handleGuidedVolunteerMoveBatch(sessionId, "beach", count)}
                            disabled={moveInFlightByType.beach}
                            title={`Move ${count} Beach volunteer${count === 1 ? "" : "s"} from suggested session`}
                            aria-label={`Move ${count} Beach volunteer${count === 1 ? "" : "s"} from suggested session`}
                            className={`rounded border px-2 py-1 text-[11px] font-semibold ${moveInFlightByType.beach ? "border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed" : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"}`}
                          >
                            Move {count} Beach Volunteer{count === 1 ? "" : "s"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                      <div className="text-xs text-secondary">
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
      </Card>

      {dragError && (
        <div className="mt-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {dragError}
        </div>
      )}
    </div>
  )
}
export default EventDetail