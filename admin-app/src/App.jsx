import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom"
import BottomNav from "./components/BottomNav"
import AppLayout from "./components/AppLayout"
import GlobalSearch from "./components/GlobalSearch"
import CommandPalette from "./components/CommandPalette"
import NotificationCenter from "./components/NotificationCenter"
import Dashboard from "./pages/Dashboard"
import Events from "./pages/Events"
import Participants from "./pages/Participants"
import Login from "./pages/Login"
import EventDetail from "./pages/EventDetail"
import CreateEvent from "./pages/CreateEvent"
import EditEvent from "./pages/EditEvent"
import CheckIn from "./pages/CheckIn"
import FastAssign from "./pages/FastAssign"
import FeedbackReview from "./pages/FeedbackReview"
import EventTemplates from "./pages/EventTemplates"
import WaiverTemplates from "./pages/WaiverTemplates"
import VolunteerDashboard from "./pages/VolunteerDashboard"
import ExecutiveDashboard from "./pages/ExecutiveDashboard"
import Communications from "./pages/Communications"
import AuditLog from "./pages/AuditLog"
import PermissionsManagement from "./pages/PermissionsManagement"
import AutomationManagement from "./pages/AutomationManagement"
import PortalLayout from "./components/PortalLayout"
import PortalHome from "./pages/PortalHome"
import PortalEvents from "./pages/PortalEvents"
import PortalRegister from "./pages/PortalRegister"
import PortalLogin from "./pages/PortalLogin"
import {
  clearAuthSession,
  fetchMyProfile,
  getAuthChangedEventName,
  getStoredProfile,
  getStoredToken,
} from "./api/auth"
import { fetchAllParticipants, fetchDashboardMetrics, fetchEvents, fetchVolunteerDashboard } from "./api/events"
import { fetchCommunicationDeliveries, fetchCommunicationMessages } from "./api/communications"
import { fetchAdminAuditEvents } from "./api/adminAudit"
import { fetchNotificationReadState, upsertNotificationReadState } from "./api/notificationReadState"
import { getWsBase } from "./api/baseUrl"
import { getReleaseTag } from "./config/release"

const GLOBAL_SEARCH_RECENTS_STORAGE_KEY = "sfa.globalSearchRecents"
const GLOBAL_SEARCH_RECENTS_LIMIT = 10
const NOTIFICATION_CENTER_READ_IDS_STORAGE_KEY = "sfa.notificationCenterReadIds"
const NOTIFICATION_CENTER_REFRESH_INTERVAL_STORAGE_KEY = "sfa.notificationCenterRefreshIntervalMs"
const DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY = "sfa.dashboardRefreshIntervalMs"
const EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY = "sfa.executiveDashboardRefreshIntervalMs"
const NOTIFICATION_FALLBACK_REFRESH_INTERVAL_MS = 60000

function getBuildFingerprint() {
  const envFingerprint = import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_APP_VERSION
  if (envFingerprint) return String(envFingerprint)

  if (typeof document === "undefined") return "unknown"

  const scriptSrc = Array.from(document.scripts)
    .map((script) => script.src || "")
    .find((src) => src.includes("/assets/") && /\.js(?:\?.*)?$/.test(src))

  if (!scriptSrc) return import.meta.env.DEV ? "dev-local" : "unknown"

  const hashMatch = scriptSrc.match(/\/assets\/[^/]*?-([A-Za-z0-9_-]{6,})\.js(?:\?.*)?$/)
  if (hashMatch?.[1]) return hashMatch[1]

  return import.meta.env.DEV ? "dev-local" : "unknown"
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function formatSearchDate(value) {
  if (!value) return ""

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

function formatSearchTime(value) {
  if (!value) return ""

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

function scoreSearchItem(item, query) {
  if (!query) return 0

  const searchText = normalizeSearchText(item.searchText)
  if (!searchText) return 0

  const title = normalizeSearchText(item.title)
  const subtitle = normalizeSearchText(item.subtitle)
  const detail = normalizeSearchText(item.detail)

  if (!searchText.includes(query)) return 0

  let score = 40
  if (title === query) score += 60
  else if (title.startsWith(query)) score += 30

  if (subtitle.includes(query)) score += 10
  if (detail.includes(query)) score += 8

  const tokens = query.split(" ").filter(Boolean)
  if (tokens.length > 1 && tokens.every((token) => searchText.includes(token))) {
    score += 12
  }

  return score
}

function buildParticipantDetailPath({ participantId, eventId, eventType, sessionId, searchText }) {
  const params = new URLSearchParams()

  if (participantId) params.set("participant_id", String(participantId))
  if (eventId) params.set("event_id", String(eventId))
  if (eventType) params.set("event_type", String(eventType).trim().toLowerCase())
  if (sessionId) params.set("session_id", String(sessionId))
  if (searchText) params.set("search", String(searchText))

  return `/participants?${params.toString()}`
}

function buildGlobalSearchSections(query, data) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const eventResults = (Array.isArray(data.events) ? data.events : [])
    .map((event) => {
      const item = {
        kind: "event",
        id: `event:${event.id}`,
        title: event.title || "Untitled event",
        subtitle: [event.status, event.event_type, formatSearchDate(event.start_date)].filter(Boolean).join(" • "),
        detail: [event.location?.venue, event.location?.city, event.location?.state].filter(Boolean).join(", "),
        badgeLabel: "EV",
        badgeClass: "bg-sky-100 text-sky-800",
        to: `/events/${event.id}`,
        searchText: [
          event.title,
          event.slug,
          event.status,
          event.event_type,
          event.start_date,
          event.end_date,
          event.location?.venue,
          event.location?.city,
          event.location?.state,
          event.directions,
          event.internal_notes,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const participantResults = (Array.isArray(data.participants) ? data.participants : [])
    .map((participant) => {
      const fullName = [participant.first_name, participant.last_name].filter(Boolean).join(" ").trim() || participant.email || "Unnamed participant"
      const item = {
        kind: "participant",
        id: `participant:${participant.id}`,
        title: fullName,
        subtitle: [participant.email, participant.event_title, participant.session_name].filter(Boolean).join(" • "),
        detail: [participant.role, participant.volunteer_type].filter(Boolean).join(" • "),
        badgeLabel: participant.role === "volunteer" ? "VT" : "PT",
        badgeClass: participant.role === "volunteer" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800",
        to: buildParticipantDetailPath({
          participantId: participant.id,
          eventId: participant.event_id,
          eventType: participant.event_type,
          sessionId: participant.session_id,
          searchText: fullName,
        }),
        searchText: [
          fullName,
          participant.email,
          participant.phone,
          participant.event_title,
          participant.session_name,
          participant.role,
          participant.volunteer_type,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const volunteerResults = (Array.isArray(data.volunteers) ? data.volunteers : [])
    .map((volunteer) => {
      const item = {
        kind: "volunteer",
        id: `volunteer:${volunteer.participant_id || volunteer.id}`,
        title: volunteer.full_name || volunteer.email || "Unnamed volunteer",
        subtitle: [volunteer.event_title, volunteer.session_name || "Unassigned"].filter(Boolean).join(" • "),
        detail: [volunteer.computed_status, volunteer.waiver_document_status, volunteer.compliance_status].filter(Boolean).join(" • "),
        badgeLabel: "VO",
        badgeClass: "bg-teal-100 text-teal-800",
        to: buildParticipantDetailPath({
          participantId: volunteer.participant_id,
          eventId: volunteer.event_id,
          eventType: volunteer.event_type,
          sessionId: volunteer.session_id,
          searchText: volunteer.full_name || volunteer.email || query,
        }),
        searchText: [
          volunteer.full_name,
          volunteer.email,
          volunteer.event_title,
          volunteer.session_name,
          volunteer.computed_status,
          volunteer.status_reasons,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const sessionResults = (Array.isArray(data.events) ? data.events : []).flatMap((event) =>
    (Array.isArray(event.sessions) ? event.sessions : []).map((session) => {
      const item = {
        kind: "session",
        id: `session:${event.id}:${session.id}`,
        title: session.name || "Untitled session",
        subtitle: [event.title, session.start_time ? formatSearchTime(session.start_time) : ""].filter(Boolean).join(" • "),
        detail: session.capacity != null ? `${session.participant_count || 0}/${session.capacity} participants` : `${session.participant_count || 0} participants`,
        badgeLabel: "SS",
        badgeClass: "bg-amber-100 text-amber-800",
        to: `/events/${event.id}?session_id=${encodeURIComponent(session.id)}`,
        searchText: [
          session.name,
          event.title,
          event.event_type,
          event.status,
          session.start_time,
          session.capacity,
          session.participant_count,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
  )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const sections = [
    { label: "Events", items: eventResults.slice(0, 5) },
    { label: "Participants", items: participantResults.slice(0, 5) },
    { label: "Volunteers", items: volunteerResults.slice(0, 5) },
    { label: "Sessions", items: sessionResults.slice(0, 5) },
  ]

  return sections.filter((section) => section.items.length > 0)
}

function readGlobalSearchRecents() {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(GLOBAL_SEARCH_RECENTS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => item && typeof item === "object" && item.id && item.title && item.to)
      .slice(0, GLOBAL_SEARCH_RECENTS_LIMIT)
  } catch {
    return []
  }
}

function writeGlobalSearchRecents(items) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      GLOBAL_SEARCH_RECENTS_STORAGE_KEY,
      JSON.stringify(items.slice(0, GLOBAL_SEARCH_RECENTS_LIMIT))
    )
  } catch {
    // Ignore storage write failures and keep in-memory state only.
  }
}

function readNotificationReadIds() {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_CENTER_READ_IDS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item) => typeof item === "string")
  } catch {
    return []
  }
}

function writeNotificationReadIds(values) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(NOTIFICATION_CENTER_READ_IDS_STORAGE_KEY, JSON.stringify(Array.isArray(values) ? values : []))
  } catch {
    // Ignore storage write failures and keep in-memory state only.
  }
}

function readNotificationRefreshIntervalMs() {
  if (typeof window === "undefined") return NOTIFICATION_FALLBACK_REFRESH_INTERVAL_MS

  // The dedicated preference, once set, is authoritative — including an explicit "Off" (0).
  const dedicatedRaw = window.localStorage.getItem(NOTIFICATION_CENTER_REFRESH_INTERVAL_STORAGE_KEY)
  if (dedicatedRaw !== null) {
    const dedicatedIntervalMs = Number(dedicatedRaw)
    if (Number.isFinite(dedicatedIntervalMs) && dedicatedIntervalMs >= 0) {
      return dedicatedIntervalMs
    }
  }

  // Fallback for users who haven't configured the dedicated preference yet.
  const executiveIntervalMs = Number(window.localStorage.getItem(EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY))
  if (Number.isFinite(executiveIntervalMs) && executiveIntervalMs > 0) {
    return executiveIntervalMs
  }

  const dashboardIntervalMs = Number(window.localStorage.getItem(DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY))
  if (Number.isFinite(dashboardIntervalMs) && dashboardIntervalMs > 0) {
    return dashboardIntervalMs
  }

  return NOTIFICATION_FALLBACK_REFRESH_INTERVAL_MS
}

function writeNotificationRefreshIntervalMs(value) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(NOTIFICATION_CENTER_REFRESH_INTERVAL_STORAGE_KEY, String(value))
  } catch {
    // Ignore storage write failures and keep in-memory state only.
  }
}

function normalizeNotificationSeverity(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized.includes("critical") || normalized.includes("error") || normalized.includes("failed")) return "critical"
  if (normalized.includes("warn") || normalized.includes("retry") || normalized.includes("defer") || normalized.includes("pending")) return "warning"
  return "info"
}

function normalizeNotificationTimestamp(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

// Only these domain:action combinations surface as notifications — everything else in the
// audit log (routine refreshes, high-volume system events, etc.) is intentionally excluded to
// avoid notification fatigue.
const AUDIT_NOTIFICATION_RULES = {
  "permissions:user_role_updated": {
    sourceLabel: "Permissions",
    severity: () => "warning",
    title: (event) => `Role updated: ${event.target_display || "user"}`,
    description: (event) => `Role changed from ${event.details?.previous_role || "unknown"} to ${event.details?.new_role || "unknown"}`,
    to: (event) => `/permissions${event.target_display ? `?email=${encodeURIComponent(event.target_display)}` : ""}`,
  },
  "participants:assign_session": {
    sourceLabel: "Participants",
    severity: () => "info",
    title: (event) => `Session assigned: ${event.target_display || "participant"}`,
    description: () => "A participant was assigned to a session.",
    to: (event) => `/participants${event.target_id ? `?participant_id=${encodeURIComponent(event.target_id)}` : ""}`,
  },
  "participants:promote_waitlist": {
    sourceLabel: "Participants",
    severity: () => "info",
    title: (event) => `Waitlist promotion: ${event.target_display || "participant"}`,
    description: () => "A participant was promoted from the waitlist.",
    to: (event) => `/participants${event.target_id ? `?participant_id=${encodeURIComponent(event.target_id)}` : ""}`,
  },
  "event_operations:event_operational_status_updated": {
    sourceLabel: "Event Operations",
    severity: (event) => normalizeNotificationSeverity(event.details?.new_operational_status),
    title: (event) => `Event status updated: ${event.target_display || "event"}`,
    description: (event) => `${event.details?.previous_operational_status || "unknown"} -> ${event.details?.new_operational_status || "unknown"}`,
    to: (event) => (event.target_id ? `/events/${event.target_id}` : "/events"),
  },
  "communications:template_created": {
    sourceLabel: "Templates",
    severity: () => "info",
    title: (event) => `Template created: ${event.target_display || "template"}`,
    description: () => "A new communication template was created.",
    to: () => "/communications?focus=templates",
  },
  "communications:template_active_state_updated": {
    sourceLabel: "Templates",
    severity: () => "info",
    title: (event) => `Template ${event.details?.new_is_active ? "activated" : "deactivated"}: ${event.target_display || "template"}`,
    description: () => "A communication template's active state changed.",
    to: () => "/communications?focus=templates",
  },
  "communications:message_deleted": {
    sourceLabel: "Messaging",
    severity: () => "warning",
    title: (event) => `Message deleted: ${event.target_display || "message"}`,
    description: () => "A communication message was deleted.",
    to: () => "/communications?focus=messages",
  },
  "automation:workflow_created": {
    sourceLabel: "Automation",
    severity: () => "info",
    title: (event) => `Workflow created: ${event.target_display || "workflow"}`,
    description: () => "A new automation workflow was created.",
    to: () => "/automation",
  },
  "automation:workflow_enabled_updated": {
    sourceLabel: "Automation",
    severity: () => "info",
    title: (event) => `Workflow ${event.details?.new_enabled ? "enabled" : "disabled"}: ${event.target_display || "workflow"}`,
    description: () => "An automation workflow's enabled state changed.",
    to: () => "/automation",
  },
  "automation:workflow_execution_completed": {
    sourceLabel: "Automation",
    severity: (event) => normalizeNotificationSeverity(event.details?.status),
    title: (event) => `Workflow run ${event.details?.status || "completed"}: ${event.target_display || "workflow"}`,
    description: () => "An automation workflow execution finished.",
    to: () => "/automation",
  },
  "volunteer:volunteer_lifecycle_updated": {
    sourceLabel: "Volunteers",
    severity: () => "info",
    title: (event) => `Volunteer status updated: ${event.target_display || "volunteer"}`,
    description: (event) => `${event.details?.previous_status || "unknown"} -> ${event.details?.new_status || "unknown"}`,
    to: () => "/volunteer-dashboard",
  },
  "volunteer:volunteer_assignment_created": {
    sourceLabel: "Volunteers",
    severity: () => "info",
    title: (event) => `Volunteer assigned: ${event.target_display || "volunteer"}`,
    description: () => "A volunteer was assigned to a session.",
    to: () => "/volunteer-dashboard",
  },
  "volunteer:volunteer_assignment_cancelled": {
    sourceLabel: "Volunteers",
    severity: () => "warning",
    title: (event) => `Volunteer assignment cancelled: ${event.target_display || "volunteer"}`,
    description: () => "A volunteer assignment was cancelled.",
    to: () => "/volunteer-dashboard",
  },
}

function buildAuditNotifications(auditEvents) {
  return (Array.isArray(auditEvents) ? auditEvents : [])
    .map((event, index) => {
      const domain = String(event?.domain || "").trim().toLowerCase()
      const action = String(event?.action || "").trim().toLowerCase()
      const rule = AUDIT_NOTIFICATION_RULES[`${domain}:${action}`]
      if (!rule) return null

      return {
        id: `audit:${event?.id || `${event?.created_at || ""}:${index}`}`,
        source: "audit",
        sourceLabel: rule.sourceLabel,
        type: "audit",
        typeLabel: "Audit",
        severity: rule.severity(event),
        title: rule.title(event),
        description: rule.description(event),
        occurredAt: normalizeNotificationTimestamp(event?.created_at),
        to: rule.to(event),
      }
    })
    .filter(Boolean)
    .slice(0, 20)
}

function buildOperationalNotifications({ metrics, messages, deliveries, auditEvents }) {
  const activityNotifications = (Array.isArray(metrics?.recent_activity) ? metrics.recent_activity : []).map((entry, index) => {
    const category = String(entry?.category || "").trim().toLowerCase()
    const eventType = String(entry?.event_type || "").trim().toLowerCase()
    const isDelivery = category.includes("delivery") || category.includes("provider") || eventType.includes("delivery") || eventType.includes("provider")
    const severity = normalizeNotificationSeverity(entry?.status)

    const activityParams = new URLSearchParams({
      focus: "recent-activity",
      status: String(entry?.status || ""),
      category: String(entry?.category || ""),
      event_type: String(entry?.event_type || ""),
      event_id: entry?.event_id ? String(entry.event_id) : "",
    })

    return {
      id: `telemetry:${entry?.id || entry?.event_id || `${entry?.occurred_at || ""}:${index}`}`,
      source: "telemetry",
      sourceLabel: "Telemetry",
      type: "telemetry",
      typeLabel: "Telemetry",
      severity,
      title: String(entry?.title || entry?.event_type || "Operational activity"),
      description: String(entry?.summary || entry?.description || entry?.status || "Recent telemetry update"),
      occurredAt: normalizeNotificationTimestamp(entry?.occurred_at),
      to: isDelivery ? "/communications?focus=deliveries" : `/executive-dashboard?${activityParams.toString()}`,
    }
  })

  const messageNotifications = (Array.isArray(messages) ? messages : []).slice(0, 12).map((message, index) => {
    const status = String(message?.status || "draft")
    const channel = String(message?.channel || "email").toUpperCase()

    return {
      id: `message:${message?.id || `${message?.created_at || ""}:${index}`}`,
      source: "messaging",
      sourceLabel: "Messaging",
      type: "message",
      typeLabel: "Messages",
      severity: normalizeNotificationSeverity(status),
      title: `Message ${status.replace(/_/g, " ")}`,
      description: `${message?.subject || "Untitled message"} (${channel})`,
      occurredAt: normalizeNotificationTimestamp(message?.created_at || message?.updated_at),
      to: `/communications?focus=messages&message_id=${encodeURIComponent(String(message?.id || ""))}`,
    }
  })

  const deliveryNotifications = (Array.isArray(deliveries) ? deliveries : []).slice(0, 16).map((delivery, index) => {
    const status = String(delivery?.status || "queued")
    const provider = String(delivery?.provider || delivery?.channel || "provider")

    return {
      id: `delivery:${delivery?.id || `${delivery?.created_at || delivery?.updated_at || ""}:${index}`}`,
      source: "messaging",
      sourceLabel: "Delivery",
      type: "delivery",
      typeLabel: "Deliveries",
      severity: normalizeNotificationSeverity(status),
      title: `Delivery ${status.replace(/_/g, " ")}`,
      description: `Provider: ${provider}`,
      occurredAt: normalizeNotificationTimestamp(delivery?.occurred_at || delivery?.updated_at || delivery?.created_at),
      to: `/communications?focus=deliveries&delivery_id=${encodeURIComponent(String(delivery?.id || ""))}`,
    }
  })

  const auditNotifications = buildAuditNotifications(auditEvents)

  return [...activityNotifications, ...messageNotifications, ...deliveryNotifications, ...auditNotifications]
    .sort((left, right) => new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime())
    .slice(0, 25)
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [token, setToken] = useState(() => getStoredToken())
  const [profile, setProfile] = useState(() => getStoredProfile())
  const [buildFingerprint, setBuildFingerprint] = useState(() => (import.meta.env.DEV ? "dev-local" : "..."))
  const [globalSearchInput, setGlobalSearchInput] = useState("")
  const [globalSearchQuery, setGlobalSearchQuery] = useState("")
  const [globalSearchData, setGlobalSearchData] = useState({
    events: [],
    participants: [],
    volunteers: [],
  })
  const [globalSearchRecents, setGlobalSearchRecents] = useState(() => readGlobalSearchRecents())
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [globalSearchError, setGlobalSearchError] = useState("")
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const commandPaletteReturnFocusRef = useRef(null)
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false)
  const [notificationCenterLoading, setNotificationCenterLoading] = useState(false)
  const [notificationCenterError, setNotificationCenterError] = useState("")
  const [operationalNotifications, setOperationalNotifications] = useState([])
  const hasLoadedNotificationsOnceRef = useRef(false)
  const [notificationReadIds, setNotificationReadIds] = useState(() => readNotificationReadIds())
  const [notificationRefreshIntervalMs, setNotificationRefreshIntervalMs] = useState(() => readNotificationRefreshIntervalMs())

  useEffect(() => {
    const authChangedEvent = getAuthChangedEventName()

    const syncSession = () => {
      setToken(getStoredToken())
      setProfile(getStoredProfile())
    }

    window.addEventListener(authChangedEvent, syncSession)
    window.addEventListener("storage", syncSession)

    return () => {
      window.removeEventListener(authChangedEvent, syncSession)
      window.removeEventListener("storage", syncSession)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setProfile(null)
      setGlobalSearchData({ events: [], participants: [], volunteers: [] })
      setGlobalSearchError("")
      setGlobalSearchInput("")
      setGlobalSearchQuery("")
      return
    }

    if (profile?.email) return

    let isCancelled = false
    fetchMyProfile(token)
      .then((nextProfile) => {
        if (!isCancelled) {
          setProfile(nextProfile)
        }
      })
      .catch((error) => {
        const message = String(error?.message || "").toLowerCase()
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false
        const isNetworkFailure = message.includes("failed to fetch") || message.includes("network")

        // Keep the current auth session during offline/network interruptions.
        if (isOffline || isNetworkFailure) return

        clearAuthSession()
      })

    return () => {
      isCancelled = true
    }
  }, [token, profile?.email])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setGlobalSearchQuery(globalSearchInput)
    }, 220)

    return () => window.clearTimeout(timeoutId)
  }, [globalSearchInput])

  const loadGlobalSearchData = useCallback(async () => {
    setGlobalSearchLoading(true)
    setGlobalSearchError("")

    try {
      const [eventsResult, participantsResult, volunteerResult] = await Promise.allSettled([
        fetchEvents(),
        fetchAllParticipants(),
        fetchVolunteerDashboard(),
      ])

      setGlobalSearchData((prev) => ({
        events: eventsResult.status === "fulfilled" && Array.isArray(eventsResult.value)
          ? eventsResult.value
          : prev.events,
        participants: participantsResult.status === "fulfilled" && Array.isArray(participantsResult.value)
          ? participantsResult.value
          : prev.participants,
        volunteers: volunteerResult.status === "fulfilled" && Array.isArray(volunteerResult.value?.volunteers)
          ? volunteerResult.value.volunteers
          : prev.volunteers,
      }))

      const failures = [
        eventsResult.status === "rejected" ? `events: ${eventsResult.reason?.message || "failed to load"}` : null,
        participantsResult.status === "rejected" ? `participants: ${participantsResult.reason?.message || "failed to load"}` : null,
        volunteerResult.status === "rejected" ? `volunteers: ${volunteerResult.reason?.message || "failed to load"}` : null,
      ].filter(Boolean)

      setGlobalSearchError(failures.length ? `Some search sources are unavailable. Showing best available results (${failures.join(", ")}).` : "")
      return failures
    } finally {
      setGlobalSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setGlobalSearchLoading(false)
      setGlobalSearchError("")
      return
    }

    const normalizedQuery = normalizeSearchText(globalSearchQuery)
    if (!normalizedQuery) {
      setGlobalSearchLoading(false)
      setGlobalSearchError("")
      return
    }

    let isCancelled = false
    loadGlobalSearchData().catch(() => {
      if (isCancelled) return
    })

    return () => {
      isCancelled = true
    }
  }, [token, globalSearchQuery, loadGlobalSearchData])

  useEffect(() => {
    writeGlobalSearchRecents(globalSearchRecents)
  }, [globalSearchRecents])

  useEffect(() => {
    writeNotificationReadIds(notificationReadIds)
  }, [notificationReadIds])

  // Hydrate + one-time reconciliation: on login, pull this user's read-state from the
  // server and union it into the local (localStorage-backed) set — read state is a
  // one-way ratchet, so a union is always correct, never lossy. Any locally-read keys
  // the server doesn't know about yet (e.g. read before this backend existed, or read
  // offline) are pushed up once so they aren't stranded on this browser. Best-effort:
  // localStorage remains fully functional as read/unread state on its own if this fails.
  useEffect(() => {
    if (!token) return undefined

    let isCancelled = false

    fetchNotificationReadState()
      .then((serverState) => {
        if (isCancelled) return

        const serverKeys = Array.isArray(serverState?.notification_keys) ? serverState.notification_keys : []
        const serverKeySet = new Set(serverKeys)

        setNotificationReadIds((current) => {
          const localOnlyKeys = current.filter((id) => !serverKeySet.has(id))
          if (localOnlyKeys.length > 0) {
            upsertNotificationReadState(localOnlyKeys).catch(() => {
              // Best-effort; these keys are already reflected in localStorage.
            })
          }

          return Array.from(new Set([...current, ...serverKeys])).slice(0, 500)
        })
      })
      .catch(() => {
        // Best-effort; localStorage remains the fully functional source of read state.
      })

    return () => {
      isCancelled = true
    }
  }, [token])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const syncRefreshInterval = () => {
      const nextInterval = readNotificationRefreshIntervalMs()
      setNotificationRefreshIntervalMs((current) => (current === nextInterval ? current : nextInterval))
    }

    const handleStorage = (event) => {
      if (!event.key) return
      if (
        event.key === NOTIFICATION_CENTER_REFRESH_INTERVAL_STORAGE_KEY
        || event.key === DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY
        || event.key === EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY
      ) {
        syncRefreshInterval()
      }
    }

    const handleWindowFocus = () => {
      syncRefreshInterval()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncRefreshInterval()
      }
    }

    const pollTimer = window.setInterval(syncRefreshInterval, 5000)

    window.addEventListener("storage", handleStorage)
    window.addEventListener("focus", handleWindowFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("focus", handleWindowFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.clearInterval(pollTimer)
    }
  }, [])

  const loadOperationalNotifications = useCallback(async () => {
    if (!token) {
      setOperationalNotifications([])
      setNotificationCenterError("")
      setNotificationCenterLoading(false)
      hasLoadedNotificationsOnceRef.current = true
      return
    }

    setNotificationCenterLoading(true)
    setNotificationCenterError("")

    try {
      const [metricsResult, messagesResult, deliveriesResult, auditResult] = await Promise.allSettled([
        fetchDashboardMetrics(12),
        fetchCommunicationMessages(),
        fetchCommunicationDeliveries(),
        fetchAdminAuditEvents({ limit: 50 }),
      ])

      const metrics = metricsResult.status === "fulfilled" ? metricsResult.value : {}
      const messages = messagesResult.status === "fulfilled" ? messagesResult.value : []
      const deliveries = deliveriesResult.status === "fulfilled" ? deliveriesResult.value : []
      const auditEvents = auditResult.status === "fulfilled" ? (auditResult.value?.items || []) : []

      setOperationalNotifications(buildOperationalNotifications({ metrics, messages, deliveries, auditEvents }))
      hasLoadedNotificationsOnceRef.current = true

      const failures = [
        metricsResult.status === "rejected" ? "telemetry" : null,
        messagesResult.status === "rejected" ? "messages" : null,
        deliveriesResult.status === "rejected" ? "deliveries" : null,
        auditResult.status === "rejected" ? "audit" : null,
      ].filter(Boolean)

      setNotificationCenterError(failures.length ? `Some notification sources are unavailable (${failures.join(", ")}).` : "")
    } finally {
      setNotificationCenterLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      setNotificationCenterOpen(false)
      setOperationalNotifications([])
      return
    }

    let isDisposed = false

    setNotificationRefreshIntervalMs(readNotificationRefreshIntervalMs())

    loadOperationalNotifications().catch(() => {
      if (isDisposed) return
    })

    const intervalId = notificationRefreshIntervalMs > 0
      ? window.setInterval(() => {
        loadOperationalNotifications().catch(() => {
          if (isDisposed) return
        })
      }, notificationRefreshIntervalMs)
      : null

    return () => {
      isDisposed = true
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [token, loadOperationalNotifications, notificationRefreshIntervalMs])

  // Live-refresh trigger: the backend pushes a lightweight { type: "audit_event" } ping
  // over the existing /ws/updates socket (same channel and message-envelope convention
  // as participant_update) whenever a notification-worthy audit event is recorded. This
  // is a best-effort nudge on top of the interval poll above, not a replacement for it —
  // if the socket is unavailable, the existing polling still delivers the notification.
  useEffect(() => {
    if (!token) return undefined

    const wsUrl = getWsBase() + "/api/ws/updates"
    let ws = null
    let reconnectTimer = null
    let isCancelled = false

    const connect = () => {
      if (isCancelled) return
      ws = new window.WebSocket(wsUrl)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "audit_event") {
            loadOperationalNotifications().catch(() => {
              // Errors are surfaced through notificationCenterError state.
            })
          }
        } catch {
          // Ignore malformed websocket payloads.
        }
      }

      ws.onclose = () => {
        if (isCancelled) return
        reconnectTimer = window.setTimeout(connect, 1000)
      }

      ws.onerror = () => {
        // Let onclose handle reconnect timing.
      }
    }

    connect()

    return () => {
      isCancelled = true
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
      }
      if (ws && (ws.readyState === window.WebSocket.OPEN || ws.readyState === window.WebSocket.CONNECTING)) {
        ws.close()
      }
    }
  }, [token, loadOperationalNotifications])

  useEffect(() => {
    const refreshBuildFingerprint = () => {
      setBuildFingerprint(getBuildFingerprint())
    }

    refreshBuildFingerprint()
    window.addEventListener("load", refreshBuildFingerprint)

    return () => {
      window.removeEventListener("load", refreshBuildFingerprint)
    }
  }, [])

  const handleSignOut = () => {
    clearAuthSession()
    setToken(null)
    setProfile(null)
    setGlobalSearchInput("")
    setGlobalSearchQuery("")
  }

  const getTitle = () => {
    switch (location.pathname) {
      case "/":
        return "Dashboard"
      case "/events":
        return "Events"
      case "/participants":
        return "Participants"
      case "/event-templates":
        return "Event Templates"
      case "/feedback":
        return "Feedback"
      case "/waiver-templates":
        return "Waiver Templates"
      case "/volunteer-dashboard":
        return "Volunteer Dashboard"
      case "/executive-dashboard":
        return "Executive Dashboard"
      case "/communications":
        return "Communications"
      default:
        if (location.pathname.startsWith("/event-templates")) {
          return "Event Templates"
        }
        if (location.pathname.startsWith("/waiver-templates")) {
          return "Waiver Templates"
        }
        if (location.pathname.startsWith("/volunteer-dashboard")) {
          return "Volunteer Dashboard"
        }
        if (location.pathname.startsWith("/executive-dashboard")) {
          return "Executive Dashboard"
        }
        if (location.pathname.startsWith("/communications")) {
          return "Communications"
        }
        return "Surfers Admin"
    }
  }

  const commandPaletteCommands = useMemo(() => {
    const navigationCommands = [
      { id: "go-dashboard", label: "Open Dashboard", description: "Go to dashboard home", group: "Navigation", to: "/" },
      { id: "go-events", label: "Open Events", description: "View and manage events", group: "Navigation", to: "/events" },
      { id: "go-participants", label: "Open Participants", description: "Manage participant roster", group: "Navigation", to: "/participants" },
      { id: "go-volunteers", label: "Open Volunteer Dashboard", description: "View volunteer operations", group: "Navigation", to: "/volunteer-dashboard" },
      { id: "go-executive", label: "Open Executive Dashboard", description: "View analytics and diagnostics", group: "Navigation", to: "/executive-dashboard" },
      { id: "go-communications", label: "Open Communications", description: "Review delivery and messages", group: "Navigation", to: "/communications" },
      { id: "go-feedback", label: "Open Feedback", description: "Review operator feedback", group: "Navigation", to: "/feedback" },
      { id: "go-waivers", label: "Open Waiver Templates", description: "Manage waiver templates", group: "Navigation", to: "/waiver-templates" },
      { id: "go-event-templates", label: "Open Event Templates", description: "Manage event templates", group: "Navigation", to: "/event-templates" },
      { id: "go-permissions", label: "Open Permissions Management", description: "Search users and manage roles", group: "Navigation", to: "/permissions" },
      { id: "go-automation", label: "Open Automation", description: "Manage workflow definitions and execution", group: "Navigation", to: "/automation" },
    ]

    const recentSearchCommands = globalSearchRecents.map((item) => ({
      id: `recent-search:${item.id}`,
      label: item.title,
      description: [item.subtitle, item.kind ? `Type: ${item.kind}` : "", item.lastUsedAt ? `Recent: ${formatSearchTime(item.lastUsedAt)}` : ""]
        .filter(Boolean)
        .join(" • "),
      group: "Recent Searches",
      to: item.to,
    }))

    const operationalCommands = [
      { id: "events-live", label: "Open Live Events", description: "View published events", group: "Operations", to: "/events?status=published&type=all" },
      { id: "exec-attention", label: "Open Executive Attention", description: "Jump to executive attention section", group: "Operations", to: "/executive-dashboard?focus=attention" },
      { id: "exec-metrics", label: "Open Executive Metrics", description: "Jump to executive metrics section", group: "Operations", to: "/executive-dashboard?focus=metrics" },
      { id: "communications-deliveries", label: "Open Communications Deliveries", description: "Jump to delivery health workflow", group: "Operations", to: "/communications?focus=deliveries" },
      { id: "new-event", label: "Create Event", description: "Start a new event", group: "Actions", to: "/events/new" },
      { id: "open-feedback-form", label: "Open Feedback Form", description: "Open beta UAT feedback form in a new tab", group: "Operations", actionKey: "open-feedback-form" },
      { id: "refresh-search-sources", label: "Refresh Search Sources", description: "Reload events, participants, and volunteer data", group: "Operations", actionKey: "refresh-search-sources" },
      { id: "refresh-page", label: "Refresh Current Page", description: "Reload the current page", group: "Operations", actionKey: "refresh-page" },
      { id: "sign-out", label: "Sign Out", description: "End your admin session", group: "Operations", actionKey: "sign-out" },
    ]

    return token
      ? [...navigationCommands, ...recentSearchCommands, ...operationalCommands]
      : []
  }, [token, globalSearchRecents])

  const openCommandPalette = useCallback(() => {
    commandPaletteReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setCommandPaletteOpen(true)
  }, [])

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false)

    const previousFocus = commandPaletteReturnFocusRef.current
    if (previousFocus && typeof previousFocus.focus === "function") {
      window.setTimeout(() => previousFocus.focus(), 0)
    }
  }, [])

  const unreadNotificationCount = useMemo(() => {
    const readSet = new Set(notificationReadIds)
    return operationalNotifications.filter((item) => !readSet.has(item.id)).length
  }, [operationalNotifications, notificationReadIds])

  const openNotificationCenter = useCallback(() => {
    setNotificationCenterOpen(true)
  }, [])

  const closeNotificationCenter = useCallback(() => {
    setNotificationCenterOpen(false)
  }, [])

  const handleMarkNotificationRead = useCallback((notificationId) => {
    if (!notificationId) return

    setNotificationReadIds((current) => {
      if (current.includes(notificationId)) return current
      return [notificationId, ...current].slice(0, 500)
    })

    upsertNotificationReadState([notificationId]).catch(() => {
      // Best-effort; localStorage already reflects the read state immediately.
    })
  }, [])

  const handleMarkAllNotificationsRead = useCallback(() => {
    const allIds = operationalNotifications.map((item) => item.id).filter(Boolean)
    setNotificationReadIds(allIds.slice(0, 500))

    if (allIds.length > 0) {
      upsertNotificationReadState(allIds).catch(() => {
        // Best-effort; localStorage already reflects the read state immediately.
      })
    }
  }, [operationalNotifications])

  useEffect(() => {
    // Guard against pruning on the initial empty operationalNotifications state (before the
    // first real fetch resolves) — without this, every mount would immediately discard all
    // read-ids (local and freshly-reconciled-from-server alike) against an empty available set.
    if (!hasLoadedNotificationsOnceRef.current) return

    const availableIds = new Set(operationalNotifications.map((item) => item.id))
    setNotificationReadIds((current) => current.filter((id) => availableIds.has(id)))
  }, [operationalNotifications])

  const handleNotificationSelect = useCallback((item) => {
    if (!item?.to) return

    handleMarkNotificationRead(item.id)
    closeNotificationCenter()
    navigate(item.to)
  }, [closeNotificationCenter, navigate, handleMarkNotificationRead])

  const handleNotificationRefreshIntervalChange = useCallback((nextValueMs) => {
    const normalized = Number(nextValueMs)
    const safeValueMs = Number.isFinite(normalized) && normalized >= 0 ? normalized : NOTIFICATION_FALLBACK_REFRESH_INTERVAL_MS

    writeNotificationRefreshIntervalMs(safeValueMs)
    setNotificationRefreshIntervalMs(safeValueMs)
  }, [])

  useEffect(() => {
    if (!token) {
      setCommandPaletteOpen(false)
      return
    }

    const onKeyDown = (event) => {
      const key = String(event.key || "").toLowerCase()
      const target = event.target
      const isEditableTarget = target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        if (event.repeat || isEditableTarget) return
        event.preventDefault()
        if (commandPaletteOpen) {
          closeCommandPalette()
        } else {
          openCommandPalette()
        }
      }

      if (key === "escape") {
        closeCommandPalette()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [token, commandPaletteOpen, openCommandPalette, closeCommandPalette])

  const searchSections = useMemo(() => buildGlobalSearchSections(globalSearchQuery, globalSearchData), [globalSearchQuery, globalSearchData])

  const handleGlobalSearchSelect = (item) => {
    if (!item?.to) return

    setGlobalSearchRecents((current) => {
      const entry = {
        id: `${item.kind || "item"}:${item.id || item.to}`,
        kind: item.kind || "search",
        title: item.title || "Search result",
        subtitle: item.subtitle || item.detail || "",
        to: item.to,
        lastUsedAt: new Date().toISOString(),
      }

      const next = [entry, ...current.filter((candidate) => candidate.id !== entry.id)]
      return next.slice(0, GLOBAL_SEARCH_RECENTS_LIMIT)
    })

    setGlobalSearchInput("")
    setGlobalSearchQuery("")
    navigate(item.to)
  }

  const handleCommandPaletteSelect = async (command) => {
    if (!command) return

    closeCommandPalette()

    try {
      if (command.actionKey === "open-feedback-form") {
        window.open("./beta-uat-feedback-form.html", "_blank")
        return
      }

      if (command.actionKey === "refresh-search-sources") {
        const failures = await loadGlobalSearchData().catch(() => ["refresh failed"])
        if (Array.isArray(failures) && failures.length > 0) {
          window.alert(`Search sources refreshed with issues: ${failures.join(", ")}`)
        }
        return
      }

      if (command.actionKey === "refresh-page") {
        window.location.reload()
        return
      }

      if (command.actionKey === "sign-out") {
        handleSignOut()
        navigate("/login", { replace: true })
        return
      }

      if (typeof command.action === "function") {
        command.action()
        return
      }

      if (command.to) {
        navigate(command.to)
      }
    } catch (error) {
      window.alert(error?.message || "Unable to execute command")
    }
  }

  // Public participant/family portal — a self-contained route tree with its
  // own layout (PortalLayout, not AppLayout), reachable with no auth token
  // and independent of the admin token/session state above. Checked before
  // the admin Routes tree below so it never interacts with the `!token`
  // redirect-to-/login catch-all or any admin-only route.
  if (location.pathname === "/portal" || location.pathname.startsWith("/portal/")) {
    return (
      <Routes>
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalHome />} />
          <Route path="events" element={<PortalEvents />} />
          <Route path="register" element={<PortalRegister />} />
          <Route path="login" element={<PortalLogin />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <>
      <AppLayout
        title={getTitle()}
        releaseTag={token ? getReleaseTag() : undefined}
        profile={token ? profile : null}
        onSignOut={handleSignOut}
        onOpenCommandPalette={token ? openCommandPalette : undefined}
        notificationCenter={token ? (
          <NotificationCenter
            isOpen={notificationCenterOpen}
            loading={notificationCenterLoading}
            error={notificationCenterError}
            notifications={operationalNotifications}
            unreadCount={unreadNotificationCount}
            readIds={notificationReadIds}
            refreshIntervalMs={notificationRefreshIntervalMs}
            onRefreshIntervalChange={handleNotificationRefreshIntervalChange}
            onToggle={() => {
              if (notificationCenterOpen) {
                closeNotificationCenter()
              } else {
                openNotificationCenter()
              }
            }}
            onClose={closeNotificationCenter}
            onRefresh={() => {
              loadOperationalNotifications().catch(() => {
                // Errors are surfaced through notificationCenterError state.
              })
            }}
            onSelect={handleNotificationSelect}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
          />
        ) : null}
        buildFingerprint={token ? buildFingerprint : undefined}
        showHeader={Boolean(token)}
        searchPanel={token ? (
          <GlobalSearch
            query={globalSearchInput}
            debouncedQuery={globalSearchQuery}
            sections={searchSections}
            loading={globalSearchLoading}
            errorMessage={globalSearchError}
            onQueryChange={setGlobalSearchInput}
            onSelect={handleGlobalSearchSelect}
          />
        ) : null}
        footer={token ? <BottomNav /> : null}
      >
        <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />

        {!token ? (
          <Route path="*" element={<Navigate to="/login" replace />} />
        ) : (
          <>
            <Route path="/" element={<Dashboard />} />

            <Route path="/events">
              <Route index element={<Events />} />
              <Route path="new" element={<CreateEvent />} />
              <Route path=":eventId" element={<EventDetail />} />
              <Route path=":eventId/checkin" element={<CheckIn />} />
              <Route path=":eventId/fast-assign" element={<FastAssign />} />
              <Route path=":eventId/edit" element={<EditEvent />} />
            </Route>

            <Route path="/participants" element={<Participants />} />
            <Route path="/event-templates" element={<EventTemplates />} />
            <Route path="/waiver-templates" element={<WaiverTemplates />} />
            <Route path="/volunteer-dashboard" element={<VolunteerDashboard />} />
            <Route path="/executive-dashboard" element={<ExecutiveDashboard />} />
            <Route path="/communications" element={<Communications />} />
            <Route path="/feedback" element={<FeedbackReview />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/permissions" element={<PermissionsManagement />} />
            <Route path="/automation" element={<AutomationManagement />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
        </Routes>
      </AppLayout>

      {token && commandPaletteOpen ? (
        <CommandPalette
          isOpen
          commands={commandPaletteCommands}
          onClose={closeCommandPalette}
          onSelectCommand={handleCommandPaletteSelect}
        />
      ) : null}
    </>
  )
}

export default App