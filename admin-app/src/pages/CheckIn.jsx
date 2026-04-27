import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  fetchEventParticipants,
  fetchAdminEvent,
  checkInParticipant,
  moveParticipantToWaitlist,
  promoteParticipant,
  verifyWaiver,
} from "../api/events"
import BackButton from "../components/BackButton"
import SyncStateIndicator from "../components/SyncStateIndicator"

const CHECKIN_QUEUE_KEY = "sfa.offline.checkin.queue"
const EVENT_MODE_KEY = "sfa.event.mode"
const CHECKIN_PARTICIPANTS_CACHE_PREFIX = "sfa.offline.checkin.participants."
const NON_RETRYABLE_STATUS_CODES = new Set([400, 404])
const RECOVERABLE_STATUS_CODES = new Set([409, 429, 500, 502, 503, 504])
const PRIORITY_LEVELS = [
  { value: 1, label: "High", dotClass: "bg-red-500" },
  { value: 2, label: "Medium", dotClass: "bg-amber-400" },
  { value: 3, label: "Low", dotClass: "bg-gray-500" },
  { value: 0, label: "Unset", dotClass: "bg-gray-300" },
]

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

function normalizeCheckInQueueEntry(entry) {
  if (entry == null) return null

  if (typeof entry === "string" || typeof entry === "number") {
    const participantId = String(entry)
    return {
      id: `checkin:${participantId}`,
      type: "checkin",
      participantId,
      syncStatus: "pending",
      retryable: true,
      lastStatus: null,
      lastError: "",
      updatedAt: Date.now(),
    }
  }

  const participantId = entry.participantId != null ? String(entry.participantId) : null
  if (!participantId) return null

  const syncStatus = entry.syncStatus === "failed" ? "failed" : "pending"
  return {
    id: entry.id || `checkin:${participantId}`,
    type: "checkin",
    participantId,
    syncStatus,
    retryable: entry.retryable !== false,
    lastStatus: Number.isFinite(Number(entry.lastStatus)) ? Number(entry.lastStatus) : null,
    lastError: String(entry.lastError || ""),
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
  }
}

function dedupeCheckInQueue(entries) {
  const byParticipant = new Map()
  for (const item of entries) {
    const normalized = normalizeCheckInQueueEntry(item)
    if (!normalized) continue
    byParticipant.set(normalized.participantId, normalized)
  }
  return [...byParticipant.values()]
}

function getQueuedCheckIns() {
  try {
    const raw = localStorage.getItem(CHECKIN_QUEUE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return dedupeCheckInQueue(parsed)
  } catch {
    return []
  }
}

function saveQueuedCheckIns(entries) {
  localStorage.setItem(CHECKIN_QUEUE_KEY, JSON.stringify(dedupeCheckInQueue(entries)))
}

function getQueueErrorMeta(err) {
  const status = Number(err?.status)
  const safeStatus = Number.isFinite(status) ? status : null
  const detail = String(err?.message || "Unknown error")

  if (safeStatus === 404) {
    return {
      retryable: false,
      status: safeStatus,
      detail,
      summary: "participant no longer exists",
    }
  }

  if (safeStatus === 400) {
    return {
      retryable: false,
      status: safeStatus,
      detail,
      summary: "invalid participant state",
    }
  }

  if (safeStatus === 409) {
    return {
      retryable: true,
      status: safeStatus,
      detail,
      summary: "capacity or state conflict",
    }
  }

  return {
    retryable: RECOVERABLE_STATUS_CODES.has(safeStatus) || safeStatus == null || !NON_RETRYABLE_STATUS_CODES.has(safeStatus),
    status: safeStatus,
    detail,
    summary: "server rejected the update",
  }
}

function getParticipantsCacheKey(eventId) {
  return `${CHECKIN_PARTICIPANTS_CACHE_PREFIX}${String(eventId || "")}`
}

function getCachedParticipants(eventId) {
  try {
    const raw = localStorage.getItem(getParticipantsCacheKey(eventId))
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCachedParticipants(eventId, participants) {
  try {
    localStorage.setItem(getParticipantsCacheKey(eventId), JSON.stringify(Array.isArray(participants) ? participants : []))
  } catch {
    // Ignore localStorage write failures on constrained devices.
  }
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
  const navigate = useNavigate()
  const apiBase = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`)
  const wsUrl = apiBase.replace(/^http/, "ws") + "/api/ws/updates"

  const [participants, setParticipants] = useState([])
  const [eventInfo, setEventInfo] = useState(null)
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [activeResultId, setActiveResultId] = useState(null)
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [queueNotice, setQueueNotice] = useState("")
  const [queuedCheckIns, setQueuedCheckIns] = useState(() => getQueuedCheckIns())
  const [eventMode, setEventMode] = useState(localStorage.getItem(EVENT_MODE_KEY) === "on")
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine)
  const [isWsOpen, setIsWsOpen] = useState(false)
  const [badgeActionParticipantId, setBadgeActionParticipantId] = useState(null)

  const searchRef = useRef(null)
  const participantListRef = useRef(null)
  const isFlushingRef = useRef(false)

  const isOnline = browserOnline

  const pendingQueueCount = queuedCheckIns.filter((item) => item.syncStatus !== "failed").length
  const failedQueueCount = queuedCheckIns.filter((item) => item.syncStatus === "failed").length
  const queueByParticipant = queuedCheckIns.reduce((acc, item) => {
    const participantId = String(item.participantId)
    const existing = acc[participantId]
    if (item.syncStatus === "failed") {
      acc[participantId] = "failed"
      return acc
    }
    if (!existing) {
      acc[participantId] = "pending"
    }
    return acc
  }, {})

  const persistQueuedCheckIns = (entries) => {
    const next = dedupeCheckInQueue(entries)
    saveQueuedCheckIns(next)
    setQueuedCheckIns(next)
    return next
  }

  const enqueueCheckIn = (participantId) => {
    const id = String(participantId)
    const existing = getQueuedCheckIns().filter((entry) => String(entry.participantId) !== id)
    const next = [
      ...existing,
      {
        id: `checkin:${id}`,
        type: "checkin",
        participantId: id,
        syncStatus: "pending",
        retryable: true,
        lastStatus: null,
        lastError: "",
        updatedAt: Date.now(),
      },
    ]
    return persistQueuedCheckIns(next)
  }

  const updateParticipantsLocal = (updater) => {
    setParticipants((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater
      saveCachedParticipants(eventId, next)
      return next
    })
  }

  useEffect(() => {
    refreshParticipants({ source: "initial-load" })
  }, [eventId])

  useEffect(() => {
    let isCancelled = false

    async function loadEventInfo() {
      try {
        const data = await fetchAdminEvent(eventId)
        if (!isCancelled) {
          setEventInfo(data || null)
        }
      } catch (err) {
        if (!isCancelled) {
          setEventInfo(null)
        }
      }
    }

    loadEventInfo()
    return () => {
      isCancelled = true
    }
  }, [eventId])

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
    if (e.target.closest("input, button")) return
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

  const retryRecoverableQueueItems = () => {
    const next = queuedCheckIns.map((entry) => {
      if (entry.syncStatus === "failed" && entry.retryable) {
        return {
          ...entry,
          syncStatus: "pending",
          lastError: "",
          updatedAt: Date.now(),
        }
      }
      return entry
    })
    persistQueuedCheckIns(next)
    setQueueNotice("")
    flushQueuedCheckIns()
  }

  const dismissFailedQueueItems = () => {
    const next = queuedCheckIns.filter((entry) => entry.syncStatus !== "failed")
    persistQueuedCheckIns(next)
    setQueueNotice("")
  }

  async function flushQueuedCheckIns() {
    if (isFlushingRef.current) {
      return
    }

    const queued = getQueuedCheckIns()
    if (!queued.length) {
      setQueuedCheckIns([])
      setQueueNotice("")
      return
    }

    if (!isOnline) {
      setQueuedCheckIns(queued)
      return
    }

    isFlushingRef.current = true
    const remaining = []
    let syncedCount = 0

    try {
      for (let i = 0; i < queued.length; i += 1) {
        const queuedItem = queued[i]

        if (queuedItem.syncStatus === "failed") {
          remaining.push(queuedItem)
          continue
        }

        try {
          await checkInParticipant(queuedItem.participantId)
          syncedCount += 1
        } catch (err) {
          if (isConnectivityError(err)) {
            remaining.push(
              ...queued.slice(i).map((entry) => ({
                ...entry,
                syncStatus: entry.syncStatus === "failed" ? "failed" : "pending",
                updatedAt: Date.now(),
              }))
            )
            break
          }

          const meta = getQueueErrorMeta(err)
          const failedAction = {
            ...queuedItem,
            syncStatus: "failed",
            retryable: meta.retryable,
            lastStatus: meta.status,
            lastError: meta.detail,
            updatedAt: Date.now(),
          }
          remaining.push(failedAction)
          setQueueNotice(`1 check-in failed to sync: ${meta.summary}.`)
        }
      }

      persistQueuedCheckIns(remaining)

      if (syncedCount > 0) {
        await refreshParticipants({ source: "queue-sync" })
        setError("")
      }
    } catch (err) {
      console.error("Queue sync failed", err)
    } finally {
      isFlushingRef.current = false
    }
  }

  // Utility: Refresh participants from API
  async function refreshParticipants(options = {}) {
    const { focusSearchInput = false, preserveScroll = false } = options
    const priorScrollTop = preserveScroll ? participantListRef.current?.scrollTop : null

    try {
      const data = await fetchEventParticipants(eventId)
      setParticipants(data)
      saveCachedParticipants(eventId, data)
      if (preserveScroll && typeof priorScrollTop === "number") {
        requestAnimationFrame(() => {
          if (participantListRef.current) {
            participantListRef.current.scrollTop = priorScrollTop
          }
        })
      }
      if (focusSearchInput) {
        focusSearch()
      }
    } catch (err) {
      console.error("Failed to refresh participants", err)
      const cached = getCachedParticipants(eventId)
      if (cached.length > 0 && participants.length === 0) {
        setParticipants(cached)
        setError("Offline mode: showing the last synced roster on this device.")
      }
    }
  }

  async function handleCheckIn(participantIds, options = {}) {
    if (participantIds.length === 0) return
    const { preserveWorkingPosition = participantIds.length === 1 } = options

    setIsCheckingIn(true)
    setError("")

    let waiverErrors = []
    let queuedOffline = []
    let serverSuccesses = []

    for (const id of participantIds) {
      updateParticipantsLocal((prev) =>
        prev.map((p) => (p.id === id ? { ...p, checked_in: true } : p))
      )

      try {
        await checkInParticipant(id)
        serverSuccesses.push(id)
      } catch (err) {
        const errorMessage = err.message || "Unknown error"

        const isOffline = isConnectivityError(err, isOnline)
        if (!isOffline) {
          updateParticipantsLocal((prev) =>
            prev.map((p) => (p.id === id ? { ...p, checked_in: false } : p))
          )
        }

        if (errorMessage.includes("Waiver not verified")) {
          waiverErrors.push(id)
        } else if (isOffline) {
          enqueueCheckIn(id)
          queuedOffline.push(id)
        }
      }
    }

    if (serverSuccesses.length > 0) {
      await refreshParticipants({
        focusSearchInput: !preserveWorkingPosition,
        preserveScroll: preserveWorkingPosition,
        source: preserveWorkingPosition ? "checkin-row-action" : "checkin-bulk-action",
      })
    }

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

    if (!preserveWorkingPosition) {
      setSelectedParticipants([])
      setActiveResultId(null)
      setSearch("")
      focusSearch()
    }
    setIsCheckingIn(false)
  }

  async function handleStatusBadgeAction(participant, action) {
    if (!participant?.id) return

    setError("")
    setBadgeActionParticipantId(participant.id)

    try {
      if (action === "verify_waiver") {
        await verifyWaiver(participant.id)
        await refreshParticipants({ source: "badge-verify-waiver", preserveScroll: true })
        return
      }

      if (action === "checkin") {
        await handleCheckIn([participant.id], { preserveWorkingPosition: true })
        return
      }

      if (action === "promote") {
        await promoteParticipant(participant.id)
        await refreshParticipants({ source: "badge-promote", preserveScroll: true })
        return
      }

      if (action === "move_to_waitlist") {
        await moveParticipantToWaitlist(participant.id)
        await refreshParticipants({ source: "badge-move-waitlist", preserveScroll: true })
        return
      }
    } catch (err) {
      const message = err?.message || "Unknown error"
      const labels = {
        verify_waiver: "verify waiver",
        checkin: "check in",
        promote: "promote from waitlist",
        move_to_waitlist: "move to waitlist",
      }
      setError(`Failed to ${labels[action] || "run action"}: ${message}`)
    } finally {
      setBadgeActionParticipantId(null)
    }
  }

  useEffect(() => {
    flushQueuedCheckIns("event-change")
  }, [eventId])

  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true)
      flushQueuedCheckIns("online-event")
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

  useEffect(() => {
    let ws = null
    let reconnectTimer = null
    let isCancelled = false

    const connect = () => {
      if (isCancelled) return
      setIsWsOpen(false)
      ws = new window.WebSocket(wsUrl)

      ws.onopen = () => {
        setIsWsOpen(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "participant_update") {
            refreshParticipants({ source: "websocket-update" })
          }
        } catch {
        }
      }

      ws.onclose = () => {
        if (isCancelled) return
        setIsWsOpen(false)
        reconnectTimer = window.setTimeout(connect, 1000)
      }

      ws.onerror = () => {
        setIsWsOpen(false)
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
  }, [eventId, wsUrl])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const shouldPoll = !isWsOpen
      if (document.visibilityState === "visible" && isOnline && shouldPoll) {
        refreshParticipants({ source: "polling-fallback" })
      }
    }, 4000)

    return () => window.clearInterval(intervalId)
  }, [eventId, isOnline, isWsOpen])

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

  const isVolunteer = (participant) => (participant?.role || "").toLowerCase().trim() === "volunteer"
  const sessionConfigs = Array.isArray(eventInfo?.sessions) ? eventInfo.sessions : []
  const sessionMetaById = Object.fromEntries(sessionConfigs.map((session) => [session.id, session]))
  const configuredSessionIds = sessionConfigs.map((session) => session.id)
  const unknownSessionIds = Array.from(
    new Set(
      participants
        .map((participant) => participant.session_id)
        .filter((sessionId) => Boolean(sessionId) && !configuredSessionIds.includes(sessionId))
    )
  ).sort((left, right) => String(left).localeCompare(String(right)))
  const hasUnassignedParticipants = participants.some((participant) => !participant.session_id)
  const orderedSessionIds = [
    ...configuredSessionIds,
    ...unknownSessionIds,
    ...(hasUnassignedParticipants ? ["UNASSIGNED"] : []),
  ]
  const sessionOverview = orderedSessionIds.map((sessionId, index) => {
    const meta = sessionMetaById[sessionId]
    const participantCount = participants.filter(
      (participant) => (participant.session_id || "UNASSIGNED") === sessionId && !isVolunteer(participant)
    ).length

    return {
      sessionId,
      label: sessionId === "UNASSIGNED" ? "Waitlist / Unassigned" : (meta?.name || `Session ${index + 1}`),
      participantCount,
      capacity: Number(meta?.capacity || 15),
    }
  })

  return (

    <div className="p-6 space-y-4">
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-semibold flex-1">Event Check-In</h1>
        <BackButton fallbackTo={`/events/${eventId}`} className="ml-2" />
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

      {sessionOverview.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Session overview</h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sessionOverview.map((session) => (
              <div key={String(session.sessionId)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-sm font-semibold text-gray-800">{session.label}</div>
                <div className="text-xs text-gray-600">{session.participantCount} / {session.capacity}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {(pendingQueueCount > 0 || failedQueueCount > 0) && (
        <div className="space-y-2 rounded border border-amber-400 bg-amber-100 px-4 py-3 text-amber-900">
          <div className="text-sm font-medium">
            Offline queue active: {pendingQueueCount} pending, {failedQueueCount} failed.
            {!browserOnline ? " Device is offline." : " Sync resumes while online."}
          </div>
          {queueNotice && <div className="text-sm">{queueNotice}</div>}
          {failedQueueCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={retryRecoverableQueueItems}
                className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
              >
                Retry recoverable
              </button>
              <button
                type="button"
                onClick={dismissFailedQueueItems}
                className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
              >
                Dismiss failed
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selection Controls */}
      <div className="flex gap-2 flex-wrap items-center">
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
        {!eventMode && (
          <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            <span className="font-semibold uppercase tracking-wide text-gray-500">Legend</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Verified
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-orange-600" />
              Pending
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
              Waitlisted
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-gray-500" />
              Confirmed
            </span>
            <span className="text-gray-500">Tip: click a status badge to update it.</span>
          </div>
        )}
      </div>

      <div ref={participantListRef} className="max-h-[68vh] overflow-auto rounded-xl border border-gray-200 bg-white/40 p-2">
        {!eventMode && (
          <div className="sticky top-0 z-20 flex justify-end pr-4 bg-white/95 backdrop-blur-sm py-2">
            <div className="w-[440px]">
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span className="text-center">Waiver</span>
                <span className="text-center">Check-In</span>
                <span className="text-center">Waitlist</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">

        {filtered.map((p) => {
          const priorityLevel = getPriorityLevel(p.priority)
          const isVolunteerRow = (p.role || "").trim().toLowerCase() === "volunteer"
          const baseRoleRowClass = isVolunteerRow
            ? "bg-cyan-50/45 hover:bg-cyan-100/60 border border-transparent"
            : "bg-amber-50/35 hover:bg-amber-100/50 border border-transparent"
          const isBadgeBusy = isCheckingIn || badgeActionParticipantId === p.id
          const canVerifyWaiver = !p.waiver_verified && !isBadgeBusy
          const canCheckInFromBadge = !p.checked_in && !p.is_waitlisted && !isBadgeBusy
          const canPromoteFromBadge = p.is_waitlisted && !isBadgeBusy
          const canMoveToWaitlistFromBadge = !p.is_waitlisted && !p.checked_in && !isBadgeBusy
          return (
            <div
              key={p.id}
              onMouseDown={handleRowMouseDown}
              onClick={() => toggleParticipantSelection(p.id)}
              className={`flex justify-between items-center p-4 rounded shadow cursor-pointer transition
              ${selectedParticipants.includes(p.id)
                ? `${baseRoleRowClass} border-2 border-blue-600 ring-2 ring-blue-300`
                : baseRoleRowClass
              }
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
                <div className="flex items-center gap-2">
                  <SyncStateIndicator state={queueByParticipant[String(p.id)] || "synced"} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const nextParams = new URLSearchParams()
                      nextParams.set("participant_id", String(p.id))
                      if (eventId) {
                        nextParams.set("event_id", String(eventId))
                      }
                      if (eventInfo?.event_type) {
                        nextParams.set("event_type", String(eventInfo.event_type).trim().toLowerCase())
                      }
                      if (p.session_id) {
                        nextParams.set("session_id", String(p.session_id))
                      }
                      navigate(`/participants?${nextParams.toString()}`)
                    }}
                    className="font-medium text-sky-800 hover:underline cursor-pointer text-left"
                    title="Open participant details"
                  >
                    {p.first_name} {p.last_name}
                  </button>
                </div>

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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!canVerifyWaiver) return
                        handleStatusBadgeAction(p, "verify_waiver")
                      }}
                      disabled={!canVerifyWaiver}
                      title={p.waiver_verified ? "Waiver already verified" : "Click to verify waiver"}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-0.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      p.waiver_verified ? "bg-green-100 text-green-900" : "bg-orange-100 text-orange-900"
                    } ${canVerifyWaiver ? "cursor-pointer hover:ring-1 hover:ring-amber-300" : "cursor-default opacity-90"}`}
                    >
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.waiver_verified ? "bg-green-500" : "bg-orange-600"}`} />
                      {p.waiver_verified ? "Verified" : "Pending (Verify)"}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!canCheckInFromBadge) return
                        handleStatusBadgeAction(p, "checkin")
                      }}
                      disabled={!canCheckInFromBadge}
                      title={
                        p.checked_in
                          ? "Already checked in"
                          : p.is_waitlisted
                          ? "Promote from waitlist first"
                          : "Click to check in"
                      }
                      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-0.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      p.checked_in
                        ? "bg-green-100 text-green-900"
                        : p.is_waitlisted
                        ? "bg-gray-100 text-gray-600"
                        : "bg-orange-200 text-orange-900"
                    } ${canCheckInFromBadge ? "cursor-pointer hover:ring-1 hover:ring-green-300" : "cursor-default opacity-90"}`}
                    >
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          p.checked_in ? "bg-green-500" : p.is_waitlisted ? "bg-gray-400" : "bg-orange-600"
                        }`}
                      />
                      {p.checked_in ? "Checked In" : p.is_waitlisted ? "N/A" : "Not Checked In (Check In)"}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (canPromoteFromBadge) {
                          handleStatusBadgeAction(p, "promote")
                          return
                        }
                        if (canMoveToWaitlistFromBadge) {
                          handleStatusBadgeAction(p, "move_to_waitlist")
                        }
                      }}
                      disabled={!(canPromoteFromBadge || canMoveToWaitlistFromBadge)}
                      title={
                        p.is_waitlisted
                          ? "Click to promote from waitlist"
                          : p.checked_in
                          ? "Checked-in participants cannot be moved to waitlist here"
                          : "Click to move participant to waitlist"
                      }
                      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-0.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                      p.is_waitlisted ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                    } ${(canPromoteFromBadge || canMoveToWaitlistFromBadge) ? "cursor-pointer hover:ring-1 hover:ring-yellow-300" : "cursor-default opacity-90"}`}
                    >
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.is_waitlisted ? "bg-yellow-400" : "bg-gray-500"}`} />
                      {p.is_waitlisted ? "Waitlisted (Promote)" : "Confirmed (Waitlist)"}
                    </button>
                  </div>

                  {!p.checked_in && !p.is_waitlisted && (
                    <div className="mt-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCheckIn([p.id])
                        }}
                        disabled={isCheckingIn}
                        className="rounded border border-green-900 bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-green-300 hover:bg-green-800 disabled:opacity-50"
                      >
                        Check In
                      </button>
                    </div>
                  )}
                </div>
              ) : p.checked_in ? (
                <span className="inline-flex items-center gap-2 text-green-900 font-medium">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                  Checked In
                </span>
              ) : p.is_waitlisted ? (
                <span className="inline-flex items-center gap-2 text-yellow-700 font-medium">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  Waitlisted
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-orange-900 font-medium mb-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-600" />
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
                  className={`rounded border border-green-900 bg-green-700 text-white shadow-sm ring-1 ring-green-300 hover:bg-green-800 disabled:opacity-50 ${eventMode ? "px-6 py-3 text-lg font-semibold" : "px-4 py-2"}`}
                >
                  Check In
                </button>
              )}
            </div>

            </div>
          )
        })}

        </div>
      </div>

      {/* Bulk Check-In Button */}
      <button
        disabled={checkableSelected === 0 || isCheckingIn}
        onClick={() => handleCheckIn(selectedCheckableIds)}
        className={`w-full py-4 rounded-xl text-lg font-semibold transition
          ${checkableSelected > 0 && !isCheckingIn
            ? "border-2 border-green-900 bg-green-700 text-white ring-2 ring-green-300 hover:bg-green-800"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
          } ${eventMode ? "py-5 text-xl" : ""}`}
      >
        {isCheckingIn ? "Checking In..." : `Check In ${checkableSelected} Selected Participant${checkableSelected !== 1 ? 's' : ''}`}
      </button>

    </div>
  )
}
