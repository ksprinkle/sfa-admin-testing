import { useEffect, useState } from "react"


import { useNavigate, useParams } from "react-router-dom"
import { fetchAdminEvent, fetchEventParticipants, updateParticipantSession, updateParticipantPriority } from "../api/events"
import { fetchNoShowCandidates, promoteNoShowSlots } from "../api/no_show"

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"

import { DragOverlay } from "@dnd-kit/core"

const EVENT_MODE_KEY = "sfa.event.mode"
const PRIORITY_LEVELS = [
  { value: 1, label: "High", dotClass: "bg-red-500" },
  { value: 2, label: "Medium", dotClass: "bg-amber-400" },
  { value: 3, label: "Low", dotClass: "bg-gray-500" },
  { value: 0, label: "Unset", dotClass: "bg-gray-300" },
]

function EventDetail() {
    const [noShows, setNoShows] = useState([])
    const [promoteLoading, setPromoteLoading] = useState(false)
    const [noShowError, setNoShowError] = useState(null)

    // Fetch no-show candidates
    async function refreshNoShows() {
      setNoShowError(null); // Always clear error before fetch
      try {
        const ids = await fetchNoShowCandidates(eventId);
        setNoShows(Array.isArray(ids) ? ids : []);
      } catch (err) {
        // Log the actual error for debugging
        console.error("No-show fetch error:", err);
        setNoShows([]);
        setNoShowError("Failed to fetch no-show candidates");
      }
    }

    // Manual promotion for no-show slots
    async function handlePromoteNoShows() {
      setPromoteLoading(true)
      setNoShowError(null)
      try {
        await promoteNoShowSlots(eventId)
        await refreshParticipants()
        await refreshNoShows()
      } catch (err) {
        setNoShowError("Promotion failed")
      } finally {
        setPromoteLoading(false)
      }
    }
  const { eventId } = useParams();

  // Utility: Refresh participants from API
  async function refreshParticipants() {
    try {
      const data = await fetchEventParticipants(eventId)
      setParticipants(data || [])
    } catch (err) {
      console.error("Failed to refresh participants", err)
    }
  }

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
            refreshParticipants();
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
  }, [eventId]);

  // Fallback sync: periodically refresh while visible to avoid stale UI if
  // websocket reconnect is delayed on some devices/networks.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        refreshParticipants();
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [eventId]);

  // Priority legend kept consistent with Participants page.
  const PriorityLegend = () => (
      <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <span className="font-semibold uppercase tracking-wide text-gray-500">Priority legend</span>
        {PRIORITY_LEVELS.map((level) => (
          <span key={level.value} className="inline-flex items-center gap-2">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white">
              <span className={`h-2.5 w-2.5 rounded-full ${level.dotClass}`} />
            </span>
            <span>{level.label}</span>
          </span>
        ))}
      </div>
    );
  const navigate = useNavigate()
  // (eventId already declared above)

  const [participants, setParticipants] = useState([])
  const [eventMode, setEventMode] = useState(localStorage.getItem(EVENT_MODE_KEY) === "on")
  const [eventStartAt, setEventStartAt] = useState(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [activeTransform, setActiveTransform] = useState(null)
  const [dragError, setDragError] = useState(null)

  // ✅ stable sensors setup
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
  // drag move/cleanup will be handled on the DndContext (must be inside it)

  // ✅ stable data loading logic
  useEffect(() => {
    if (!eventId || eventId === "new") return

    const toEventStartDate = (startDate, startTime) => {
      if (!startDate || !startTime) return null
      const isoLike = `${startDate}T${startTime}`
      const parsed = new Date(isoLike)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    async function loadAll() {
      setLoading(true)
      try {
        const [data, eventData] = await Promise.all([
          fetchEventParticipants(eventId),
          fetchAdminEvent(eventId),
        ])

        setParticipants(data || [])
        setEventStartAt(toEventStartDate(eventData?.start_date, eventData?.start_time))
        await refreshNoShows()
      } catch (err) {
        setParticipants([])
        setNoShows([])
        setEventStartAt(null)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [eventId])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  
  // ✅ stable ordering by session and natural name order
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.session_id !== b.session_id) {
      return a.session_id.localeCompare(b.session_id)
    }

    if (a.checked_in !== b.checked_in) {
      return a.checked_in ? -1 : 1
    }

    const lastNameComparison = a.last_name.localeCompare(b.last_name)
    if (lastNameComparison !== 0) {
      return lastNameComparison
    }

    return a.first_name.localeCompare(b.first_name)
  })


  // Debug: log all unique session IDs
  const uniqueSessionIds = Array.from(new Set(sortedParticipants.map(p => p.session_id)));


  // Only keep groups for the two most common session IDs
  const sessionIdCounts = sortedParticipants.reduce((acc, p) => {
    acc[p.session_id] = (acc[p.session_id] || 0) + 1;
    return acc;
  }, {});
  const topSessionIds = Object.entries(sessionIdCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => id);

  const groupedParticipants = topSessionIds.map(sessionId =>
    sortedParticipants.filter(p => p.session_id === sessionId)
  );

  const isSessionFull = (sessionId) => {
    const count = participants.filter(p => p.session_id === sessionId).length
    return count >= 15
  }

  const getSessionStatus = (sessionId) => {
    const count = participants.filter(p => p.session_id === sessionId).length
    if (count >= 15) return { status: 'Full', emoji: '🔴', color: 'text-red-500' }
    if (count >= 13) return { status: 'Almost Full', emoji: '🟡', color: 'text-yellow-500' }
    return { status: 'Open', emoji: '🟢', color: 'text-green-500' }
  }

  const formatCountdown = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    }

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  const getSessionSoftStatus = (sessionIndex, group) => {
    if (eventStartAt) {
      const sessionStartMs = eventStartAt.getTime() + (sessionIndex * 60 * 60 * 1000)
      const remainingMs = sessionStartMs - nowMs

      if (remainingMs > 0) {
        return {
          text: `Session starts in: ${formatCountdown(remainingMs)}`,
          className: "text-blue-700",
        }
      }
    }

    const notCheckedInCount = group.filter((p) => !p.checked_in && !p.is_waitlisted).length
    if (notCheckedInCount > 0) {
      return {
        text: `⚠️ ${notCheckedInCount} participant${notCheckedInCount === 1 ? "" : "s"} not checked in`,
        className: "text-amber-700",
      }
    }

    return {
      text: "🟢 All non-waitlisted participants checked in",
      className: "text-green-700",
    }
  }

  const toggleEventMode = () => {
    setEventMode((prev) => {
      const next = !prev
      localStorage.setItem(EVENT_MODE_KEY, next ? "on" : "off")
      return next
    })
  }

  // ✅ stable move logic extracted to a function
  async function handleMoveParticipant(id, targetSessionId) {
    setParticipants(prev =>
      prev.map(p =>
        String(p.id) === String(id)
          ? { ...p, session_id: targetSessionId, is_waitlisted: false }
          : p
      )
    )

    await updateParticipantSession(id, targetSessionId)
  }

  // ✅ stable drag handlers with proper multi-select logic
  function handleDragStart(event) {
    setActiveId(String(event.active.id))
    setDragError(null)
  }

  // ✅ stable drag end logic with proper multi-select handling
  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = String(active.id)

    if (!String(over.id).startsWith("session-")) return

    const targetSessionId = over.id.replace("session-", "")

    const idsToMove = selectedIds.includes(activeId)
      ? selectedIds
      : [activeId]

    // Check if target session has capacity
    const currentInSession = participants.filter(p => p.session_id === targetSessionId).length
    if (currentInSession + idsToMove.length > 15) {
      // Session would exceed capacity
      setDragError("Cannot move to full session")
      return
    }

    try {
      for (const id of idsToMove) {
        await handleMoveParticipant(id, targetSessionId)
      }
    } catch (err) {
      console.error("Move failed", err)
    }

    setSelectedIds([])
  }

  function DroppableSession({ sessionId, children }) {
    const { setNodeRef } = useDroppable({
      id: `session-${sessionId}`,
    })

    return (
      <div
        ref={setNodeRef}
        className={`bg-white rounded-xl border p-4 min-h-[120px] ${isSessionFull(sessionId) ? 'border-red-500 bg-red-100' : ''}`}
      >
        {isSessionFull(sessionId) && (
          <div className="text-red-500 font-bold text-center mb-2">FULL</div>
        )}
        {children}
      </div>
    )
  }

  // ✅ stable component with proper selection logic
  function DraggableParticipant({ p }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: String(p.id),
    });
    const isActive = activeId === String(p.id);
    const isSelected = selectedIds.includes(String(p.id));
    const isGroupDragging = selectedIds.includes(activeId);
    const index = selectedIds.indexOf(String(p.id));
    const appliedTransform =
      transform && isActive
        ? transform
        : isGroupDragging && isSelected
        ? activeTransform
        : null;
    const style = {
      transform: appliedTransform
        ? `translate3d(${appliedTransform.x + index * 4}px, ${
            appliedTransform.y + index * 4
          }px, 0)`
        : undefined,
      zIndex: isActive ? 1000 : "auto",
    };
    // Clamp priority between 1 and 3 (0 = unset)
    const minPriority = 1;
    const maxPriority = 3;
    const clampedPriority = Math.max(0, Math.min(maxPriority, p.priority));
    let dotColor = "bg-gray-500";
    if (clampedPriority === 1) dotColor = "bg-red-500";
    else if (clampedPriority === 2) dotColor = "bg-amber-400";
    else if (clampedPriority === 3) dotColor = "bg-gray-500";
    else if (clampedPriority === 0) dotColor = "bg-gray-300";
    // Priority arrow controls
    const handlePriorityChange = async (delta) => {
      let newPriority = clampedPriority + delta;
      if (newPriority < 1) newPriority = 1;
      if (newPriority > 3) newPriority = 3;
      await updateParticipantPriority(p.id, newPriority);
      setParticipants(prev => prev.map(part =>
        part.id === p.id ? { ...part, priority: newPriority } : part
      ));
    };
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          const id = String(p.id);
          setSelectedIds(prev => {
            if (e.ctrlKey || e.metaKey) {
              if (prev.includes(id)) {
                return prev.filter(i => i !== id);
              }
              return [...prev, id];
            }
            return [id];
          });
        }}
        className={`select-none cursor-grab w-full px-3 py-2 rounded-lg text-sm border ${
          selectedIds.includes(String(p.id))
            ? "bg-blue-100 border-blue-500"
            : "bg-gray-50"
        }`}
      >
        <div className="font-medium">
          {p.first_name} {p.last_name}
        </div>
        <div className="text-xs text-gray-500">
          {p.email}
        </div>
        <div className="mt-1 text-xs font-medium space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${
                p.checked_in
                  ? "bg-green-500"
                  : p.is_waitlisted
                  ? "bg-yellow-400"
                  : "bg-red-500"
              }`}
            />
            <span className={p.checked_in ? "text-green-700" : p.is_waitlisted ? "text-yellow-700" : "text-red-700"}>
              {p.checked_in ? "Checked In" : p.is_waitlisted ? "Waitlisted" : "Not Checked In"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full border border-gray-300 ${
                p.waiver_verified ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className={p.waiver_verified ? "text-green-700" : "text-red-700"}>
              {p.waiver_verified ? "Waiver Verified" : "Waiver Pending"}
            </span>
          </div>
        </div>
        {!eventMode && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs flex items-center gap-2">
              Priority:
              <span className={`inline-block w-4 h-4 rounded-full border-2 ${dotColor} border-gray-300`} />
            </span>
          </div>
        )}
      </div>
    );
  }

  if (loading) return <div className="p-6">Loading...</div>

  return (
    <div className="relative p-6 space-y-6" onClick={() => setSelectedIds([])}>

      {/* Drag error notification at top of page */}
      {dragError && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded shadow-lg z-50 flex items-center gap-4">
          <span>{dragError}</span>
          <button
            onClick={() => setDragError(null)}
            className="ml-2 px-2 py-1 bg-white text-red-600 rounded hover:bg-gray-100 text-xs font-semibold border border-red-200"
            title="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      <h1 className="text-2xl font-semibold flex items-center gap-4">
        Event Participants
        <button
          onClick={toggleEventMode}
          className={`ml-2 px-3 py-1 rounded text-sm font-semibold ${eventMode ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"}`}
          title="Toggle simplified event-day UI"
        >
          Event Mode {eventMode ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => { refreshParticipants(); refreshNoShows(); }}
          className="ml-2 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          title="Refresh participants"
        >
          ↻ Refresh
        </button>
      </h1>

      {!eventMode && <PriorityLegend />}

      {!eventMode && (
        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold">No-Show Candidates:</span>
            <span className="text-red-600 font-bold">{noShows.length}</span>
          </div>
          <button
            onClick={handlePromoteNoShows}
            disabled={promoteLoading || noShows.length === 0}
            className={`px-4 py-2 rounded text-white ${promoteLoading || noShows.length === 0 ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {promoteLoading ? 'Promoting...' : 'Promote Waitlist to Fill No-Shows'}
          </button>
          {noShowError && <span className="text-red-500 text-sm">{noShowError}</span>}
        </div>
      )}

      <button
        onClick={() => navigate(`/events/${eventId}/checkin`)}
        className={`w-full bg-green-600 text-white rounded-xl font-semibold ${eventMode ? "py-6 text-2xl" : "py-4"}`}
      >
        ✔ Start Event Check-In
      </button>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={(event) => {
          if (event.delta) setActiveTransform(event.delta)
        }}
        onDragEnd={(event) => {
          setActiveTransform(null)
          handleDragEnd(event)
        }}
        onDragCancel={() => setActiveTransform(null)}
      >

        {/* Debug: log groupedParticipants structure */}


        <div className="grid md:grid-cols-2 gap-6">
          {groupedParticipants.map((group, idx) => {
            const sessionId = group[0]?.session_id;
            const softStatus = getSessionSoftStatus(idx, group)
            return (
              <DroppableSession key={sessionId} sessionId={sessionId}>
                <div className="flex justify-between mb-2">
                  <h3 className="font-semibold">Session {idx + 1} {getSessionStatus(sessionId).emoji}</h3>
                  <span className={getSessionStatus(sessionId).color}>{group.length} / 15</span>
                </div>
                <div className={`mb-3 text-xs font-medium ${softStatus.className}`}>
                  {softStatus.text}
                </div>
                {/* Render draggable participant cards for this session */}
                <div className="space-y-2">
                  {group.map(p => (
                    <DraggableParticipant key={p.id} p={p} />
                  ))}
                </div>
              </DroppableSession>
            );
          })}
        </div>

        {/* Shows stacked cards while dragging multiple items */}
        <DragOverlay>
          {activeId ? (
            selectedIds.includes(activeId) && selectedIds.length > 1 ? (
              <div className="relative">
                {selectedIds.slice(0, 3).map((id, index) => {
                  const p = participants.find(x => String(x.id) === id)
                  if (!p) return null

                  return (
                    <div
                      key={id}
                      className="absolute bg-white shadow-xl rounded-lg px-3 py-2 border text-sm w-48"
                      style={{
                        top: index * 6,
                        left: index * 6,
                        zIndex: 100 - index,
                        opacity: 1 - index * 0.2,
                      }}
                    >
                      <div className="font-medium">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.email}
                      </div>
                    </div>
                  )
                })}

                {selectedIds.length > 3 && (
                  <div
                    className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded"
                    style={{ top: 22, left: 22 }}
                  >
                    +{selectedIds.length - 3}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white shadow-xl rounded-lg px-3 py-2 border text-sm">
                {
                  participants.find(p => String(p.id) === activeId)?.first_name
                }{" "}
                {
                  participants.find(p => String(p.id) === activeId)?.last_name
                }
              </div>
            )
          ) : null}
        </DragOverlay>

      </DndContext>

      {dragError && (
        <div className="mt-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {dragError}
        </div>
      )}
    </div>
  )
}
export default EventDetail