import { useEffect, useState, useCallback, useRef } from "react"
import { fetchAllParticipants, checkInParticipant, promoteParticipant, 
  removeParticipant, verifyWaiver, updateParticipantPriority } from "../api/events"

// PriorityDropdown component (moved to top level)
function PriorityDropdown({ current, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const levels = [
    { value: 1, label: "High", color: "bg-red-500" },
    { value: 2, label: "Medium", color: "bg-yellow-400" },
    { value: 3, label: "Low", color: "bg-gray-400" },
    { value: 0, label: "Unset", color: "bg-gray-300" },
  ];

  const currentLevel = levels.find(l => l.value === current) || levels[3];

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        className={`flex items-center gap-2 px-2 py-1 border rounded ${currentLevel.color} bg-opacity-80 text-xs font-semibold`}
        onClick={() => setOpen(o => !o)}
        title="Change priority"
      >
        <span className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${currentLevel.color}`} />
        {currentLevel.label}
        <svg className="w-3 h-3 ml-1" viewBox="0 0 20 20"><path d="M7 7l3 3 3-3" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-28 bg-white border rounded shadow z-20">
          {levels.map(l => (
            <button
              key={l.value}
              className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${l.value === current ? "font-bold bg-gray-50" : ""}`}
              onClick={() => { onChange(l.value); setOpen(false); }}
              disabled={l.value === current}
            >
              <span className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${l.color}`} />
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


import ParticipantActionsDropdown from "../components/ParticipantActionsDropdown"

export default function Participants() {




  // Move handlePriorityChange inside the component
  async function handlePriorityChange(participantId, newPriority) {
    try {
      await updateParticipantPriority(participantId, newPriority);
      await refreshParticipants();
    } catch (err) {
      // Log the error object for debugging
      console.error('Priority update error:', err);
      let message = 'Failed to update priority';
      if (err && err.message) {
        message += `: ${err.message}`;
      } else if (typeof err === 'string') {
        message += `: ${err}`;
      }
      alert(message);
    }
  }
  // Use a ref to always get the latest refreshParticipants
  const refreshRef = useRef();

  // Utility: Refresh participants from API
  const refreshParticipants = useCallback(async () => {
    try {
      const data = await fetchAllParticipants();
      setParticipants(data);
    } catch (err) {
      console.error("Failed to refresh participants", err);
    }
  }, []);

  // Keep ref up to date
  useEffect(() => {
    refreshRef.current = refreshParticipants;
  }, [refreshParticipants]);

  // WebSocket: Listen for real-time updates and refresh participants
  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${window.location.hostname}:8000/ws/updates`;
    const ws = new window.WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "participant_update") {
          if (refreshRef.current) refreshRef.current();
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState("");

  const filteredParticipants = participants.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email} ${p.event_title}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // Initial load
  useEffect(() => {
    refreshParticipants();
  }, [refreshParticipants]);

  async function handleCheckIn(participantId) {
    try {
      await checkInParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      const errorMessage = err.message || "Failed to check in participant"
      if (errorMessage.includes("Waiver not verified")) {
        alert("Cannot check in participant. Waiver receipt must be verified prior to check-in.")
      } else {
        alert(errorMessage)
      }
    }
  }

  async function handleRemove(participantId) {
    if (!confirm("Remove this participant from the event?")) return
    try {
      await removeParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      const errorMessage = err.message || "Failed to remove participant"
      alert(errorMessage)
    }
  }

  async function handlePromote(participantId) {
    try {
      await promoteParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      const errorMessage = err.message || "Failed to promote participant"
      alert(errorMessage)
    }
  }

  async function handleVerifyWaiver(participantId) {
    try {
      await verifyWaiver(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      const errorMessage = err.message || "Failed to verify waiver"
      alert(errorMessage)
    }
  }

  return (

    <div className="p-6">
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-semibold flex-1">Participants</h1>
        <button
          onClick={refreshParticipants}
          className="ml-2 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          title="Refresh participants"
        >
          ↻ Refresh
        </button>
      </div>
      
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
              <th className="p-4">Priority</th>
              <th className="p-4">Status</th>
            </tr>
            
          </thead>

          <tbody>

            {filteredParticipants.map(p => {
              const clampedPriority = Math.max(0, Math.min(3, p.priority));
              let dotColor = "bg-gray-400";
              if (clampedPriority === 1) dotColor = "bg-red-500";
              else if (clampedPriority === 2) dotColor = "bg-yellow-400";
              else if (clampedPriority === 3) dotColor = "bg-gray-400";
              else if (clampedPriority === 0) dotColor = "bg-gray-300";
              return (
                <tr
                  key={p.id}
                  className={`border-b transition ${
                    p.checked_in ? "bg-green-50" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="p-4">{p.first_name} {p.last_name}</td>
                  <td className="p-4 text-gray-600">{p.email}</td>
                  <td className="p-4">{p.event_title}</td>
                  <td className="p-4 text-center">
                    <PriorityDropdown
                      current={clampedPriority}
                      onChange={level => handlePriorityChange(p.id, level)}
                    />
                  </td>
                  <td className="p-4">
                    {p.checked_in ? (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-medium">Checked In</span>
                    ) : p.is_waitlisted ? (
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm font-medium">Waitlisted</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm font-medium">Registered</span>
                    )}
                  </td>
                  <td className="p-4">
                    <ParticipantActionsDropdown
                      participant={p}
                      onVerifyWaiver={handleVerifyWaiver}
                      onCheckIn={handleCheckIn}
                      onPromote={handlePromote}
                      onRemove={handleRemove}
                    />
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