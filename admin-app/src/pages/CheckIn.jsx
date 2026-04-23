import { useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { fetchEventParticipants, checkInParticipant } from "../api/events"

const CHECKIN_QUEUE_KEY = "sfa.offline.checkin.queue"
const EVENT_MODE_KEY = "sfa.event.mode"
const DEBUG_SHEET_PATH = "/event-day-troubleshooting-sheet.html"
const OPERATOR_SHEET_PATH = "/event-day-operator-sheet.html"
const SIMULATED_OFFLINE_MESSAGE = "Dev-only simulated offline mode is enabled."
const PRIORITY_LEVELS = [
  { value: 1, label: "High", dotClass: "bg-red-500" },
  { value: 2, label: "Medium", dotClass: "bg-amber-400" },
  { value: 3, label: "Low", dotClass: "bg-gray-500" },
  { value: 0, label: "Unset", dotClass: "bg-gray-300" },
]

function formatDebugTime(value) {
  if (!value) return "Not yet"

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatAge(value, nowMs) {
  if (!value) return "Not yet"

  const seconds = Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function getDebugTone(status) {
  switch (status) {
    case "success":
    case "open":
      return "bg-green-100 text-green-700 border-green-200"
    case "running":
    case "connecting":
      return "bg-blue-100 text-blue-700 border-blue-200"
    case "partial":
    case "warning":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "error":
    case "closed":
      return "bg-red-100 text-red-700 border-red-200"
    default:
      return "bg-gray-100 text-gray-700 border-gray-200"
  }
}

function DevStatusPill({ label, status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${getDebugTone(status)}`}>
      {label}
    </span>
  )
}

function DevCheckInPanel({
  isOnline,
  browserOnline,
  apiBase,
  wsUrl,
  queueCount,
  queuePreview,
  isFlushingQueue,
  refreshStatus,
  refreshSource,
  refreshAt,
  refreshAge,
  refreshDetail,
  queueStatus,
  queueSource,
  queueAt,
  queueDetail,
  wsStatus,
  wsAt,
  wsDetail,
  lastCheckInEvent,
  healthState,
  forceOffline,
  setForceOffline,
  pauseRealtime,
  setPauseRealtime,
  slowRefresh,
  setSlowRefresh,
  triggerReconnect,
  clearDevScenarios,
  onCopySnapshot,
  copySnapshotStatus,
}) {
  const refreshSourceStatus = refreshSource === "polling-fallback" ? "warning" : "success"

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-slate-800 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Dev Diagnostics</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">
            Visible only in development. Use this panel to interpret offline queueing, refresh timing, and websocket reconnect behavior while testing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={DEBUG_SHEET_PATH}
            download="sfa-event-day-troubleshooting-sheet.html"
            className="inline-flex items-center rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            Download troubleshooting sheet
          </a>
          <a
            href={OPERATOR_SHEET_PATH}
            download="sfa-event-day-operator-sheet.html"
            className="inline-flex items-center rounded-lg border border-sky-300 bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800"
          >
            Download operator sheet
          </a>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-sky-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Force-test scenarios</h3>
            <p className="mt-1 text-xs text-slate-600">
              Development only. These toggles simulate failure modes without changing production behavior.
            </p>
          </div>
          <button
            type="button"
            onClick={clearDevScenarios}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Clear all scenarios
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopySnapshot}
            className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold transition ${copySnapshotStatus === "success" ? "border-green-300 bg-green-100 text-green-800" : copySnapshotStatus === "error" ? "border-red-300 bg-red-100 text-red-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {copySnapshotStatus === "success" ? "Snapshot copied" : copySnapshotStatus === "error" ? "Copy failed" : "Copy diagnostics snapshot"}
          </button>
          <button
            type="button"
            onClick={() => setForceOffline((current) => !current)}
            className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold transition ${forceOffline ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {forceOffline ? "Disable" : "Enable"} simulated offline
          </button>
          <button
            type="button"
            onClick={() => setPauseRealtime((current) => !current)}
            className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold transition ${pauseRealtime ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {pauseRealtime ? "Resume" : "Pause"} realtime websocket
          </button>
          <button
            type="button"
            onClick={() => setSlowRefresh((current) => !current)}
            className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold transition ${slowRefresh ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {slowRefresh ? "Disable" : "Enable"} slow refresh
          </button>
          <button
            type="button"
            onClick={triggerReconnect}
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Trigger reconnect
          </button>
        </div>

        <dl className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <dt className="font-semibold text-slate-800">Simulated offline</dt>
            <dd className="mt-1">Queues check-ins and makes refresh attempts fail locally even if the device still has internet.</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <dt className="font-semibold text-slate-800">Pause realtime websocket</dt>
            <dd className="mt-1">Stops live websocket updates so you can see polling fallback and stale-screen behavior.</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <dt className="font-semibold text-slate-800">Slow refresh</dt>
            <dd className="mt-1">Adds a short delay before participant refresh to mimic slow network responses.</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-sky-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Network</h3>
            <DevStatusPill label={isOnline ? "Online" : "Offline"} status={isOnline ? "success" : "error"} />
          </div>
          <dl className="mt-3 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <dt>Browser online</dt>
              <dd>
                <DevStatusPill label={browserOnline ? "Online" : "Offline"} status={browserOnline ? "success" : "error"} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Pending queue</dt>
              <dd className="font-medium text-slate-900">{queueCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Queue preview</dt>
              {queuePreview.length > 0 ? (
                <dd className="mt-1 text-slate-600">
                  <ul className="space-y-1">
                    {queuePreview.map((item) => (
                      <li key={item.id} className="truncate">- {item.name} ({item.id})</li>
                    ))}
                  </ul>
                </dd>
              ) : (
                <dd className="mt-1 text-slate-600">Queue is empty.</dd>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Queue flush</dt>
              <dd>
                <DevStatusPill label={isFlushingQueue ? "Running" : "Idle"} status={isFlushingQueue ? "running" : "idle"} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Health mode</dt>
              <dd>
                <DevStatusPill label={healthState.label} status={healthState.status} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">API base</dt>
              <dd className="mt-1 break-all text-slate-600">{apiBase}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-sky-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Participant refresh</h3>
            <DevStatusPill label={refreshStatus} status={refreshStatus} />
          </div>
          <dl className="mt-3 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <dt>Source</dt>
              <dd>
                <DevStatusPill label={refreshSource} status={refreshSourceStatus} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Updated</dt>
              <dd className="font-medium text-slate-900">{formatDebugTime(refreshAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Last sync age</dt>
              <dd className="font-medium text-slate-900">{refreshAge}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Detail</dt>
              <dd className="mt-1 text-slate-600">{refreshDetail}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-sky-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Queue + realtime</h3>
            <DevStatusPill label={wsStatus} status={wsStatus} />
          </div>
          <dl className="mt-3 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <dt>Queue source</dt>
              <dd className="font-medium text-slate-900">{queueSource}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Queue update</dt>
              <dd className="font-medium text-slate-900">{formatDebugTime(queueAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Queue detail</dt>
              <dd className="mt-1 text-slate-600">{queueDetail}</dd>
            </div>
            <div className="border-t border-sky-100 pt-2">
              <dt className="font-medium text-slate-700">WebSocket</dt>
              <dd className="mt-1 break-all text-slate-600">{wsUrl}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Last websocket event</dt>
              <dd className="mt-1 text-slate-600">{formatDebugTime(wsAt)} - {wsDetail}</dd>
            </div>
            <div className="border-t border-sky-100 pt-2">
              <dt className="font-medium text-slate-700">Last check-in event</dt>
              <dd className="mt-1 text-slate-600">
                {lastCheckInEvent
                  ? `Checked in: ${lastCheckInEvent.name} (${formatDebugTime(lastCheckInEvent.at)})`
                  : "No check-in action captured yet."}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function getPriorityLevel(priority) {
  const clamped = Math.max(0, Math.min(3, Number(priority ?? 0)))
  return PRIORITY_LEVELS.find((level) => level.value === clamped) || PRIORITY_LEVELS[3]
}

function PriorityLegend() {
  return (
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
  )
}

function getQueuedCheckIns() {
  try {
    const raw = localStorage.getItem(CHECKIN_QUEUE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return [...new Set(parsed.map((id) => String(id)))]
  } catch {
    return []
  }
}

function saveQueuedCheckIns(ids) {
  localStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify([...new Set(ids.map((id) => String(id)))]))
}

function isConnectivityError(err, isOnlineOverride = navigator.onLine) {
  if (!isOnlineOverride) return true

  const message = String(err?.message || "").toLowerCase()
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("network")
  )
}

function isParticipantCheckable(participant) {
  return participant && !participant.checked_in && !participant.is_waitlisted
}

export default function CheckIn() {
  const { eventId } = useParams()
  const isDev = import.meta.env.DEV
  const apiBase = isDev
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`)
  const wsUrl = apiBase.replace(/^http/, "ws") + "/api/ws/updates"

  const [participants, setParticipants] = useState([])
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [activeResultId, setActiveResultId] = useState(null)
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [queueCount, setQueueCount] = useState(getQueuedCheckIns().length)
  const [eventMode, setEventMode] = useState(localStorage.getItem(EVENT_MODE_KEY) === "on")
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine)
  const [forceOffline, setForceOffline] = useState(false)
  const [pauseRealtime, setPauseRealtime] = useState(false)
  const [slowRefresh, setSlowRefresh] = useState(false)
  const [wsReconnectNonce, setWsReconnectNonce] = useState(0)
  const [tickMs, setTickMs] = useState(Date.now())
  const [isFlushingQueue, setIsFlushingQueue] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState("idle")
  const [refreshSource, setRefreshSource] = useState("not-started")
  const [refreshAt, setRefreshAt] = useState(null)
  const [refreshDetail, setRefreshDetail] = useState("No participant refresh has run yet.")
  const [queueStatus, setQueueStatus] = useState("idle")
  const [queueSource, setQueueSource] = useState("not-started")
  const [queueAt, setQueueAt] = useState(null)
  const [queueDetail, setQueueDetail] = useState("No queue sync has run yet.")
  const [queuePreviewIds, setQueuePreviewIds] = useState(getQueuedCheckIns())
  const [wsStatus, setWsStatus] = useState("connecting")
  const [wsAt, setWsAt] = useState(null)
  const [wsDetail, setWsDetail] = useState("Waiting for websocket activity.")
  const [lastCheckInEvent, setLastCheckInEvent] = useState(null)
  const [copySnapshotStatus, setCopySnapshotStatus] = useState("idle")

  const searchRef = useRef(null)
  const isFlushingRef = useRef(false)

  const isOnline = browserOnline && !forceOffline

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

  const createSimulatedConnectivityError = () => new Error(SIMULATED_OFFLINE_MESSAGE)

  const queuePreview = queuePreviewIds.map((id) => {
    const participant = participants.find((p) => String(p.id) === String(id))
    if (!participant) {
      return { id, name: "Unknown participant" }
    }

    return {
      id,
      name: `${participant.first_name} ${participant.last_name}`,
    }
  })

  const refreshAge = formatAge(refreshAt, tickMs)

  const healthState = (() => {
    if (!isOnline || queueCount > 0) {
      return { label: "Offline queue active", status: "error" }
    }

    if (refreshSource === "polling-fallback" || pauseRealtime) {
      return { label: "Polling fallback", status: "warning" }
    }

    return { label: "Normal", status: "success" }
  })()

  const updateRefreshDebug = ({ source, status, detail }) => {
    setRefreshSource(source)
    setRefreshStatus(status)
    setRefreshDetail(detail)
    setRefreshAt(new Date().toISOString())
  }

  const updateQueueDebug = ({ source, status, detail }) => {
    setQueueSource(source)
    setQueueStatus(status)
    setQueueDetail(detail)
    setQueueAt(new Date().toISOString())
  }

  const updateWsDebug = ({ status, detail }) => {
    setWsStatus(status)
    setWsDetail(detail)
    setWsAt(new Date().toISOString())
  }

  const clearDevScenarios = () => {
    setForceOffline(false)
    setPauseRealtime(false)
    setSlowRefresh(false)
  }

  const triggerReconnect = () => {
    updateWsDebug({
      status: "connecting",
      detail: "Manual reconnect requested from dev panel.",
    })

    setWsReconnectNonce((value) => value + 1)
    flushQueuedCheckIns("manual-reconnect")
    refreshParticipants({ source: "manual-reconnect" })
  }

  const copyDiagnosticsSnapshot = async () => {
    const lines = [
      "SFA Dev Diagnostics Snapshot",
      `Timestamp: ${new Date().toISOString()}`,
      `Event ID: ${eventId}`,
      `Health mode: ${healthState.label}`,
      `Network effective: ${isOnline ? "online" : "offline"}`,
      `Browser online: ${browserOnline ? "online" : "offline"}`,
      `Simulated offline: ${forceOffline ? "enabled" : "disabled"}`,
      `Pause realtime websocket: ${pauseRealtime ? "enabled" : "disabled"}`,
      `Slow refresh: ${slowRefresh ? "enabled" : "disabled"}`,
      `Queue count: ${queueCount}`,
      `Queue source: ${queueSource}`,
      `Queue status: ${queueStatus}`,
      `Queue detail: ${queueDetail}`,
      `Queue preview: ${queuePreview.length > 0 ? queuePreview.map((item) => `${item.name} (${item.id})`).join("; ") : "none"}`,
      `Refresh source: ${refreshSource}`,
      `Refresh status: ${refreshStatus}`,
      `Refresh updated: ${formatDebugTime(refreshAt)}`,
      `Refresh age: ${refreshAge}`,
      `Refresh detail: ${refreshDetail}`,
      `WebSocket status: ${wsStatus}`,
      `WebSocket url: ${wsUrl}`,
      `WebSocket updated: ${formatDebugTime(wsAt)}`,
      `WebSocket detail: ${wsDetail}`,
      `Last check-in event: ${lastCheckInEvent ? `Checked in ${lastCheckInEvent.name} (${formatDebugTime(lastCheckInEvent.at)})` : "none"}`,
    ]

    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setCopySnapshotStatus("success")
    } catch {
      setCopySnapshotStatus("error")
    } finally {
      window.setTimeout(() => {
        setCopySnapshotStatus("idle")
      }, 1800)
    }
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTickMs(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    refreshParticipants({ source: "initial-load" })
  }, [eventId])

  useEffect(() => {
    if (forceOffline) {
      updateQueueDebug({
        source: "dev-simulated-offline",
        status: "warning",
        detail: SIMULATED_OFFLINE_MESSAGE,
      })
    }
  }, [forceOffline])

  useEffect(() => {
    if (pauseRealtime) {
      updateWsDebug({
        status: "warning",
        detail: "Dev-only websocket pause is enabled.",
      })
    }
  }, [pauseRealtime])

  const focusSearch = () => {
    requestAnimationFrame(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    })
  }

  const blurSearchIfFocused = () => {
    if (document.activeElement === searchRef.current) {
      searchRef.current?.blur()
    }
  }

  const handleRowMouseDown = (e) => {
    // Let native behavior run for actual controls inside the row.
    if (e.target.closest("input, button")) return

    // Prevent browser focus/scroll side effects before click selection.
    e.preventDefault()
  }

  useEffect(() => {
    focusSearch()
  }, [])

  const toggleParticipantSelection = (participantId) => {
    blurSearchIfFocused()

    setSelectedParticipants(prev => {
      const isSelected = prev.includes(participantId)
      const nextSelected = isSelected
        ? prev.filter(id => id !== participantId)
        : [...prev, participantId]

      setActiveResultId((currentActiveId) => {
        if (!isSelected) return participantId
        if (currentActiveId === participantId) {
          return nextSelected.length ? nextSelected[nextSelected.length - 1] : null
        }
        return currentActiveId
      })

      return nextSelected
    })
  }

  const selectAllVisible = () => {
    const visibleIds = filtered.map(p => p.id)
    setSelectedParticipants(prev => {
      const newSelection = [...new Set([...prev, ...visibleIds])]
      return newSelection
    })
  }

  const deselectAll = () => {
    setSelectedParticipants([])
    setActiveResultId(null)
  }

  const toggleEventMode = () => {
    setEventMode((prev) => {
      const next = !prev
      localStorage.setItem(EVENT_MODE_KEY, next ? "on" : "off")
      return next
    })
  }

  async function flushQueuedCheckIns(source = "queue-manual") {
    if (isFlushingRef.current) {
      updateQueueDebug({
        source,
        status: "warning",
        detail: "Skipped because a queue sync is already in progress.",
      })
      return
    }

    const queued = getQueuedCheckIns()
    setQueuePreviewIds(queued)
    if (!queued.length) {
      setQueueCount(0)
      updateQueueDebug({
        source,
        status: "idle",
        detail: "No queued check-ins were pending.",
      })
      return
    }

    if (!isOnline) {
      setQueueCount(queued.length)
      updateQueueDebug({
        source,
        status: "warning",
        detail: `${forceOffline ? "Simulated offline mode is active." : "Device is offline."} ${queued.length} queued check-in${queued.length === 1 ? " is" : "s are"} waiting to retry.`,
      })
      return
    }

    isFlushingRef.current = true
    setIsFlushingQueue(true)

    const stillQueued = []
    let syncedCount = 0
    let droppedCount = 0

    try {
      updateQueueDebug({
        source,
        status: "running",
        detail: `Attempting to sync ${queued.length} queued check-in${queued.length === 1 ? "" : "s"}.`,
      })

      for (const participantId of queued) {
        try {
          await checkInParticipant(participantId)
          syncedCount += 1
        } catch (err) {
          // Keep retrying only for connectivity issues; drop business-rule failures.
          if (isConnectivityError(err)) {
            stillQueued.push(participantId)
          } else {
            droppedCount += 1
          }
        }
      }

      saveQueuedCheckIns(stillQueued)
      setQueueCount(stillQueued.length)
      setQueuePreviewIds(stillQueued)

      if (stillQueued.length > 0) {
        updateQueueDebug({
          source,
          status: "partial",
          detail: `Synced ${syncedCount}. ${stillQueued.length} check-in${stillQueued.length === 1 ? " is" : "s are"} still queued.`,
        })
      } else if (syncedCount > 0) {
        updateQueueDebug({
          source,
          status: "success",
          detail: `Synced ${syncedCount} queued check-in${syncedCount === 1 ? "" : "s"} and cleared the queue.`,
        })
      } else if (droppedCount > 0) {
        updateQueueDebug({
          source,
          status: "warning",
          detail: `Dropped ${droppedCount} queued check-in${droppedCount === 1 ? "" : "s"} because the server rejected them after reconnect.`,
        })
      } else {
        updateQueueDebug({
          source,
          status: "idle",
          detail: "Queue sync ran but there was nothing new to apply.",
        })
      }

      if (syncedCount > 0) {
        await refreshParticipants({ source: "queue-sync" })
        setError("")
      }
    } catch (err) {
      updateQueueDebug({
        source,
        status: "error",
        detail: err?.message || "Queue sync failed unexpectedly.",
      })
    } finally {
      isFlushingRef.current = false
      setIsFlushingQueue(false)
    }
  }

  // Utility: Refresh participants from API
  async function refreshParticipants(options = {}) {
    const { focusSearchInput = false, source = "manual-refresh" } = options

    updateRefreshDebug({
      source,
      status: "running",
      detail: "Fetching latest participants from the server.",
    })

    if (slowRefresh) {
      updateRefreshDebug({
        source,
        status: "warning",
        detail: "Dev-only slow refresh delay is active before the request runs.",
      })
      await wait(3000)
      updateRefreshDebug({
        source,
        status: "running",
        detail: "Fetching latest participants after simulated delay.",
      })
    }

    try {
      if (forceOffline) {
        throw createSimulatedConnectivityError()
      }

      const data = await fetchEventParticipants(eventId)
      setParticipants(data)
      updateRefreshDebug({
        source,
        status: "success",
        detail: `Loaded ${data.length} participant${data.length === 1 ? "" : "s"}.`,
      })
      if (focusSearchInput) {
        focusSearch()
      }
    } catch (err) {
      console.error("Failed to refresh participants", err)
      updateRefreshDebug({
        source,
        status: "error",
        detail: err?.message || "Failed to refresh participants.",
      })
    }
  }

  async function handleCheckIn(participantIds) {
    if (participantIds.length === 0) return

    setIsCheckingIn(true)
    setError("")

    let waiverErrors = []
    let queuedOffline = []
    let serverSuccesses = []

    for (const id of participantIds) {
      const participant = participants.find((p) => p.id === id)
      const participantName = participant
        ? `${participant.first_name} ${participant.last_name}`
        : "Unknown participant"

      // Optimistic UI for perceived speed: immediately mark checked-in.
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, checked_in: true } : p))
      )

      try {
        if (forceOffline) {
          throw createSimulatedConnectivityError()
        }
        await checkInParticipant(id)
        serverSuccesses.push(id)
        setLastCheckInEvent({
          id,
          name: participantName,
          at: new Date().toISOString(),
        })
      } catch (err) {
        const errorMessage = err.message || "Unknown error"

        const isOffline = isConnectivityError(err, isOnline)
        if (!isOffline) {
          // Roll back only for hard errors (e.g. waiver rule violations).
          setParticipants((prev) =>
            prev.map((p) => (p.id === id ? { ...p, checked_in: false } : p))
          )
        }

        if (errorMessage.includes("Waiver not verified")) {
          waiverErrors.push(id)
        } else if (isOffline) {
          const updatedQueue = [...getQueuedCheckIns(), String(id)]
          saveQueuedCheckIns(updatedQueue)
          setQueueCount(updatedQueue.length)
          setQueuePreviewIds(updatedQueue)
          queuedOffline.push(id)
        }
      }
    }

    // Only refresh from server when at least one check-in actually committed.
    // Skipping refresh for offline-only failures keeps the optimistic update
    // intact and prevents stale server data from wiping the local state.
    if (serverSuccesses.length > 0) {
      await refreshParticipants({ focusSearchInput: true })
    }

    // Show error only for hard failures (waiver). Offline queuing uses the
    // amber banner — no red error for expected offline behavior.
    if (waiverErrors.length > 0) {
      const participantNames = waiverErrors.map(id => {
        const p = participants.find(p => p.id === id)
        return p ? `${p.first_name} ${p.last_name}` : "Unknown"
      }).join(", ")
      setError(`Cannot check in: ${participantNames}. Waiver receipt must be verified prior to check-in.`)
    }

    if (queuedOffline.length > 0) {
      setError(`Offline detected. ${queuedOffline.length} check-in${queuedOffline.length === 1 ? "" : "s"} queued and will retry automatically.`)
    }

    // Clear selection
    setSelectedParticipants([])
    setActiveResultId(null)
    setSearch("")
    focusSearch()
    setIsCheckingIn(false)
  }

  useEffect(() => {
    flushQueuedCheckIns("event-change")
  }, [eventId])

  useEffect(() => {
    setQueuePreviewIds(getQueuedCheckIns())
  }, [eventId])

  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true)
      flushQueuedCheckIns("online-event")
    }

    const onOffline = () => {
      setBrowserOnline(false)
      updateQueueDebug({
        source: "offline-event",
        status: "warning",
        detail: `Device went offline. ${getQueuedCheckIns().length} queued check-in${getQueuedCheckIns().length === 1 ? " is" : "s are"} waiting to retry.`,
      })
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [eventId])

  // Some mobile browsers keep navigator.onLine=true on cellular while Wi-Fi is
  // disconnected, so online/offline events can be unreliable. Periodically
  // retry queued check-ins and also retry when app regains focus.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (getQueuedCheckIns().length > 0) {
        flushQueuedCheckIns("queue-interval")
      }
    }, 5000)

    const onFocus = () => {
      if (getQueuedCheckIns().length > 0) {
        flushQueuedCheckIns("window-focus")
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && getQueuedCheckIns().length > 0) {
        flushQueuedCheckIns("tab-visible")
      }
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [eventId])

  // Real-time updates from other clients (phone/laptop) on this page.
  useEffect(() => {
    if (pauseRealtime) {
      return undefined
    }

    let ws = null
    let reconnectTimer = null
    let isCancelled = false

    const connect = () => {
      if (isCancelled) return
      updateWsDebug({
        status: "connecting",
        detail: "Opening websocket connection.",
      })
      ws = new window.WebSocket(wsUrl)

      ws.onopen = () => {
        updateWsDebug({
          status: "open",
          detail: "Connected. Waiting for participant updates.",
        })
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          updateWsDebug({
            status: "open",
            detail: `Received ${data.type || "message"} event.`,
          })
          if (data.type === "participant_update") {
            refreshParticipants({ source: "websocket-update" })
          }
        } catch {
          // Ignore malformed websocket messages.
          updateWsDebug({
            status: "warning",
            detail: "Received malformed websocket message.",
          })
        }
      }

      ws.onclose = () => {
        if (isCancelled) return
        updateWsDebug({
          status: "closed",
          detail: "Connection closed. Retrying in 1 second.",
        })
        reconnectTimer = window.setTimeout(connect, 1000)
      }

      ws.onerror = () => {
        // Let onclose handle reconnect timing.
        updateWsDebug({
          status: "warning",
          detail: "Websocket error signaled. Waiting for reconnect.",
        })
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
  }, [eventId, wsUrl, pauseRealtime, wsReconnectNonce])

  // Fallback sync: periodically refresh while visible to avoid stale UI if
  // websocket reconnect is delayed on some devices/networks.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && isOnline) {
        refreshParticipants({ source: "polling-fallback" })
      }
    }, 4000)

    return () => window.clearInterval(intervalId)
  }, [eventId, isOnline, slowRefresh, forceOffline])

  const filtered = participants
    .filter((p) =>
      `${p.first_name} ${p.last_name}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (a.checked_in !== b.checked_in) {
        return a.checked_in ? -1 : 1
      }

      const lastNameComparison = a.last_name.localeCompare(b.last_name)
      if (lastNameComparison !== 0) {
        return lastNameComparison
      }

      return a.first_name.localeCompare(b.first_name)
    })

  useEffect(() => {
    if (filtered.length === 0) {
      setActiveResultId(null)
      setSelectedParticipants([])
      return
    }

    const hasCurrentActive = activeResultId && filtered.some((p) => p.id === activeResultId)
    if (!hasCurrentActive && activeResultId) {
      setActiveResultId(null)
    }

    setSelectedParticipants((prev) => {
      const next = prev.filter((id) => filtered.some((p) => p.id === id))
      const unchanged = next.length === prev.length && next.every((id, index) => id === prev[index])
      return unchanged ? prev : next
    })
  }, [search, participants, filtered.length, activeResultId])

  const moveActiveSelection = (direction) => {
    if (filtered.length === 0) return

    const currentIndex = filtered.findIndex((p) => p.id === activeResultId)
    const fallbackIndex = 0
    const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex
    const nextIndex = (baseIndex + direction + filtered.length) % filtered.length
    const nextId = filtered[nextIndex].id

    setActiveResultId(nextId)
    setSelectedParticipants([nextId])
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveActiveSelection(1)
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      moveActiveSelection(-1)
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (isCheckingIn) return

      const activeParticipant = filtered.find((p) => p.id === activeResultId)
      if (!activeParticipant) return

      if (activeParticipant.checked_in || activeParticipant.is_waitlisted) return

      handleCheckIn([activeParticipant.id])
    }
  }

  const selectedCount = selectedParticipants.length
  const selectedCheckableIds = selectedParticipants.filter(id => {
    const participant = participants.find(p => p.id === id)
    return isParticipantCheckable(participant)
  })
  const checkableSelected = selectedCheckableIds.length

  return (

    <div className="p-6 space-y-4">
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-semibold flex-1">Event Check-In</h1>
        <button
          onClick={toggleEventMode}
          className={`ml-2 px-3 py-1 rounded text-sm font-semibold ${eventMode ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"}`}
          title="Toggle simplified event-day UI"
        >
          Event Mode {eventMode ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => refreshParticipants({ focusSearchInput: true })}
          className="ml-2 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          title="Refresh participants"
        >
          ↻ Refresh
        </button>
      </div>

      <input
        ref={searchRef}
        type="text"
        placeholder="Search surfer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        className="w-full border rounded p-3 text-lg"
      />

      <PriorityLegend />

      {isDev && (
        <DevCheckInPanel
          isOnline={isOnline}
          browserOnline={browserOnline}
          apiBase={apiBase}
          wsUrl={wsUrl}
          queueCount={queueCount}
          queuePreview={queuePreview}
          isFlushingQueue={isFlushingQueue}
          refreshStatus={refreshStatus}
          refreshSource={refreshSource}
          refreshAt={refreshAt}
          refreshAge={refreshAge}
          refreshDetail={refreshDetail}
          queueStatus={queueStatus}
          queueSource={queueSource}
          queueAt={queueAt}
          queueDetail={queueDetail}
          wsStatus={wsStatus}
          wsAt={wsAt}
          wsDetail={wsDetail}
          lastCheckInEvent={lastCheckInEvent}
          healthState={healthState}
          forceOffline={forceOffline}
          setForceOffline={setForceOffline}
          pauseRealtime={pauseRealtime}
          setPauseRealtime={setPauseRealtime}
          slowRefresh={slowRefresh}
          setSlowRefresh={setSlowRefresh}
          triggerReconnect={triggerReconnect}
          clearDevScenarios={clearDevScenarios}
          onCopySnapshot={copyDiagnosticsSnapshot}
          copySnapshotStatus={copySnapshotStatus}
        />
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {queueCount > 0 && (
        <div className="bg-amber-100 border border-amber-400 text-amber-800 px-4 py-3 rounded">
          Offline queue active: {queueCount} check-in{queueCount === 1 ? "" : "s"} pending sync.
        </div>
      )}

      {/* Selection Controls */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={selectAllVisible}
          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
        >
          Select All Visible
        </button>
        <button
          onClick={deselectAll}
          className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
        >
          Deselect All
        </button>
        <span className="text-sm text-gray-600 self-center">
          {selectedCount} selected ({checkableSelected} can be checked in)
        </span>
      </div>

      {!eventMode && (
        <div className="flex justify-end pr-4">
          <div className="grid w-[440px] grid-cols-3 gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span className="text-center">Waiver</span>
            <span className="text-center">Check-In</span>
            <span className="text-center">Waitlist</span>
          </div>
        </div>
      )}

      <div className="space-y-2">

        {filtered.map((p) => {
          const priorityLevel = getPriorityLevel(p.priority)
          return (
            <div
              key={p.id}
              onMouseDown={handleRowMouseDown}
              onClick={() => toggleParticipantSelection(p.id)}
              className={`flex justify-between items-center p-4 rounded shadow cursor-pointer transition
              ${selectedParticipants.includes(p.id) ? "bg-blue-100 border-2 border-blue-600 ring-2 ring-blue-300" : "bg-white hover:bg-gray-50 border border-transparent"}
            `}
            >

            {/* Checkbox */}
            <div className="flex items-center gap-3 flex-1">
              <input
                type="checkbox"
                checked={selectedParticipants.includes(p.id)}
                onChange={() => toggleParticipantSelection(p.id)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4"
              />

              <div className="flex-1">

                <p className="font-medium">
                  {p.first_name} {p.last_name}
                </p>

                <p className="text-sm text-gray-500">
                  {p.email}
                </p>

                <p className="mt-1 inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white">
                    <span className={`h-2.5 w-2.5 rounded-full ${priorityLevel.dotClass}`} />
                  </span>
                  Priority: {priorityLevel.label}
                </p>

              </div>

            </div>

            {/* Status */}
            <div className="text-right ml-2">
              {!eventMode ? (
                <div className="w-[410px]">
                  <div className="grid grid-cols-3 gap-2">
                    <span className={`inline-flex items-center justify-center gap-1.5 rounded-full px-0.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      p.waiver_verified ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.waiver_verified ? "bg-green-500" : "bg-red-500"}`} />
                      {p.waiver_verified ? "Verified" : "Pending"}
                    </span>

                    <span className={`inline-flex items-center justify-center gap-1.5 rounded-full px-0.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      p.checked_in
                        ? "bg-green-100 text-green-700"
                        : p.is_waitlisted
                        ? "bg-gray-100 text-gray-600"
                        : "bg-red-100 text-red-700"
                    }`}>
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          p.checked_in ? "bg-green-500" : p.is_waitlisted ? "bg-gray-400" : "bg-red-500"
                        }`}
                      />
                      {p.checked_in ? "Checked In" : p.is_waitlisted ? "N/A" : "Not Checked In"}
                    </span>

                    <span className={`inline-flex items-center justify-center gap-1.5 rounded-full px-0.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      p.is_waitlisted ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                    }`}>
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.is_waitlisted ? "bg-yellow-400" : "bg-gray-500"}`} />
                      {p.is_waitlisted ? "Waitlisted" : "Confirmed"}
                    </span>
                  </div>

                  {!p.checked_in && !p.is_waitlisted && (
                    <div className="mt-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCheckIn([p.id])
                        }}
                        disabled={isCheckingIn}
                        className="bg-success text-white rounded px-4 py-2 disabled:opacity-50"
                      >
                        Check In
                      </button>
                    </div>
                  )}
                </div>
              ) : p.checked_in ? (
                <span className="inline-flex items-center gap-2 text-green-700 font-medium">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                  Checked In
                </span>
              ) : p.is_waitlisted ? (
                <span className="inline-flex items-center gap-2 text-yellow-700 font-medium">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  Waitlisted
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-red-700 font-medium mb-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                  Not Checked In
                  </span>
              )}

              {eventMode && !p.checked_in && !p.is_waitlisted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCheckIn([p.id])
                  }}
                  disabled={isCheckingIn}
                  className={`bg-success text-white rounded disabled:opacity-50 ${eventMode ? "px-6 py-3 text-lg font-semibold" : "px-4 py-2"}`}
                >
                  Check In
                </button>
              )}
            </div>

            </div>
          )
        })}

      </div>

      {/* Bulk Check-In Button */}
      <button
        disabled={checkableSelected === 0 || isCheckingIn}
        onClick={() => handleCheckIn(selectedCheckableIds)}
        className={`w-full py-4 rounded-xl text-lg font-semibold transition
          ${checkableSelected > 0 && !isCheckingIn
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
          } ${eventMode ? "py-5 text-xl" : ""}`}
      >
        {isCheckingIn ? "Checking In..." : `Check In ${checkableSelected} Selected Participant${checkableSelected !== 1 ? 's' : ''}`}
      </button>

    </div>
  )
}
