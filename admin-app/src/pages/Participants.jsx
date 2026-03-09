import { useEffect, useState } from "react"
import { fetchAllParticipants } from "../api/events"

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

  return (

    <div className="p-6">

      <h1 className="text-2xl font-semibold mb-6">
        Participants
      </h1>
      
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

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}