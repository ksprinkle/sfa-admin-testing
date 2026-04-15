import { useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { fetchEventParticipants, checkInParticipant } from "../api/events"

export default function CheckIn() {
 
  const { eventId } = useParams()
  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState("")
  const [selectedParticipant, setSelectedParticipant] = useState(null)

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

  async function handleCheckIn(id) {

    await checkInParticipant(eventId, id)

    setParticipants(prev =>
      prev.map(p =>
        p.id === id ? { ...p, checked_in: true } : p
      )
    )

    setSelectedParticipant(null)
    setSearch("")
    searchRef.current?.focus()
  }

  const filtered = participants.filter(p =>

    `${p.first_name} ${p.last_name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (

    <div className="p-6 space-y-4">

      <h1 className="text-2xl font-semibold">
        Event Check-In
      </h1>

      <input
        ref={searchRef}
        type="text"
        placeholder="Search surfer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded p-3 text-lg"
        autoFocus
      />

      <div className="space-y-2">

        {filtered.map(p => (

          <div
            key={p.id}
            onClick={() => setSelectedParticipant(p)}
            className={`flex justify-between items-center p-4 rounded shadow cursor-pointer transition
              ${selectedParticipant?.id === p.id ? "bg-blue-100 border border-blue-400" : "bg-white hover:bg-gray-50"}
            `}
          >

            <div>

              <p className="font-medium">
                {p.first_name} {p.last_name}
              </p>

              <p className="text-sm text-gray-500">
                {p.email}
              </p>

            </div>

            {!p.checked_in && !p.is_waitlisted && (

              <button
                onClick={() => handleCheckIn(p.id)}
                className="bg-success text-white px-4 py-2 rounded"
              >
                Check In
              </button>

            )}

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

          </div>

        ))}

      </div>
      {/* CHECK-IN BUTTON (THIS IS THE IMPORTANT PART) */}
      <button
        disabled={!selectedParticipant}
        onClick={() => handleCheckIn(selectedParticipant.id)}
        className={`w-full py-4 rounded-xl text-lg font-semibold transition
          ${
            selectedParticipant
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
      >
        ✔ Check In Selected Participant
      </button>  
    </div>
  )
}
