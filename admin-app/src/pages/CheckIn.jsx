import { useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { fetchEventParticipants, checkInParticipant } from "../api/events"

export default function CheckIn() {
 
  const { eventId } = useParams()
  const [participants, setParticipants] = useState([])
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
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

  // Utility: Refresh participants from API
  async function refreshParticipants() {
    try {
      const data = await fetchEventParticipants(eventId)
      setParticipants(data)
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

    for (const id of participantIds) {
      try {
        await checkInParticipant(id)
        results.push({ id, success: true })
      } catch (err) {
        const errorMessage = err.message || "Unknown error"
        if (errorMessage.includes("Waiver not verified")) {
          waiverErrors.push(id)
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

    // Clear selection
    setSelectedParticipants([])
    setSearch("")
    searchRef.current?.focus()
    setIsCheckingIn(false)
  }

  const filtered = participants.filter(p =>

    `${p.first_name} ${p.last_name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

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
        className="w-full border rounded p-3 text-lg"
        autoFocus
      />

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
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
              ${selectedParticipants.includes(p.id) ? "bg-blue-100 border border-blue-400" : "bg-white hover:bg-gray-50"}
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

              {/* Waiver Status */}
              <div className="text-center">
                <div className={`text-xs px-2 py-1 rounded ${
                  p.waiver_verified 
                    ? "bg-green-100 text-green-800" 
                    : "bg-red-100 text-red-800"
                }`}>
                  {p.waiver_verified ? "✓ Waiver Verified" : "⚠ Waiver Pending"}
                </div>
              </div>

            </div>

            {/* Status */}
            <div className="text-right ml-4">
              {p.checked_in && (
                <span className="text-green-700 font-medium">
                  ✔ Checked In
                </span>
              )}

              {p.is_waitlisted && (
                <span className="text-yellow-600 font-medium">
                  Waitlisted
                </span>
              )}

              {!p.checked_in && !p.is_waitlisted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCheckIn([p.id])
                  }}
                  disabled={isCheckingIn}
                  className="bg-success text-white px-4 py-2 rounded disabled:opacity-50"
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
          }`}
      >
        {isCheckingIn ? "Checking In..." : `Check In ${checkableSelected} Selected Participant${checkableSelected !== 1 ? 's' : ''}`}
      </button>

    </div>
  )
}
