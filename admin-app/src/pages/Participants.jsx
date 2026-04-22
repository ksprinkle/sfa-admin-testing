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

  const [priorityError, setPriorityError] = useState("")
  const [actionError, setActionError] = useState("")

  // Move handlePriorityChange inside the component
  async function handlePriorityChange(participantId, newPriority) {
    // Optimistic update
    setParticipants(prev => prev.map(p => p.id === participantId ? { ...p, priority: newPriority } : p))
    setPriorityError("")
    try {
      await updateParticipantPriority(participantId, newPriority);
    } catch (err) {
      console.error('Priority update error:', err);
      // Roll back
      setParticipants(prev => prev.map(p => p.id === participantId ? { ...p, priority: p.priority } : p))
      const msg = err?.message || "Unknown error"
      const isOffline = !navigator.onLine || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("load failed") || msg.toLowerCase().includes("network")
      setPriorityError(isOffline
        ? "Priority change couldn't be saved — no connection. Changes will be lost on refresh."
        : `Failed to update priority: ${msg}`)
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
    const apiBase = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`
    const wsUrl = apiBase.replace(/^http/, "ws") + "/api/ws/updates";
    let ws = null;
    let reconnectTimer = null;
    let isCancelled = false;

    const connect = () => {
      if (isCancelled) return;
      ws = new window.WebSocket(wsUrl);

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

      ws.onclose = () => {
        if (isCancelled) return;
        reconnectTimer = window.setTimeout(connect, 1000);
      };

      ws.onerror = () => {
        // Let onclose handle reconnect timing.
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && ws.readyState === window.WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Fallback sync: periodically refresh while visible to avoid stale UI if
  // websocket reconnect is delayed on some devices/networks.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        if (refreshRef.current) refreshRef.current();
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, []);

  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState("");

  const filteredParticipants = participants
    .filter((p) =>
      `${p.first_name} ${p.last_name} ${p.email} ${p.event_title}`
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
    });

  // Initial load
  useEffect(() => {
    refreshParticipants();
  }, [refreshParticipants]);

  async function handleCheckIn(participantId) {
    setActionError("")
    try {
      await checkInParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      const msg = err.message || "Failed to check in participant"
      const isOffline = !navigator.onLine || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("load failed") || msg.toLowerCase().includes("network")
      if (isOffline) {
        setActionError("Check-in couldn't be saved — no connection. Try again when Wi-Fi is back.")
      } else if (msg.includes("Waiver not verified")) {
        setActionError("Cannot check in: waiver must be verified first.")
      } else {
        setActionError(`Check-in failed: ${msg}`)
      }
    }
  }

  async function handleRemove(participantId) {
    if (!confirm("Remove this participant from the event?")) return
    setActionError("")
    try {
      await removeParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      setActionError(`Failed to remove: ${err.message || "Unknown error"}`)
    }
  }

  async function handlePromote(participantId) {
    setActionError("")
    try {
      await promoteParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      setActionError(`Failed to promote: ${err.message || "Unknown error"}`)
    }
  }

  async function handleVerifyWaiver(participantId) {
    setActionError("")
    try {
      await verifyWaiver(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      setActionError(`Failed to verify waiver: ${err.message || "Unknown error"}`)
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
      {priorityError && (
        <div className="mb-3 bg-amber-100 border border-amber-400 text-amber-800 px-4 py-2 rounded text-sm">
          {priorityError}

              {actionError && (
                <div className="mb-3 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm flex justify-between items-center">
                  <span>{actionError}</span>
                  <button onClick={() => setActionError("")} className="ml-4 text-red-500 font-bold">✕</button>
                </div>
              )}
        </div>
      )}

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
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-medium">🟢 Checked In</span>
                    ) : p.is_waitlisted ? (
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm font-medium">🟡 Waitlisted</span>
                    ) : (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm font-medium">🔴 Not Checked In</span>
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