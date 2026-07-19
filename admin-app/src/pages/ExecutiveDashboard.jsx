import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { fetchDashboardDiagnosticsReport, fetchDashboardMetrics, fetchEvents, fetchExecutiveDashboard, fetchVolunteerDashboard } from "../api/events"
import { getStoredToken } from "../api/auth"
import { StatCard } from "./Dashboard"

const EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY = "sfa.executiveDashboardRefreshIntervalMs"
const EXECUTIVE_DASHBOARD_REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "15 seconds", value: 15000 },
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "5 minutes", value: 300000 },
]
const DEFAULT_EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_MS = 30000

function formatCardValue(metricKey, value) {
  if (typeof value === "number") {
    if (metricKey.endsWith("_percentage")) {
      return `${value.toFixed(2)}%`
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  return String(value)
}

function formatCalculatedAt(value) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "-"
  return parsed.toLocaleString()
}

function formatRefreshIntervalLabel(value) {
  const interval = Number(value) || 0

  if (interval <= 0) {
    return "auto-refresh is off"
  }

  if (interval < 60000) {
    return `refreshes every ${Math.round(interval / 1000)} seconds`
  }

  return `refreshes every ${Math.round(interval / 60000)} minute${interval >= 120000 ? "s" : ""}`
}

function formatDateKey(value) {
  if (!value) return ""

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(parsed)
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

function sumNumeric(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0)
}

function cardTone(metricKey, notTracked) {
  if (notTracked) return "border-slate-300 bg-slate-50"
  if (metricKey.includes("action_required") || metricKey.includes("pending")) return "border-red-200 bg-red-50"
  if (metricKey.includes("checked_in") || metricKey.includes("ready") || metricKey.includes("verified")) return "border-green-200 bg-green-50"
  if (metricKey.includes("incomplete") || metricKey.includes("not_checked_in")) return "border-amber-200 bg-amber-50"
  return "border-blue-200 bg-blue-50"
}

function activityTone(status) {
  const normalized = String(status || "").trim().toLowerCase()

  if (normalized.includes("fail") || normalized.includes("error")) {
    return "border-red-200 bg-red-50 text-red-800"
  }

  if (normalized.includes("warn") || normalized.includes("retry") || normalized.includes("defer")) {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }

  return "border-slate-200 bg-slate-100 text-slate-700"
}

function stringifyPayload(payload) {
  if (!payload || typeof payload !== "object") return ""

  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return ""
  }
}

function formatRefreshStatus({ loading, isRefreshing, error, activityError, diagnosticsError }) {
  if (loading) {
    return { label: "Loading dashboard", tone: "border-blue-200 bg-blue-50 text-blue-800" }
  }

  if (isRefreshing) {
    return { label: "Refreshing in background", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" }
  }

  if (error || activityError || diagnosticsError) {
    return { label: "Live with warnings", tone: "border-amber-200 bg-amber-50 text-amber-800" }
  }

  return { label: "Live", tone: "border-green-200 bg-green-50 text-green-800" }
}

function attentionTone(severity) {
  const normalized = String(severity || "").trim().toLowerCase()

  if (normalized === "critical") {
    return "border-red-200 bg-red-50 text-red-800"
  }

  if (normalized === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }

  return "border-sky-200 bg-sky-50 text-sky-800"
}

function attentionWorkflowForItem(item) {
  const buildExecutivePath = (focus, extraParams = {}) => {
    const params = new URLSearchParams({ focus, ...extraParams })
    return `/executive-dashboard?${params.toString()}`
  }

  if (item.source === "activity") {
    const category = String(item.category || "").trim().toLowerCase()
    const eventType = String(item.eventType || "").trim().toLowerCase()

    if (category.includes("delivery") || category.includes("provider") || eventType.includes("delivery") || eventType.includes("provider")) {
      return { to: "/communications", label: "Review delivery activity" }
    }

    if (category.includes("execution") || eventType.includes("execution") || eventType.includes("retry") || eventType.includes("queue")) {
      return { to: buildExecutivePath("recent-activity", { status: "retry,error,failed" }), label: "Inspect execution timeline" }
    }

    return { to: buildExecutivePath("recent-activity"), label: "Inspect activity detail" }
  }

  const code = String(item.code || "").trim().toLowerCase()

  if (code === "no_telemetry" || code === "no_recent_activity") {
    return { to: "/feedback", label: "Check telemetry signals" }
  }

  if (code === "failures_present") {
    return { to: "/communications", label: "Investigate delivery failures" }
  }

  if (code === "no_metric_sources" || code === "no_widgets") {
    return { to: buildExecutivePath("metrics"), label: "Review metric source coverage" }
  }

  return { to: buildExecutivePath("attention"), label: "Open diagnostics detail" }
}

function ExecutiveDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [events, setEvents] = useState([])
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_MS
    }

    const storedValue = Number(window.localStorage.getItem(EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY))
    const supportedOption = EXECUTIVE_DASHBOARD_REFRESH_OPTIONS.find((option) => option.value === storedValue)
    return supportedOption ? supportedOption.value : DEFAULT_EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_MS
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const [recentActivity, setRecentActivity] = useState([])
  const [activityError, setActivityError] = useState("")
  const [diagnosticsReport, setDiagnosticsReport] = useState(null)
  const [diagnosticsError, setDiagnosticsError] = useState("")
  const [volunteerDashboard, setVolunteerDashboard] = useState(null)
  const [volunteerDashboardError, setVolunteerDashboardError] = useState("")
  const [activeEvent, setActiveEvent] = useState(null)
  const [activeEventError, setActiveEventError] = useState("")

  const isMountedRef = useRef(false)
  const refreshInFlightRef = useRef(false)
  const refreshTimerRef = useRef(null)
  const attentionSectionRef = useRef(null)
  const metricsSectionRef = useRef(null)
  const recentActivitySectionRef = useRef(null)

  const loadDashboard = useCallback(async ({ showLoading = false } = {}) => {
    const token = getStoredToken()
    if (!token) {
      setLoading(false)
      setIsRefreshing(false)
      setError("Please sign in again to load the executive dashboard.")
      setVolunteerDashboardError("Please sign in again to load the executive dashboard.")
      return false
    }

    if (refreshInFlightRef.current) {
      return false
    }

    refreshInFlightRef.current = true
    if (showLoading) {
      setLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const [analyticsResult, metricsResult, diagnosticsResult, eventsResult, volunteerResult] = await Promise.allSettled([
        fetchExecutiveDashboard(),
        fetchDashboardMetrics(),
        fetchDashboardDiagnosticsReport(),
        fetchEvents(),
        fetchVolunteerDashboard(),
      ])

      if (!isMountedRef.current) {
        return false
      }

      if (analyticsResult.status === "fulfilled") {
        setPayload(analyticsResult.value)
        setError("")
      } else {
        setError(analyticsResult.reason?.message || "Failed to load executive dashboard")
      }

      if (metricsResult.status === "fulfilled") {
        const orderedActivity = [...(metricsResult.value?.recent_activity || [])].sort(
          (left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime(),
        )
        setRecentActivity(orderedActivity)
        setActivityError("")
      } else {
        setRecentActivity([])
        setActivityError(metricsResult.reason?.message || "Failed to load recent activity")
      }

      if (diagnosticsResult.status === "fulfilled") {
        setDiagnosticsReport(diagnosticsResult.value)
        setDiagnosticsError("")
      } else {
        setDiagnosticsReport(null)
        setDiagnosticsError(diagnosticsResult.reason?.message || "Failed to load dashboard diagnostics")
      }

      if (eventsResult?.status === "fulfilled") {
        const events = Array.isArray(eventsResult.value) ? eventsResult.value : []
        setEvents(events)
        const publishedEvents = events.filter((candidate) => candidate.status?.toLowerCase() === "published")
        setActiveEvent(publishedEvents[0] || events[0] || null)
        setActiveEventError("")
      } else {
        setEvents([])
        setActiveEvent(null)
        setActiveEventError(eventsResult?.reason?.message || "Failed to load active event")
      }

      if (volunteerResult?.status === "fulfilled") {
        setVolunteerDashboard(volunteerResult.value)
        setVolunteerDashboardError("")
      } else {
        setVolunteerDashboard(null)
        setVolunteerDashboardError(volunteerResult?.reason?.message || "Failed to load volunteer dashboard")
      }

      setLastRefreshedAt(new Date())
      return analyticsResult.status === "fulfilled" && metricsResult.status === "fulfilled" && diagnosticsResult.status === "fulfilled" && eventsResult?.status === "fulfilled"
    } catch (loadError) {
      if (isMountedRef.current) {
        setError(loadError?.message || "Failed to load executive dashboard")
      }
      return false
    } finally {
      refreshInFlightRef.current = false
      if (isMountedRef.current) {
        if (showLoading) {
          setLoading(false)
        } else {
          setIsRefreshing(false)
        }
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void loadDashboard({ showLoading: true })

    return () => {
      isMountedRef.current = false
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [loadDashboard])

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        EXECUTIVE_DASHBOARD_REFRESH_INTERVAL_STORAGE_KEY,
        String(refreshIntervalMs),
      )
    }
  }, [refreshIntervalMs])

  useEffect(() => {
    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current)
      refreshTimerRef.current = null
    }

    if (!refreshIntervalMs || refreshIntervalMs <= 0) {
      return undefined
    }

    refreshTimerRef.current = window.setInterval(() => {
      void loadDashboard({ showLoading: false })
    }, refreshIntervalMs)

    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [loadDashboard, refreshIntervalMs])

  const cards = useMemo(() => payload?.cards || [], [payload])
  const filteredCards = useMemo(() => {
    const term = String(search || "").trim().toLowerCase()
    if (!term) return cards

    return cards.filter((card) => {
      return [card.metric_key, card.label, card.data_source, String(card.value)]
        .join(" ")
        .toLowerCase()
        .includes(term)
    })
  }, [cards, search])

  const sortedRecentActivity = useMemo(() => recentActivity, [recentActivity])
  const refreshStatus = formatRefreshStatus({ loading, isRefreshing, error, activityError, diagnosticsError })
  const lastUpdatedLabel = lastRefreshedAt ? formatCalculatedAt(lastRefreshedAt.toISOString()) : "Never"

  const attentionItems = useMemo(() => {
    const findings = diagnosticsReport?.findings || []
    const activityItems = sortedRecentActivity
      .filter((activity) => {
        const status = String(activity.status || "").trim().toLowerCase()
        return status.includes("fail") || status.includes("error") || status.includes("warn") || status.includes("retry") || status.includes("defer")
      })
      .map((activity) => ({
        key: `activity-${activity.event_id}`,
        code: activity.event_type,
        title: activity.event_type,
        description: activity.status,
        summary: [activity.category, activity.provider_name, activity.channel].filter(Boolean).join(" · ") || "Recent operational event",
        severity: activityTone(activity.status).includes("red") ? "critical" : "warning",
        source: "activity",
        category: activity.category,
        eventType: activity.event_type,
      }))

    const diagnosticItems = findings.map((finding) => ({
      key: `finding-${finding.code}`,
      code: finding.code,
      title: finding.code.replace(/[_-]/g, " "),
      description: finding.message,
      summary: Object.entries(finding.details || {})
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · ") || "Dashboard diagnostics finding",
      severity: finding.severity,
      source: "diagnostics",
      details: Object.entries(finding.details || {})
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · "),
    }))

    return [...diagnosticItems, ...activityItems]
  }, [diagnosticsReport, sortedRecentActivity])

  const attentionSummary = diagnosticsReport?.health_summary || null
  const attentionBuckets = useMemo(() => {
    return attentionItems.reduce((groups, item) => {
      const severity = String(item.severity || "info").trim().toLowerCase()
      if (!groups[severity]) {
        groups[severity] = []
      }
      groups[severity].push(item)
      return groups
    }, {})
  }, [attentionItems])

  const attentionSeveritySummary = useMemo(() => {
    const order = ["critical", "warning", "info"]
    return order.map((severity) => ({
      severity,
      count: attentionBuckets[severity]?.length || 0,
    }))
  }, [attentionBuckets])

  const attentionSections = [
    { severity: "critical", label: "Critical", tone: "border-red-200 bg-red-50 text-red-800" },
    { severity: "warning", label: "Warnings", tone: "border-amber-200 bg-amber-50 text-amber-800" },
    { severity: "info", label: "Info", tone: "border-sky-200 bg-sky-50 text-sky-800" },
  ]

  const todayKey = formatDateKey(new Date())
  const todayEvent = useMemo(() => {
    const todaysEvents = events.filter((event) => formatDateKey(event.start_date) === todayKey)
    return todaysEvents.find((event) => event.status?.toLowerCase() === "published") || todaysEvents[0] || null
  }, [events, todayKey])

  const todayVolunteerRows = useMemo(() => {
    const volunteers = Array.isArray(volunteerDashboard?.volunteers) ? volunteerDashboard.volunteers : []
    if (!todayEvent) return []
    return volunteers.filter((volunteer) => String(volunteer.event_id) === String(todayEvent.id))
  }, [todayEvent, volunteerDashboard])

  const todayParticipantCapacity = todayEvent?.capacity?.participants ?? todayEvent?.participant_capacity ?? null
  const todayConfirmedParticipants = Number(todayEvent?.participant_count) || 0
  const todayCheckedInParticipants = Number(todayEvent?.checked_in_count) || 0
  const todayWaitlistedParticipants = Number(todayEvent?.waitlist_count) || 0
  const todayParticipantFillPercent = todayParticipantCapacity
    ? clampPercent((todayConfirmedParticipants / todayParticipantCapacity) * 100)
    : 0
  const todayCheckInPercent = todayConfirmedParticipants > 0
    ? clampPercent((todayCheckedInParticipants / todayConfirmedParticipants) * 100)
    : 0

  const todayVolunteerSummary = useMemo(() => {
    const readiness = todayVolunteerRows.reduce(
      (counts, volunteer) => {
        const status = String(volunteer.computed_status || "").trim().toLowerCase()

        if (status === "ready") counts.ready += 1
        if (status === "checked_in") counts.checked_in += 1
        if (status === "incomplete") counts.incomplete += 1
        if (status === "action_required") counts.action_required += 1

        return counts
      },
      { total_volunteers: todayVolunteerRows.length, ready: 0, checked_in: 0, incomplete: 0, action_required: 0 },
    )

    return readiness
  }, [todayVolunteerRows])
  const todayAssignedVolunteers = todayVolunteerRows.filter((volunteer) => volunteer.session_id).length
  const todayUnassignedVolunteers = Math.max(todayVolunteerRows.length - todayAssignedVolunteers, 0)

  const todaySessions = Array.isArray(todayEvent?.sessions) ? todayEvent.sessions : []
  const todaySessionCapacity = sumNumeric(todaySessions.map((session) => session.capacity))
  const todaySessionParticipants = sumNumeric(todaySessions.map((session) => session.participant_count))
  const todaySessionUtilizationPercent = todaySessionCapacity > 0
    ? clampPercent((todaySessionParticipants / todaySessionCapacity) * 100)
    : 0
  const todayFullSessions = todaySessions.filter((session) => Number(session.capacity) > 0 && Number(session.participant_count) >= Number(session.capacity)).length

  function openAttentionWorkflow(item) {
    const workflow = attentionWorkflowForItem(item)
    navigate(workflow.to)
  }

  const quickActions = [
    {
      label: "Events",
      description: "Review the current event list and operational state.",
      to: "/events",
      tone: "border-ocean-200 bg-ocean-50 text-ocean-900",
    },
    {
      label: "Create Event",
      description: "Launch a new event from the admin workflow.",
      to: "/events/new",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    },
    {
      label: "Participants",
      description: "Open the participant roster and record actions.",
      to: "/participants",
      tone: "border-indigo-200 bg-indigo-50 text-indigo-900",
    },
    {
      label: "Check-In",
      description: activeEvent
        ? `Jump into check-in for ${activeEvent.title || "the active event"}.`
        : "No active event is available for check-in right now.",
      to: activeEvent ? `/events/${activeEvent.id}/checkin` : null,
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      disabled: !activeEvent,
      hidden: false,
    },
    {
      label: "Communications",
      description: "Compose and send operational messages.",
      to: "/communications",
      tone: "border-violet-200 bg-violet-50 text-violet-900",
    },
    {
      label: "Waiver Templates",
      description: "Manage the current waiver template set.",
      to: "/waiver-templates",
      tone: "border-cyan-200 bg-cyan-50 text-cyan-900",
    },
    {
      label: "Volunteer Dashboard",
      description: "View the operational volunteer readiness projection.",
      to: "/volunteer-dashboard",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    },
    {
      label: "Feedback Review",
      description: "Inspect feedback and release-loop signals.",
      to: "/feedback",
      tone: "border-rose-200 bg-rose-50 text-rose-900",
    },
  ]

  useEffect(() => {
    const focus = String(searchParams.get("focus") || "").trim().toLowerCase()
    if (!focus) return

    const focusTargets = {
      attention: attentionSectionRef.current,
      metrics: metricsSectionRef.current,
      "recent-activity": recentActivitySectionRef.current,
    }

    const target = focusTargets[focus]
    if (target && typeof target.scrollIntoView === "function") {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }, [searchParams])

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Executive Analytics Dashboard</h2>
            <p className="mt-1 text-sm text-secondary">
              Read-only analytics projection computed from canonical domain data. Metrics are eventually consistent and non-transactional.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-1 font-semibold ${refreshStatus.tone}`}>
                {refreshStatus.label}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
                Last updated: {lastUpdatedLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              Auto-refresh
              <select
                value={refreshIntervalMs}
                onChange={(event) => setRefreshIntervalMs(Number(event.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {EXECUTIVE_DASHBOARD_REFRESH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadDashboard({ showLoading: false })}
              disabled={loading || isRefreshing}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            Dashboard metrics could not be refreshed: {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Quick Actions</h3>
            <p className="text-xs text-secondary">
              Shortcuts to the primary operational workflows used from the dashboard.
            </p>
          </div>
          <p className="text-xs text-secondary">Fast access to day-to-day execution paths</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {quickActions
            .filter((action) => !action.hidden)
            .map((action) => {
              const isDisabled = Boolean(action.disabled || !action.to)

              return (
                <button
                  key={`${action.label}-${action.to || "disabled"}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (!action.to) return
                    navigate(action.to)
                  }}
                  aria-label={isDisabled ? `${action.label} unavailable` : `Open ${action.label}`}
                  className={`flex h-full min-h-36 flex-col justify-between rounded-2xl border p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean focus-visible:ring-offset-2 ${
                    isDisabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 opacity-70"
                      : `hover:-translate-y-0.5 hover:shadow-md ${action.tone}`
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">{action.label}</p>
                    <p className="mt-1 text-xs leading-5 opacity-90">{action.description}</p>
                  </div>
                  <span className="mt-3 inline-flex w-fit rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {isDisabled ? "Unavailable" : `Open ${action.to}`}
                  </span>
                </button>
              )
            })}
        </div>

        {activeEventError ? (
          <p className="mt-3 text-xs text-amber-700">
            Check-In is unavailable until an active event is loaded. {activeEventError}
          </p>
        ) : !activeEvent ? (
          <p className="mt-3 text-xs text-secondary">
            Check-In is disabled until an active event is available.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Today Overview</h3>
            <p className="text-xs text-secondary">
              Summarizes today&apos;s event, participant progress, volunteer assignments, and session utilization from the current dashboard services.
            </p>
          </div>
          <p className="text-xs text-secondary">Updates on the same refresh cycle as the dashboard</p>
        </div>

        {volunteerDashboardError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Volunteer assignment details are partially unavailable: {volunteerDashboardError}
          </div>
        ) : null}

        {!todayEvent ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-700">
            <p className="font-semibold">No active event is scheduled for today.</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              The overview will populate automatically when a live event appears and the dashboard refreshes on its normal cadence: {formatRefreshIntervalLabel(refreshIntervalMs)}.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Today&apos;s Event"
                value={todayEvent.title}
                color="text-gray-900"
                labelColor="text-slate-600"
                cardClass="bg-slate-50 border border-slate-200"
              />
              <StatCard
                label="Participant Progress"
                value={`${todayConfirmedParticipants}/${todayParticipantCapacity || "-"}`}
                color="text-blue-900"
                labelColor="text-blue-700"
                cardClass="bg-blue-50 border border-blue-200"
              />
              <StatCard
                label="Volunteer Assignments"
                value={todayVolunteerSummary?.total_volunteers ?? todayVolunteerRows.length}
                color="text-emerald-900"
                labelColor="text-emerald-700"
                cardClass="bg-emerald-50 border border-emerald-200"
              />
              <StatCard
                label="Session Utilization"
                value={`${todaySessionUtilizationPercent.toFixed(0)}%`}
                color="text-amber-900"
                labelColor="text-amber-700"
                cardClass="bg-amber-50 border border-amber-200"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Participant & Volunteer Progress</h4>
                    <p className="text-xs text-secondary">Compact progress indicators for today.</p>
                  </div>
                  <span className="text-xs text-secondary">{todayVolunteerRows.length} volunteers</span>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Participants</span>
                      <span>{todayConfirmedParticipants}/{todayParticipantCapacity || "-"} confirmed · {todayCheckedInParticipants} checked in · {todayWaitlistedParticipants} waitlisted</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${todayParticipantFillPercent}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-secondary">{todayCheckInPercent.toFixed(0)}% check-in rate</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Volunteer readiness</span>
                      <span>{todayAssignedVolunteers} assigned · {todayUnassignedVolunteers} unassigned</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${clampPercent((todayAssignedVolunteers / Math.max(todayVolunteerRows.length, 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-secondary">{(todayVolunteerSummary?.action_required ?? 0) + (todayVolunteerSummary?.incomplete ?? 0)} need attention</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Sessions utilized</span>
                      <span>{todaySessionParticipants}/{todaySessionCapacity || "-"} seats filled</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${todaySessionUtilizationPercent}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Session Snapshot</h4>
                    <p className="text-xs text-secondary">Fast readout by session.</p>
                  </div>
                  <span className="text-xs text-secondary">{todayFullSessions} full</span>
                </div>

                <div className="mt-3 space-y-2">
                  {todaySessions.length > 0 ? todaySessions.slice(0, 4).map((session) => {
                    const capacity = Number(session.capacity) || 0
                    const count = Number(session.participant_count) || 0
                    const utilization = capacity > 0 ? clampPercent((count / capacity) * 100) : 0

                    return (
                      <div key={session.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <p className="font-semibold text-gray-900">{session.name}</p>
                          <p className="text-xs text-secondary">{count}/{capacity || "-"}</p>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-white overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${utilization}%` }} />
                        </div>
                      </div>
                    )
                  }) : (
                    <p className="text-sm text-secondary">No sessions are configured for today&apos;s event.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section ref={attentionSectionRef} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-amber-950">Attention</h3>
            <p className="text-xs text-amber-900/80">
              Operational items needing administrator follow-up, based on dashboard diagnostics and recent activity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {attentionSummary ? (
              <>
                <span className={`rounded-full border px-2 py-1 font-semibold ${attentionTone(attentionSummary.overall_status === "healthy" ? "info" : attentionSummary.overall_status === "degraded" ? "warning" : "critical")}`}>
                  {String(attentionSummary.overall_status || "unknown").replace(/_/g, " ")}
                </span>
                <span className="rounded-full border border-amber-200 bg-white px-2 py-1 font-semibold text-amber-900">
                  {attentionSummary.failure_count} failures
                </span>
                <span className="rounded-full border border-amber-200 bg-white px-2 py-1 font-semibold text-amber-900">
                  {attentionSummary.warning_count} warnings
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {attentionSeveritySummary.map((bucket) => (
            <div key={bucket.severity} className={`rounded-xl border p-3 ${attentionTone(bucket.severity)}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">{bucket.severity}</p>
              <p className="mt-1 text-2xl font-bold">{bucket.count}</p>
              <p className="mt-1 text-xs leading-5 opacity-90">
                {bucket.severity === "critical"
                  ? "Immediate administrator action needed."
                  : bucket.severity === "warning"
                    ? "Review soon to avoid operational drift."
                    : "Monitor and confirm expected behavior."}
              </p>
            </div>
          ))}
        </div>

        {diagnosticsError ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm text-amber-800">
            Attention panel is partially unavailable: {diagnosticsError}
          </div>
        ) : null}

        {!diagnosticsError && attentionItems.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-white/80 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">No current attention items.</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">
              The dashboard services are reporting a clean operational state, and this panel will update automatically whenever the main dashboard refreshes. Current cadence: {formatRefreshIntervalLabel(refreshIntervalMs)}.
            </p>
          </div>
        ) : null}

        {attentionItems.length > 0 ? (
          <div className="mt-4 space-y-4">
            {attentionSections.map((section) => {
              const items = (attentionBuckets[section.severity] || []).slice(0, 3)

              if (items.length === 0) return null

              return (
                <div key={section.severity} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${section.tone}`}>
                      {section.label}
                    </div>
                    <p className="text-xs text-amber-900/80">
                      {items.length} item{items.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => {
                      const workflow = attentionWorkflowForItem(item)

                      return (
                        <article key={item.key} className={`rounded-xl border p-4 shadow-sm ${attentionTone(item.severity)}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                                {item.source === "activity" ? "Recent Activity" : "Diagnostics"}
                              </p>
                              <h4 className="mt-1 text-sm font-semibold">{item.title}</h4>
                            </div>
                            <span className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                              {String(item.severity || "info")}
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-5">{item.summary || item.description}</p>
                          <p className="mt-1 text-xs font-medium opacity-80">{item.description}</p>

                          <button
                            type="button"
                            onClick={() => openAttentionWorkflow(item)}
                            className="mt-3 rounded-full border border-current bg-white/80 px-3 py-1 text-xs font-semibold transition hover:bg-white"
                          >
                            {workflow.label}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <section ref={metricsSectionRef} className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Metrics</h3>
            <p className="text-xs text-secondary">Calculated at: {formatCalculatedAt(payload?.generated_at)}</p>
            {loading ? <p className="mt-1 text-xs font-medium text-blue-700">Loading metrics in the background...</p> : null}
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter metrics"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-64"
          />
        </div>

        {!loading && filteredCards.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">No metrics match the current filter.</p>
        ) : null}

        {!loading && filteredCards.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((card) => (
              <article key={card.metric_key} className={`rounded-xl border p-4 ${cardTone(card.metric_key, card.not_tracked)}`}>
                <p className="text-xs uppercase tracking-wide text-slate-600">{card.metric_key}</p>
                <h4 className="mt-1 text-sm font-semibold text-gray-900">{card.label}</h4>
                <p className="mt-2 text-2xl font-bold text-gray-900">{formatCardValue(card.metric_key, card.value)}</p>
                <p className="mt-2 text-xs text-slate-600">Calculated: {formatCalculatedAt(card.calculated_at)}</p>
                <p className="mt-1 text-xs text-slate-600">Source: {card.data_source}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section ref={recentActivitySectionRef} className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Recent Activity</h3>
            <p className="text-xs text-secondary">
              Latest telemetry and operational events from the dashboard service, newest first.
            </p>
            {loading ? <p className="mt-1 text-xs font-medium text-blue-700">Loading recent activity in the background...</p> : null}
          </div>
          <p className="text-xs text-secondary">Updated with the same auto-refresh cycle</p>
        </div>

        {activityError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {activityError}
          </div>
        ) : null}

        {!loading && sortedRecentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">No recent activity available yet.</p>
        ) : null}

        {!loading && sortedRecentActivity.length > 0 ? (
          <div className="mt-4 space-y-3">
            {sortedRecentActivity.map((activity) => {
              const payloadPreview = stringifyPayload(activity.payload)

              return (
                <article key={activity.event_id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{activity.event_type}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatCalculatedAt(activity.occurred_at?.toISOString?.() ? activity.occurred_at.toISOString() : activity.occurred_at)}
                        {activity.category ? ` · ${activity.category}` : ""}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${activityTone(activity.status)}`}>
                      {activity.status}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    {activity.execution_id ? <p>Execution: {activity.execution_id}</p> : null}
                    {activity.reminder_id ? <p>Reminder: {activity.reminder_id}</p> : null}
                    {activity.provider_name ? <p>Provider: {activity.provider_name}</p> : null}
                    {activity.channel ? <p>Channel: {activity.channel}</p> : null}
                  </div>

                  {payloadPreview ? (
                    <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Event Payload
                      </summary>
                      <pre className="mt-2 overflow-x-auto text-xs leading-5 text-slate-700">{payloadPreview}</pre>
                    </details>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default ExecutiveDashboard
