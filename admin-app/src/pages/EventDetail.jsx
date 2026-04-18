import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { fetchEventParticipants, updateParticipantSession, updateParticipantPriority } from "../api/events"

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

function EventDetail() {
  const navigate = useNavigate()
  const { eventId } = useParams()

  const [participants, setParticipants] = useState([])
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

    // ✅ stable async function defined inside useEffect
    async function loadParticipants() {
      try {
        const data = await fetchEventParticipants(eventId)
        setParticipants(data || [])
      } catch (err) {
        console.error("Failed loading participants", err)
        setParticipants([])
      } finally {
        setLoading(false)
      }
    }

    loadParticipants()
  }, [eventId])

  
  // ✅ stable ordering by session and natural name order
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.session_id !== b.session_id) {
      return a.session_id.localeCompare(b.session_id)
    }

    const lastNameComparison = a.last_name.localeCompare(b.last_name)
    if (lastNameComparison !== 0) {
      return lastNameComparison
    }

    return a.first_name.localeCompare(b.first_name)
  })

  const groupedParticipants = Object.values(
    sortedParticipants.reduce((acc, p) => {
      if (!acc[p.session_id]) acc[p.session_id] = []
      acc[p.session_id].push(p)
      return acc
    }, {})
  )

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
    })

    const isActive = activeId === String(p.id)
    const isSelected = selectedIds.includes(String(p.id))
    const isGroupDragging = selectedIds.includes(activeId)

    const index = selectedIds.indexOf(String(p.id))

    // 👇 use ACTIVE transform for ALL selected
    const appliedTransform =
      transform && isActive
        ? transform
        : isGroupDragging && isSelected
        ? activeTransform
        : null

    const style = {
      transform: appliedTransform
        ? `translate3d(${appliedTransform.x + index * 4}px, ${
            appliedTransform.y + index * 4
          }px, 0)`
        : undefined,
      zIndex: isActive ? 1000 : "auto",
    }
    
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={style}
        onClick={(e) => {
          e.stopPropagation()
          const id = String(p.id)

          setSelectedIds(prev => {
            // Ctrl / Cmd = multi-select toggle
            if (e.ctrlKey || e.metaKey) {
              if (prev.includes(id)) {
                return prev.filter(i => i !== id)
              }
              return [...prev, id]
            }

            // normal click = single select
            return [id]
          })
        }}
        className={`select-none cursor-grab w-full px-3 py-2 rounded-lg text-sm border
          ${
            selectedIds.includes(String(p.id))
              ? "bg-blue-100 border-blue-500"
              : "bg-gray-50"
          }
        `}
      >
        <div className="font-medium">
          {p.first_name} {p.last_name}
        </div>
        <div className="text-xs text-gray-500">
          {p.email}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs flex items-center gap-1">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                p.priority === 1
                  ? "bg-red-500"
                  : p.priority === 2
                  ? "bg-yellow-400"
                  : "bg-gray-300"
              }`}
            />
            Priority: {p.priority}
          </span>
          <div className="flex space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateParticipantPriority(p.id, p.priority - 1).then(() => {
                  setParticipants(prev => prev.map(part => 
                    part.id === p.id ? { ...part, priority: part.priority - 1 } : part
                  ))
                })
              }}
              className="text-xs bg-gray-200 px-1 rounded hover:bg-gray-300"
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateParticipantPriority(p.id, p.priority + 1).then(() => {
                  setParticipants(prev => prev.map(part => 
                    part.id === p.id ? { ...part, priority: part.priority + 1 } : part
                  ))
                })
              }}
              className="text-xs bg-gray-200 px-1 rounded hover:bg-gray-300"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (loading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 space-y-6" onClick={() => setSelectedIds([])}>
      <h1 className="text-2xl font-semibold">Event Participants</h1>

      <button
        onClick={() => navigate(`/events/${eventId}/checkin`)}
        className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold"
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
        <div className="grid md:grid-cols-2 gap-6">
          {groupedParticipants.map((group, idx) => {
            const sessionId = group[0]?.session_id

            return (
              <DroppableSession key={sessionId} sessionId={sessionId}>
                <div className="flex justify-between mb-2">
                  <h3 className="font-semibold">Session {idx + 1} {getSessionStatus(sessionId).emoji}</h3>
                  <span className={getSessionStatus(sessionId).color}>{group.length} / 15</span>
                </div>

                <div className="space-y-2">
                  {group.map(p => (
                    <DraggableParticipant key={p.id} p={p} />
                  ))}
                </div>
              </DroppableSession>
            )
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