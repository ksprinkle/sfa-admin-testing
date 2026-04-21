
import { useState } from "react"
import { updateParticipantPriority } from "../api/events"
import PriorityDropdown from "../pages/Participants.jsx";

function ParticipantTable({ participants, onCheckIn }) {
  const [rows, setRows] = useState(participants)
  const [search, setSearch] = useState("")

  const filteredParticipants = rows.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const minPriority = 1;
  const maxPriority = 3;
  async function handlePriorityChange(id, newPriority) {
    const clamped = Math.max(minPriority, Math.min(maxPriority, newPriority));
    try {
      await updateParticipantPriority(id, clamped);
      setRows(prev => prev.map(part =>
        part.id === id ? { ...part, priority: clamped } : part
      ));
    } catch (err) {
      alert("Failed to update priority");
    }
  }

  return (
    <div>
      {/* PRIORITY LEGEND */}
      <div className="mb-2 flex gap-4 items-center">
        <span className="font-semibold text-sm">Priority Legend:</span>
        <span className="flex items-center gap-1 text-xs"><span className="inline-block w-3 h-3 rounded-full bg-red-500 border border-gray-300 mr-1" />1 (High)</span>
        <span className="flex items-center gap-1 text-xs"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400 border border-gray-300 mr-1" />2 (Medium)</span>
        <span className="flex items-center gap-1 text-xs"><span className="inline-block w-3 h-3 rounded-full bg-gray-400 border border-gray-300 mr-1" />3 (Low)</span>
        <span className="flex items-center gap-1 text-xs"><span className="inline-block w-3 h-3 rounded-full bg-gray-300 border border-gray-300 mr-1" />0 (Unset)</span>
      </div>
              {/* SEARCH BOX */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search participants..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border rounded p-2"
                  autoFocus
                />
              </div>
              {/* TABLE */}
              <div className="bg-white rounded-xl shadow">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-sm text-gray-600">
                      <th className="p-4">Name</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Priority</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Waiver</th>
                      <th className="p-4">Check-In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.map(p => {
                      const clampedPriority = Math.max(0, Math.min(maxPriority, p.priority));
                      let dotColor = "bg-gray-400";
                      if (clampedPriority === 1) dotColor = "bg-red-500";
                      else if (clampedPriority === 2) dotColor = "bg-yellow-400";
                      else if (clampedPriority === 3) dotColor = "bg-gray-400";
                      else if (clampedPriority === 0) dotColor = "bg-gray-300";
                      return (
                        <tr
                          key={p.id}
                          className={`border-b hover:bg-gray-50
                            ${p.checked_in ? "bg-green-50" : ""}
                            ${!p.waiver_verified ? "bg-red-50" : ""}
                            ${p.is_waitlisted ? "bg-yellow-50" : ""}
                          `}
                        >
                          <td className="p-4 font-medium">{p.first_name} {p.last_name}</td>
                          <td className="p-4 text-gray-600">{p.email}</td>
                          <td className="p-4">
                            <PriorityDropdown
                              current={clampedPriority}
                              onChange={level => handlePriorityChange(p.id, level)}
                            />
                          </td>
                          <td className="p-4">
                            {p.is_waitlisted ? (
                              <span className="text-yellow-600 text-sm">Waitlisted</span>
                            ) : (
                              <span className="text-green-600 text-sm">Confirmed</span>
                            )}
                          </td>
                          <td className="p-4">
                            {p.waiver_verified ? (
                              <span className="text-green-600 text-sm font-medium">✔ Verified</span>
                            ) : (
                              <span className="text-red-600 text-sm font-medium">⚠ Missing</span>
                            )}
                          </td>
                          <td className="p-4">
                            {p.checked_in ? (
                              <span className="text-green-600 text-sm font-medium">✔ Checked In</span>
                            ) : p.is_waitlisted ? (
                              <span className="text-gray-400 text-sm">—</span>
                            ) : !p.waiver_verified ? (
                              <button
                                disabled
                                className="bg-gray-300 text-gray-600 px-3 py-1 rounded text-sm cursor-not-allowed"
                                title="Waiver required before check-in"
                              >Waiver Required</button>
                            ) : (
                              <button
                                onClick={() => onCheckIn?.(p.id)}
                                className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700"
                              >Check In</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
    </div>
  )
}

export default ParticipantTable