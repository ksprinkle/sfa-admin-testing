import { useEffect, useState } from "react"
import { fetchAllParticipants, checkInParticipant, promoteParticipant, 
  removeParticipant, verifyWaiver } from "../api/events"
import ParticipantActionsDropdown from "../components/ParticipantActionsDropdown"

export default function Participants() {

  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState("")

  const filteredParticipants = participants.filter(p =>
  `${p.first_name} ${p.last_name} ${p.email} ${p.event_title}`
    .toLowerCase()
    .includes(search.toLowerCase())
)
  useEffect(() => {
    async function load() {
      const data = await fetchAllParticipants()
      setParticipants(data)
    }

    load()
  }, [])

async function handleCheckIn(participantId) {
  try {
    await checkInParticipant(participantId)

    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, checked_in: true }
          : p
      )
    )
  } catch (err) {
    console.error(err)
    alert("Failed to check in participant")
  }
}

async function handleRemove(participantId) {
  if (!confirm("Remove this participant from the event?")) return

  try {
    await removeParticipant(participantId)

    setParticipants(prev =>
      prev.filter(p => p.id !== participantId)
    )
  } catch (err) {
    console.error(err)
    alert("Failed to remove participant")
  }
}

async function handlePromote(participantId) {
  try {
    await promoteParticipant(participantId)

    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, is_waitlisted: false }
          : p
      )
    )
  } catch (err) {
    console.error(err)
    alert("Failed to promote participant")
  }
}

async function handleVerifyWaiver(participantId) {
  try {
    await verifyWaiver(participantId)

    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, waiver_verified: true }
          : p
      )
    )
  } catch (err) {
    console.error(err)
    alert("Failed to verify waiver")
  }
}

  return (

    <div className="p-6">

      <h1 className="text-2xl font-semibold mb-6">
        Participants
      </h1>
      
{/* Search bar with count of filtered participants */ }   
      <div className="mb-4 text-center sticky top-0 bg-warmbg z-10 pb-2">

        <input
          type="text"
          placeholder="Search participants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded p-2 mb-2"
        />

        <div className="text-sm text-gray-600" >
          
          {filteredParticipants.length} participant
          {filteredParticipants.length === 1 ? "" : "s"} found
          {filteredParticipants.length === 0 && (
            <p className="text-sm text-gray-400 text-center">
              No participants found
            </p>
            )}   
      </div>
    </div>

{/* Table of participants with columns for name, email, event, status, and actions */}
      <div className="bg-white rounded-xl shadow">

        <table className="w-full">

          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-sm text-gray-600">
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Event</th>
              <th className="p-4">Status</th>
            </tr>
            
          </thead>

          <tbody>

            {filteredParticipants.map(p => (

// Each row is highlighted if checked in, and has hover effect otherwise
              <tr
                key={p.id}
                className={`border-b transition ${
                  p.checked_in ? "bg-green-50" : "hover:bg-gray-50"
                }`}
              >

                <td className="p-4">
                  {p.first_name} {p.last_name}
                </td>

                <td className="p-4 text-gray-600">
                  {p.email}
                </td>

                <td className="p-4">
                  {p.event_title}
                </td>

{/* Status column with colored badges for checked in, waitlisted, and registered */}
                <td className="p-4">

                  {p.checked_in ? (

                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-medium">
                      Checked In
                    </span>

                  ) : p.is_waitlisted ? (

                    <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm font-medium">
                      Waitlisted
                    </span>

                  ) : (

                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm font-medium">
                      Registered
                    </span>

                  )}

                </td>
                
{/* Actions column with buttons to check in, promote, or remove participant */}
                <td>
                <ParticipantActionsDropdown
                  participant={p}
                  onVerifyWaiver={handleVerifyWaiver}
                  onCheckIn={handleCheckIn}
                  onPromote={handlePromote}
                  onRemove={handleRemove}
                />
              </td>
              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}