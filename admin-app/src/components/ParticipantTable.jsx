import { useState } from "react"

function ParticipantTable({ participants }) {

  const [rows, setRows] = useState(participants)
  const [search, setSearch] = useState("")

  const filteredParticipants = rows.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (

    <div>

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
              <th className="p-4">Status</th>
              <th className="p-4">Check-In</th>
            </tr>
          </thead>

          <tbody>

            {filteredParticipants.map(p => (

              <tr
                key={p.id}
                className="border-b hover:bg-gray-50"
              >

                <td className="p-4 font-medium">
                  {p.name}
                </td>

                <td className="p-4 text-gray-600">
                  {p.email}
                </td>

                <td className="p-4">

                  {p.is_waitlisted ? (
                    <span className="text-yellow-600 text-sm">
                      Waitlisted
                    </span>
                  ) : (
                    <span className="text-green-600 text-sm">
                      Confirmed
                    </span>
                  )}

                </td>

                <td className="p-4">

                  {p.checked_in ? (
                    <span className="text-green-600 text-sm font-medium">
                      ✔ Checked In
                    </span>
                  ) : !p.is_waitlisted ? (
                    <button
                      onClick={() => handleCheckIn(p.id)}
                      className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700"
                    >
                      Check In
                    </button>
                  ) : (
                    <span className="text-gray-400 text-sm">
                      —
                    </span>
                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}

export default ParticipantTable