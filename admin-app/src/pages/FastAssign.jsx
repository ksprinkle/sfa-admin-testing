import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  fetchAdminEvent,
  fetchEventParticipants,
  fetchEventSessionStats,
  fetchRecommendedSessions,
  updateParticipantSession,
  evaluateMultipleAssignments,
  moveParticipantToWaitlist,
} from "../api/events"
import Card from "../components/Card"
import Button from "../components/Button"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortByPriority(participants) {
  return [...participants].sort((a, b) => {
    const pa = a.priority ?? 99
    const pb = b.priority ?? 99
    if (pa !== pb) return pa - pb
    return (a.created_at || "") < (b.created_at || "") ? -1 : 1
  })
}

function isUnassignedParticipant(p) {
  return (
    p.role === "participant" &&
    !p.session_id &&
    !p.is_waitlisted &&
    !p.is_removed
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Flag({ label, color }) {
  const palette = {
    amber: "bg-amber-100 text-amber-800 border-amber-300",
    blue: "bg-blue-100 text-blue-800 border-blue-300",
    red: "bg-red-100 text-red-800 border-red-300",
  }
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 text-sm font-medium ${palette[color] ?? palette.blue}`}
    >
      {label}
    </span>
  )
}

function ParticipantCard({ participant, queueLen }) {
  const { first_name, last_name, is_minor, needs_assistance, priority } = participant
  const priorityLabel = priority === 1 ? "High" : priority === 2 ? "Medium" : priority === 3 ? "Low" : null

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-secondary">
        Next up {queueLen > 1 ? `· ${queueLen} remaining` : "· last one"}
      </p>
      <h2 className="mt-1 text-3xl font-bold text-gray-900 leading-tight">
        {first_name} {last_name}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {is_minor && <Flag label="Minor" color="amber" />}
        {needs_assistance && <Flag label="Needs assistance" color="blue" />}
        {priorityLabel && (
          <Flag
            label={`Priority: ${priorityLabel}`}
            color={priority === 1 ? "red" : priority === 2 ? "amber" : "blue"}
          />
        )}
      </div>
    </Card>
  )
}

// status: "good" | "warn" | "avoid" | null (null = not yet evaluated / full)
const STATUS_STYLES = {
  good: {
    button: "bg-[var(--color-success)] hover:brightness-95 active:brightness-90 text-white",
    sub: "text-white/85",
    label: "Good",
  },
  warn: {
    button: "bg-[var(--color-warning)] hover:brightness-95 active:brightness-90 text-white",
    sub: "text-white/85",
    label: "Caution",
  },
  avoid: {
    button: "bg-[var(--color-danger)] hover:brightness-95 active:brightness-90 text-white",
    sub: "text-white/85",
    label: "Avoid",
  },
  full: {
    button: "cursor-not-allowed bg-gray-100 text-gray-400",
    sub: "text-gray-400",
    label: null,
  },
  loading: {
    button: "bg-indigo-400 text-white",
    sub: "text-indigo-200",
    label: null,
  },
}

const FLASH_DURATION_MS = 700
const UNDO_WINDOW_MS = 5000

function SessionButton({ session, evalStatus, isBest, keyHint, onAssign, loading }) {
  const { name, current_count, capacity } = session
  const filled = current_count ?? 0
  const cap = capacity || 0
  const full = cap > 0 && filled >= cap

  const styleKey = full ? "full" : evalStatus ?? "loading"
  const styles = STATUS_STYLES[styleKey] ?? STATUS_STYLES.loading

  const capacityLabel = cap > 0 ? `${filled} / ${cap}` : "—"
  const available = cap - filled
  const spotsLabel = full
    ? "Full"
    : evalStatus === null
    ? capacityLabel
    : `${capacityLabel} · ${available} open`

  return (
    <button
      onClick={() => !full && !loading && onAssign(session.session_id ?? session.id)}
      disabled={full || loading}
      className={`w-full rounded-xl px-4 py-4 text-left transition-colors ${styles.button} ${
        isBest && !full ? "ring-4 ring-white/60 ring-offset-1" : ""
      }`}
    >
        <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold leading-tight">
          {isBest && !full && <span className="mr-1.5 text-white/80">★</span>}
          {name}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {keyHint && (
            <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${full ? "bg-gray-200 text-gray-400" : "bg-black/20 text-white/80"}`}>
              {keyHint}
            </span>
          )}
          {styles.label && (
            <span className={`text-xs font-semibold uppercase tracking-wide ${styles.sub}`}>
              {styles.label}
            </span>
          )}
        </div>
      </div>
      <span className={`block text-sm mt-0.5 ${styles.sub}`}>{spotsLabel}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FastAssign() {
  const { eventId } = useParams()
  const navigate = useNavigate()

  const [queue, setQueue] = useState([])       // unassigned participants, sorted
  const [totalCount, setTotalCount] = useState(0) // initial queue size for progress bar
  const [eventInfo, setEventInfo] = useState(null)
  const [allSessions, setAllSessions] = useState([])
  const [recommendations, setRecommendations] = useState([])
  // evalBySession: Map<sessionId, "good"|"warn"|"avoid"> — populated after recs load
  const [evalBySession, setEvalBySession] = useState({})
  const [recsLoading, setRecsLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [flash, setFlash] = useState(null)     // { name, sessionName } | null
  const [failureFlash, setFailureFlash] = useState("")
  const [undoVisible, setUndoVisible] = useState(false)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")

  // Race-condition guard: discard stale recommendation responses
  const recRequestIdRef = useRef(0)
  const preloadedRecsRef = useRef(new Map())
  const preloadingRecsRef = useRef(new Map())
  const allSessionsRef = useRef([])
  const assignmentGenerationRef = useRef(0)
  const lastAssignmentRef = useRef(null)
  const undoTimerRef = useRef(null)
  const lastKeyTimeRef = useRef(0)

  const current = queue[0] ?? null
  const hasRecommendations = recommendations.length > 0
  const displayedSessions = hasRecommendations ? recommendations : allSessions
  const noRecommendationsFallback = !recsLoading && !hasRecommendations && allSessions.length > 0
  const showConstrainedBanner =
    !recsLoading &&
    displayedSessions.length > 0 &&
    displayedSessions.every((rec) => {
      const sid = String(rec.session_id ?? rec.id ?? "")
      const status = evalBySession[sid] ?? null
      const filled = Number(rec.current_count ?? 0)
      const cap = Number(rec.capacity ?? 0)
      const full = cap > 0 && filled >= cap
      const nearlyFull = cap > 0 && cap - filled <= 1
      return status === "avoid" || full || nearlyFull
    })

  async function fetchRecommendationBundle(participantId) {
    const recs = await fetchRecommendedSessions(participantId)
    const list = Array.isArray(recs) ? recs : []
    const sessionsForEvaluation = list.length > 0 ? list : allSessionsRef.current
    const sessionIds = sessionsForEvaluation
      .map((rec) => String(rec.session_id ?? rec.id ?? ""))
      .filter(Boolean)

    let statuses = {}
    if (sessionIds.length > 0) {
      const results = await evaluateMultipleAssignments(participantId, sessionIds)
      statuses = Object.fromEntries(
        Object.entries(results).map(([sid, result]) => [sid, result?.status ?? "good"])
      )
    }

    return { recommendations: list, evalBySession: statuses }
  }

  function setSinglePrefetchBundle(participantId, bundle) {
    const key = String(participantId)
    preloadedRecsRef.current = new Map([[key, bundle]])
  }

  function getOrFetchRecommendationBundle(participantId) {
    const key = String(participantId)
    const cached = preloadedRecsRef.current.get(key)
    if (cached) {
      preloadedRecsRef.current.delete(key)
      return Promise.resolve(cached)
    }

    const inFlight = preloadingRecsRef.current.get(key)
    if (inFlight) return inFlight

    const promise = fetchRecommendationBundle(participantId)
      .then((bundle) => {
        setSinglePrefetchBundle(key, bundle)
        return bundle
      })
      .finally(() => {
        preloadingRecsRef.current.delete(key)
      })

    preloadingRecsRef.current.set(key, promise)
    return promise
  }

  function preloadRecommendations(participant) {
    const participantId = participant?.id
    if (!participantId) return
    void getOrFetchRecommendationBundle(participantId).catch(() => {
      // Prefetch is opportunistic only.
    })
  }

  function clearUndoWindow() {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    lastAssignmentRef.current = null
    setUndoVisible(false)
  }

  function startUndoWindow(assignment) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    lastAssignmentRef.current = assignment
    setUndoVisible(true)
    undoTimerRef.current = setTimeout(() => {
      lastAssignmentRef.current = null
      setUndoVisible(false)
      undoTimerRef.current = null
    }, UNDO_WINDOW_MS)
  }

  // ------------------------------------------------------------------
  // Initial load
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    preloadedRecsRef.current = new Map()
    preloadingRecsRef.current = new Map()

    async function load() {
      try {
        const [eventData, participantData, statsPayload] = await Promise.all([
          fetchAdminEvent(eventId),
          fetchEventParticipants(eventId),
          fetchEventSessionStats(eventId),
        ])
        if (cancelled) return

        setEventInfo(eventData)
        const unassigned = sortByPriority(
          (Array.isArray(participantData) ? participantData : []).filter(isUnassignedParticipant)
        )
        const sessions = Array.isArray(statsPayload?.sessions) ? statsPayload.sessions : []
        setQueue(unassigned)
        setTotalCount(unassigned.length)
        setAllSessions(sessions)
        allSessionsRef.current = sessions
      } catch {
        if (!cancelled) setLoadError("Could not load participants. Check connection and try again.")
      }
    }

    load()
    return () => { cancelled = true }
  }, [eventId])

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  // ------------------------------------------------------------------
  // Fetch recommendations whenever the current participant changes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!current) {
      setRecommendations([])
      setEvalBySession({})
      return
    }

    const requestId = ++recRequestIdRef.current
    setRecsLoading(true)
    setRecommendations([])
    setEvalBySession({})
    setError("")

    getOrFetchRecommendationBundle(current.id)
      .then((bundle) => {
        if (requestId !== recRequestIdRef.current) return
        preloadedRecsRef.current.delete(String(current.id))
        setRecommendations(bundle.recommendations)
        setEvalBySession(bundle.evalBySession)
        preloadRecommendations(queue[1] ?? null)
      })
      .catch(() => {
        if (requestId !== recRequestIdRef.current) return
        setError("Could not load session recommendations.")
      })
      .finally(() => {
        if (requestId === recRequestIdRef.current) setRecsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  // ------------------------------------------------------------------
  // Assign handler
  // ------------------------------------------------------------------
  async function handleAssign(sessionId) {
    if (!current || assigning) return
    setAssigning(true)
    setError("")
    setFailureFlash("")
    preloadRecommendations(queue[1] ?? null)

    const participantName = `${current.first_name} ${current.last_name}`
    const sessionName =
      recommendations.find((r) => String(r.session_id ?? r.id) === String(sessionId))?.name ??
      "selected session"

    try {
      await updateParticipantSession(current.id, sessionId)
      assignmentGenerationRef.current += 1
      startUndoWindow({
        generation: assignmentGenerationRef.current,
        participant: current,
        sessionId,
        sessionName,
      })
      setQueue((prev) => prev.slice(1))
      setFlash({ name: participantName, sessionName })
      setTimeout(() => setFlash(null), FLASH_DURATION_MS)
    } catch {
      setFailureFlash("Assignment failed")
      setTimeout(() => setFailureFlash(""), FLASH_DURATION_MS)
      setError("Assignment failed. Try again.")
    } finally {
      setAssigning(false)
    }
  }

  // ------------------------------------------------------------------
  // Skip (send to end of queue)
  // ------------------------------------------------------------------
  function handleSkip() {
    if (!current) return
    preloadRecommendations(queue[1] ?? null)
    setQueue((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev))
  }

  // ------------------------------------------------------------------
  // Waitlist — marks participant as waitlisted and removes from queue
  // ------------------------------------------------------------------
  async function handleWaitlist() {
    if (!current || assigning) return
    setAssigning(true)
    setError(null)
    preloadRecommendations(queue[1] ?? null)
    try {
      await moveParticipantToWaitlist(current.id)
      clearUndoWindow()
      setFlash({ name: `${current.first_name} ${current.last_name}`, sessionName: "Waitlist" })
      setQueue((prev) => prev.slice(1))
      setTimeout(() => setFlash(null), FLASH_DURATION_MS)
    } catch {
      setError("Waitlist failed. Try again.")
    } finally {
      setAssigning(false)
    }
  }

  async function handleUndoLast() {
    const last = lastAssignmentRef.current
    if (!last || assigning) return
    if (last.generation !== assignmentGenerationRef.current) return

    setAssigning(true)
    setError("")
    try {
      await updateParticipantSession(last.participant.id, null)
      setQueue((prev) => sortByPriority([last.participant, ...prev]))
      setFlash({
        name: `${last.participant.first_name} ${last.participant.last_name}`,
        sessionName: "Unassigned",
      })
      setTimeout(() => setFlash(null), FLASH_DURATION_MS)
      clearUndoWindow()
    } catch {
      setError("Undo failed. Try again.")
    } finally {
      setAssigning(false)
    }
  }

  // ------------------------------------------------------------------
  // Keyboard shortcuts: 1–9 → session by index, Enter → best session
  // ------------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(e) {
      const now = Date.now()
      if (now - lastKeyTimeRef.current < 250) return
      lastKeyTimeRef.current = now

      // Ignore when focus is inside an input/textarea/select
      const tag = document.activeElement?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      const actionableSessions = recommendations.length > 0 ? recommendations : allSessions
      if (!current || assigning || recsLoading || actionableSessions.length === 0) return

      if (e.key === "Enter") {
        const best = actionableSessions[0]
        if (best) handleAssign(best.session_id ?? best.id)
        return
      }

      if (e.key === "s" || e.key === "S") {
        handleSkip()
        return
      }

      if (e.key === "w" || e.key === "W") {
        handleWaitlist()
        return
      }

      const index = parseInt(e.key, 10)
      if (Number.isFinite(index) && index >= 1 && index <= 9) {
        const rec = actionableSessions[index - 1]
        if (rec) handleAssign(rec.session_id ?? rec.id)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, assigning, recsLoading, recommendations, allSessions, handleWaitlist])

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const eventTitle = eventInfo?.title ?? "Event"

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-[1100px] p-4">
        <Card className="text-center">
          <p className="text-red-600 font-medium mb-4">{loadError}</p>
          <Button variant="neutral" onClick={() => navigate(-1)}>
            ← Back
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-5">
      <Card>
        <div className="flex items-center gap-3">
          <Button variant="neutral" onClick={() => navigate(`/events/${eventId}`)} className="px-2.5 py-1.5" aria-label="Back to event">
            ←
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[var(--text-secondary)]">{eventTitle}</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Fast Assign</p>
          </div>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
            {queue.length} remaining
          </span>
        </div>

        {totalCount > 0 && (
          <div className="mt-3 h-1 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-1 bg-indigo-500 transition-all duration-300"
              style={{ width: `${Math.round(((totalCount - queue.length) / totalCount) * 100)}%` }}
            />
          </div>
        )}
      </Card>

      <div className="mx-auto w-full max-w-2xl space-y-4">

        {/* Flash confirmation */}
        {flash && (
          <Card className={`text-center font-medium text-sm animate-pulse border ${
            flash.sessionName === "Waitlist"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-green-50 border-green-200 text-green-800"
          }`}>
            ✓ {flash.name} → {flash.sessionName}
          </Card>
        )}

        {failureFlash && (
          <Card className="border border-red-200 bg-red-50 text-center text-sm font-medium text-red-700 animate-pulse">
            {failureFlash}
          </Card>
        )}

        {undoVisible && lastAssignmentRef.current && (
          <Card className="border border-indigo-200 bg-indigo-50 text-sm text-indigo-900">
            <div className="flex items-center justify-between gap-3">
            <span className="truncate">
              Assigned {lastAssignmentRef.current.participant.first_name} {lastAssignmentRef.current.participant.last_name} → {lastAssignmentRef.current.sessionName}
            </span>
            <Button variant="neutral" onClick={handleUndoLast} disabled={assigning} className="shrink-0 px-2.5 py-1 text-xs">
              Undo
            </Button>
            </div>
          </Card>
        )}

        {/* Done state */}
        {!current && !flash && (
          <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <span className="text-5xl">🏄</span>
            <p className="text-xl font-bold text-gray-800">All caught up!</p>
            <p className="text-sm text-secondary">No unassigned participants remaining.</p>
            <Button variant="primary" onClick={() => navigate(`/events/${eventId}`)} className="mt-2 px-6 py-3 text-sm font-semibold">
              Back to event board
            </Button>
          </Card>
        )}

        {/* Active participant card */}
        {current && (
          <>
            <ParticipantCard participant={current} queueLen={queue.length} />

            {/* Session buttons */}
            <Card header={<Card.Header>Sessions</Card.Header>}>
              <div className="space-y-2.5">
              {recsLoading && (
                <p className="text-center text-sm text-secondary py-4">Loading sessions…</p>
              )}

              {!recsLoading && recommendations.length === 0 && allSessions.length === 0 && !error && (
                <p className="text-center text-sm text-secondary py-4">No session recommendations available.</p>
              )}

              {error && (
                <p className="text-center text-sm text-red-500 py-2">{error}</p>
              )}

              {noRecommendationsFallback && !error && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                  No clear recommendation — choose best available
                </div>
              )}

              {showConstrainedBanner && !error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  All sessions are constrained — proceed carefully
                </div>
              )}

              {!recsLoading &&
                displayedSessions.map((rec, index) => {
                  const sid = String(rec.session_id ?? rec.id ?? "")
                  const keyHint = index === 0 ? "↵" : index < 9 ? String(index + 1) : null
                  return (
                    <SessionButton
                      key={sid}
                      session={rec}
                      evalStatus={evalBySession[sid] ?? null}
                      isBest={hasRecommendations && index === 0}
                      keyHint={keyHint}
                      onAssign={handleAssign}
                      loading={assigning}
                    />
                  )
                })}
              </div>
            </Card>

            {/* Secondary actions: Skip + Waitlist */}
            <Card>
              <div className="grid grid-cols-2 gap-2.5">
              <Button
                variant="neutral"
                onClick={handleSkip}
                disabled={assigning || queue.length <= 1}
                className="py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"
              >
                <span>Skip</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-400">S</span>
              </Button>
              <Button
                variant="warning"
                onClick={handleWaitlist}
                disabled={assigning}
                className="py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"
              >
                <span>Waitlist</span>
                <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs text-white/90">W</span>
              </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
