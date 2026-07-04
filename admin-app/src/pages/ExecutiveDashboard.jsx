import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { fetchDashboardMetrics, fetchEvents, fetchExecutiveDashboard } from "../api/events"

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

function formatRefreshStatus({ loading, isRefreshing, error, activityError }) {
  if (loading) {
    return { label: "Loading dashboard", tone: "border-blue-200 bg-blue-50 text-blue-800" }
  }

  if (isRefreshing) {
    return { label: "Refreshing in background", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" }
  }

  if (error || activityError) {
    return { label: "Live with warnings", tone: "border-amber-200 bg-amber-50 text-amber-800" }
  }

  return { label: "Live", tone: "border-green-200 bg-green-50 text-green-800" }
}

function ExecutiveDashboard() {
  const navigate = useNavigate()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
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
  const [activeEvent, setActiveEvent] = useState(null)
  const [activeEventError, setActiveEventError] = useState("")

  const isMountedRef = useRef(false)
  const refreshInFlightRef = useRef(false)
  const refreshTimerRef = useRef(null)

  const loadDashboard = useCallback(async ({ showLoading = false } = {}) => {
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
      const [analyticsResult, metricsResult, eventsResult] = await Promise.allSettled([
        fetchExecutiveDashboard(),
        fetchDashboardMetrics(),
        fetchEvents(),
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

      if (eventsResult?.status === "fulfilled") {
        const events = Array.isArray(eventsResult.value) ? eventsResult.value : []
        const publishedEvents = events.filter((candidate) => candidate.status?.toLowerCase() === "published")
        setActiveEvent(publishedEvents[0] || events[0] || null)
        setActiveEventError("")
      } else {
        setActiveEvent(null)
        setActiveEventError(eventsResult?.reason?.message || "Failed to load active event")
      }

      setLastRefreshedAt(new Date())
      return analyticsResult.status === "fulfilled" && metricsResult.status === "fulfilled" && eventsResult?.status === "fulfilled"
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
  const refreshStatus = formatRefreshStatus({ loading, isRefreshing, error, activityError })
  const lastUpdatedLabel = lastRefreshedAt ? formatCalculatedAt(lastRefreshedAt.toISOString()) : "Never"
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

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
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
