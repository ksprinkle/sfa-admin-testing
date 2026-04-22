import { useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { fetchEventParticipants, checkInParticipant } from "../api/events"

const CHECKIN_QUEUE_KEY = "sfa.offline.checkin.queue"
const EVENT_MODE_KEY = "sfa.event.mode"

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

function isConnectivityError(err) {
  if (!navigator.onLine) return true

  const message = String(err?.message || "").toLowerCase()
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("network")
  )
}

export default function CheckIn() {
 
  const { eventId } = useParams()
  const [participants, setParticipants] = useState([])
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [activeResultId, setActiveResultId] = useState(null)
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [queueCount, setQueueCount] = useState(getQueuedCheckIns().length)
  const [eventMode, setEventMode] = useState(localStorage.getItem(EVENT_MODE_KEY) === "on")
  const [isCheckingIn, setIsCheckingIn] = useState(false)

  const searchRef = useRef(null)

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEventParticipants(eventId)
        setParticipants(data)
      } catch (err) {
        console.error("Failed to load participants", err)
      }
    })()
  }, [eventId])

  const focusSearch = () => {
    requestAnimationFrame(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    })
  }

  useEffect(() => {
    focusSearch()
  }, [])

  const toggleParticipantSelection = (participantId) => {
    setSelectedParticipants(prev => 
      prev.includes(participantId) 
        ? prev.filter(id => id !== participantId)
        : [...prev, participantId]
    )
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
  }

  const toggleEventMode = () => {
    setEventMode((prev) => {
      const next = !prev
      localStorage.setItem(EVENT_MODE_KEY, next ? "on" : "off")
      return next
    })
  }

  async function flushQueuedCheckIns() {
    const queued = getQueuedCheckIns()
    if (!queued.length || !navigator.onLine) return

    const stillQueued = []
    let syncedCount = 0

    for (const participantId of queued) {
      try {
        await checkInParticipant(participantId)
        syncedCount += 1
      } catch (err) {
        // Keep retrying only for connectivity issues; drop business-rule failures.
        if (isConnectivityError(err)) {
          stillQueued.push(participantId)
        }
      }
    }

    saveQueuedCheckIns(stillQueued)
    setQueueCount(stillQueued.length)

    if (syncedCount > 0) {
      await refreshParticipants()
      setError("")
    }
  }

  // Utility: Refresh participants from API
  async function refreshParticipants() {
    try {
      const data = await fetchEventParticipants(eventId)
      setParticipants(data)
      focusSearch()
    } catch (err) {
      console.error("Failed to refresh participants", err)
    }
  }

  async function handleCheckIn(participantIds) {
    if (participantIds.length === 0) return

    setIsCheckingIn(true)
    setError("")

    const results = []
    let waiverErrors = []
    let queuedOffline = []

    for (const id of participantIds) {
      // Optimistic UI for perceived speed: immediately mark checked-in.
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, checked_in: true } : p))
      )

      try {
        await checkInParticipant(id)
        results.push({ id, success: true })
      } catch (err) {
        const errorMessage = err.message || "Unknown error"

        const shouldKeepOptimistic = isConnectivityError(err)
        if (!shouldKeepOptimistic) {
          // Roll back only for hard errors (e.g. waiver rule violations).
          setParticipants((prev) =>
            prev.map((p) => (p.id === id ? { ...p, checked_in: false } : p))
          )
        }

        if (errorMessage.includes("Waiver not verified")) {
          waiverErrors.push(id)
        } else if (isConnectivityError(err)) {
          const updatedQueue = [...getQueuedCheckIns(), String(id)]
          saveQueuedCheckIns(updatedQueue)
          setQueueCount(updatedQueue.length)
          queuedOffline.push(id)
        }
        results.push({ id, success: false, error: errorMessage })
      }
    }

    // Always refresh after check-in
    await refreshParticipants()

    // Show error message for waiver issues
    if (waiverErrors.length > 0) {
      const participantNames = waiverErrors.map(id => {
        const p = participants.find(p => p.id === id)
        return p ? `${p.first_name} ${p.last_name}` : "Unknown"
      }).join(", ")
      setError(`Cannot check in: ${participantNames}. Waiver receipt must be verified prior to check-in.`)
    }

    if (queuedOffline.length > 0) {
      const queuedNames = queuedOffline.map(id => {
        const p = participants.find((participant) => participant.id === id)
        return p ? `${p.first_name} ${p.last_name}` : "Unknown"
      }).join(", ")

      setError(`Offline detected. Queued check-in for: ${queuedNames}. Will retry automatically when connection returns.`)
    }

    // Clear selection
    setSelectedParticipants([])
    setActiveResultId(null)
    setSearch("")
    focusSearch()
    setIsCheckingIn(false)
  }

  useEffect(() => {
    flushQueuedCheckIns()
  }, [eventId])

  useEffect(() => {
    const onOnline = () => {
      flushQueuedCheckIns()
    }

    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [eventId])

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
    const nextActiveId = hasCurrentActive ? activeResultId : filtered[0].id

    setActiveResultId(nextActiveId)
    setSelectedParticipants([nextActiveId])
  }, [search, participants])

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

      const activeParticipant = filtered.find((p) => p.id === activeResultId) || filtered[0]
      if (!activeParticipant) return

      if (activeParticipant.checked_in || activeParticipant.is_waitlisted) return

      handleCheckIn([activeParticipant.id])
    }
  }

  const selectedCount = selectedParticipants.length
  const checkableSelected = selectedParticipants.filter(id => {
    const p = participants.find(p => p.id === id)
    return p && !p.checked_in && !p.is_waitlisted
  }).length

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
          onClick={refreshParticipants}
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
        autoFocus
      />

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

      <div className="space-y-2">

        {filtered.map(p => (

          <div
            key={p.id}
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
                className="w-4 h-4"
              />

              <div className="flex-1">

                <p className="font-medium">
                  {p.first_name} {p.last_name}
                </p>

                <p className="text-sm text-gray-500">
                  {p.email}
                </p>

              </div>

              {!eventMode && (
                <div className="text-center">
                  <div className={`text-xs px-2 py-1 rounded ${
                    p.waiver_verified 
                      ? "bg-green-100 text-green-800" 
                      : "bg-red-100 text-red-800"
                  }`}>
                    {p.waiver_verified ? "✓ Waiver Verified" : "⚠ Waiver Pending"}
                  </div>
                </div>
              )}

            </div>

            {/* Status */}
            <div className="text-right ml-4">
              {p.checked_in ? (
                <span className="text-green-700 font-medium">
                  🟢 Checked In
                </span>
              ) : p.is_waitlisted ? (
                <span className="text-yellow-600 font-medium">
                  🟡 Waitlisted
                </span>
              ) : (
                <span className="text-red-700 font-medium block mb-2">
                  🔴 Not Checked In
                </span>
              )}

              {!p.checked_in && !p.is_waitlisted && (
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

        ))}

      </div>

      {/* Bulk Check-In Button */}
      <button
        disabled={checkableSelected === 0 || isCheckingIn}
        onClick={() => handleCheckIn(selectedParticipants)}
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
