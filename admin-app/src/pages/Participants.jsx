import { useEffect, useState, useCallback, useRef } from "react"
import { fetchAllParticipants, checkInParticipant, promoteParticipant, 
  removeParticipant, verifyWaiver, updateParticipantPriority } from "../api/events"

const PRIORITY_LEVELS = [
  { value: 1, label: "High", dotClass: "bg-red-500" },
  { value: 2, label: "Medium", dotClass: "bg-amber-400" },
  { value: 3, label: "Low", dotClass: "bg-gray-500" },
  { value: 0, label: "Unset", dotClass: "bg-gray-300" },
]

const WAIVER_LEGEND = [
  { value: true, label: "Verified", dotClass: "bg-green-500" },
  { value: false, label: "Pending", dotClass: "bg-red-500" },
]

const CHECKIN_LEGEND = [
  { value: "checked", label: "Checked In", dotClass: "bg-green-500" },
  { value: "waitlisted", label: "Waitlisted", dotClass: "bg-yellow-400" },
  { value: "pending", label: "Not Checked In", dotClass: "bg-red-500" },
]

const STATUS_LEGEND = [
  { value: "waitlisted", label: "Waitlisted", dotClass: "bg-yellow-400" },
  { value: "confirmed", label: "Confirmed", dotClass: "bg-gray-500" },
]

function StatusLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
      <div className="flex items-center gap-4">
        <span className="font-semibold uppercase tracking-wide text-gray-800">Waiver</span>
        {WAIVER_LEGEND.map((item) => (
          <span key={String(item.value)} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
            <span>{item.label}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-semibold uppercase tracking-wide text-gray-800">Check-In</span>
        {CHECKIN_LEGEND.map((item) => (
          <span key={item.value} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
            <span>{item.label}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-semibold uppercase tracking-wide text-gray-800">Status</span>
        {STATUS_LEGEND.map((item) => (
          <span key={item.value} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${item.dotClass}`} />
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

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

  const levels = PRIORITY_LEVELS;

  const currentLevel = levels.find(l => l.value === current) || levels[3];

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        className="inline-flex min-w-[92px] items-center justify-between gap-1.5 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        onClick={() => setOpen(o => !o)}
        title="Change priority"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300 bg-white">
            <span className={`h-2 w-2 rounded-full ${currentLevel.dotClass}`} />
          </span>
          {currentLevel.label}
        </span>
        <svg className="ml-0.5 h-2.5 w-2.5" viewBox="0 0 20 20"><path d="M7 7l3 3 3-3" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-32 rounded border bg-white shadow z-20">
          {levels.map(l => (
            <button
              key={l.value}
              className={`flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-gray-100 ${l.value === current ? "bg-gray-50 font-semibold text-gray-900" : "text-gray-700"}`}
              onClick={() => { onChange(l.value); setOpen(false); }}
              disabled={l.value === current}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300 bg-white">
                  <span className={`h-2 w-2 rounded-full ${l.dotClass}`} />
                </span>
                {l.label}
              </span>
              <span className={`h-3.5 w-3.5 rounded-full border ${l.value === current ? "border-gray-700" : "border-gray-300"}`}>
                {l.value === current && <span className="mx-auto mt-[3px] block h-1.5 w-1.5 rounded-full bg-gray-700" />}
              </span>
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
    const apiBase = import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`)
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
        </div>
      )}

      {actionError && (
        <div className="mb-3 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="ml-4 text-red-500 font-bold">✕</button>
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
      <StatusLegend />

      <div className="bg-white rounded-xl shadow overflow-x-auto">

        <table className="w-full min-w-[900px] text-sm">

          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="w-36 px-2 py-3">Name</th>
              <th className="w-44 px-2 py-3">Email</th>
              <th className="w-20 px-1.5 py-3">Event</th>
              <th className="w-20 px-1 py-3 text-center">Priority</th>
              <th className="w-12 px-2 py-3 text-center">WVR</th>
              <th className="w-12 px-2 py-3 text-center">CHK</th>
              <th className="w-12 px-2 py-3 text-center">STS</th>
              <th className="w-16 px-2 py-3 text-center">Actions</th>
            </tr>
            
          </thead>

          <tbody>

            {filteredParticipants.map((p, index) => {
              const clampedPriority = Math.max(0, Math.min(3, p.priority));
              return (
                <tr
                  key={p.id}
                  className={`border-b transition hover:bg-gray-50 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}
                >
                  <td className="w-36 px-2 py-2 font-medium text-gray-900" title={`${p.first_name} ${p.last_name}`}>
                    <span className="block truncate whitespace-nowrap">{p.first_name} {p.last_name}</span>
                  </td>
                  <td className="w-44 px-2 py-2 text-xs text-gray-500" title={p.email}>
                    <span className="block truncate whitespace-nowrap">{p.email}</span>
                  </td>
                  <td className="w-20 px-1.5 py-2 text-gray-700" title={p.event_title}>
                    <span className="block truncate whitespace-nowrap">{p.event_title}</span>
                  </td>
                  <td className="w-20 px-1 py-2 text-center">
                    <PriorityDropdown
                      current={clampedPriority}
                      onChange={level => handlePriorityChange(p.id, level)}
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${p.waiver_verified ? "bg-green-500" : "bg-red-500"}`}
                      title={p.waiver_verified ? "Waiver Verified" : "Waiver Pending"}
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${
                        p.checked_in ? "bg-green-500" : p.is_waitlisted ? "bg-yellow-400" : "bg-red-500"
                      }`}
                      title={p.checked_in ? "Checked In" : p.is_waitlisted ? "Waitlisted" : "Not Checked In"}
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${
                        p.is_waitlisted ? "bg-yellow-400" : "bg-gray-500"
                      }`}
                      title={p.is_waitlisted ? "Waitlisted" : "Confirmed"}
                    />
                  </td>
                  <td className="w-16 px-2 py-2 text-center">
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