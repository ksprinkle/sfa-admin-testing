import { useEffect, useMemo, useRef, useState } from "react"
import { evaluateAssignment, fetchEventSessionStats, fetchRecommendedSessions } from "../api/events"
import SessionIndicators from "./SessionIndicators"
import SessionLoadBar from "./SessionLoadBar"

const ROLE_OPTIONS = [
  { value: "participant", label: "Participant" },
  { value: "volunteer", label: "Volunteer" },
]

const VOLUNTEER_TYPE_CONFIG = {
  chapter: [
    { value: "beach", label: "Beach" },
    { value: "water", label: "Water" },
  ],
  tour: [
    { value: "beach", label: "Beach" },
    { value: "water", label: "Water" },
    { value: "food", label: "Food" },
    { value: "raffle", label: "Raffle" },
  ],
}

const ADDITIONAL_TYPE_LABELS = {
  buddy: "Buddy",
  instructor: "Instructor",
  spotter: "Spotter",
  board_rescue: "Board Rescue",
  lifeguard: "Lifeguard",
  registration: "Registration",
  setup_teardown: "Setup/Tear Down",
  equipment_handling: "Equipment Handling",
  snacks_drinks: "Snacks/Drinks",
}

const VOLUNTEER_TYPE_TO_ADDITIONAL = {
  beach: ["registration", "setup_teardown", "equipment_handling", "snacks_drinks"],
  water: ["buddy", "instructor", "spotter", "board_rescue", "lifeguard"],
  food: [],
  raffle: [],
}

const VOLUNTEER_PRIMARY_PRIORITY = ["water", "beach", "food", "raffle"]

const WATER_ROLE_KEYS = new Set(["buddy", "instructor", "spotter", "board_rescue", "lifeguard"])
const BEACH_ROLE_KEYS = new Set(["registration", "setup_teardown", "equipment_handling", "snacks_drinks", "beach"])

const LAST_SESSION_BY_EVENT_KEY = "sfa.participantForm.lastSessionByEvent"

function toNumberOrNull(value) {
  const trimmed = String(value || "").trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function getRememberedSessionId(eventId) {
  const key = String(eventId || "")
  if (!key) return ""

  try {
    const raw = localStorage.getItem(LAST_SESSION_BY_EVENT_KEY)
    if (!raw) return ""
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return ""
    return String(parsed[key] || "")
  } catch {
    return ""
  }
}

function saveRememberedSessionId(eventId, sessionId) {
  const key = String(eventId || "")
  if (!key) return

  try {
    const raw = localStorage.getItem(LAST_SESSION_BY_EVENT_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const next = parsed && typeof parsed === "object" ? parsed : {}
    next[key] = String(sessionId || "")
    localStorage.setItem(LAST_SESSION_BY_EVENT_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures.
  }
}

function getSelectedValues(selectElement) {
  return Array.from(selectElement?.selectedOptions || [])
    .map((option) => String(option.value || "").trim().toLowerCase())
    .filter(Boolean)
}

function normalizeEventType(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase()
  if (normalized === "chapter") return "chapter"
  if (normalized === "tour") return "tour"
  return null
}

function getSearchParamEventType() {
  try {
    if (typeof window === "undefined") return ""
    return String(new URLSearchParams(window.location.search).get("event_type") || "")
      .trim()
      .toLowerCase()
  } catch {
    return ""
  }
}

function buildAdditionalOptions(selectedVolunteerTypes) {
  const merged = Array.from(
    new Set(
      (selectedVolunteerTypes || []).flatMap((volunteerType) => VOLUNTEER_TYPE_TO_ADDITIONAL[volunteerType] || [])
    )
  )
  return merged.map((value) => ({ value, label: ADDITIONAL_TYPE_LABELS[value] || value }))
}

function roleKeyToVolunteerType(roleKey) {
  const normalized = String(roleKey || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "food" || normalized === "raffle") return normalized
  if (normalized === "water" || WATER_ROLE_KEYS.has(normalized)) return "water"
  if (BEACH_ROLE_KEYS.has(normalized)) return "beach"
  return null
}

function deriveVolunteerTypes(initialData) {
  const sources = [
    initialData?.volunteer_type,
    ...(Array.isArray(initialData?.volunteer_additional_types) ? initialData.volunteer_additional_types : []),
  ]

  return Array.from(
    new Set(
      sources
        .map((value) => roleKeyToVolunteerType(value))
        .filter(Boolean)
    )
  )
}

function getPrimaryVolunteerType(selectedVolunteerTypes) {
  const normalized = Array.from(
    new Set((Array.isArray(selectedVolunteerTypes) ? selectedVolunteerTypes : []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))
  )
  if (!normalized.length) return null

  for (const type of VOLUNTEER_PRIMARY_PRIORITY) {
    if (normalized.includes(type)) return type
  }

  return normalized[0]
}

export default function ParticipantForm({
  isOpen,
  onClose,
  onSubmit,
  onEventChange,
  eventOptions = [],
  sessions = [],
  eventType = "",
  defaultEventId = "",
  initialData = null,
  lockEvent = false,
  title = "Add Participant",
  submitLabel = "Add Participant",
  projectionBySession = {},
}) {
  const [eventId, setEventId] = useState(defaultEventId || "")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("participant")
  const [isMinor, setIsMinor] = useState(false)
  const [requiresAssistance, setRequiresAssistance] = useState(false)
  const [priority, setPriority] = useState("")
  const [notes, setNotes] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [volunteerTypes, setVolunteerTypes] = useState([])
  const [volunteerAdditionalTypes, setVolunteerAdditionalTypes] = useState([])
  const [volunteerIsVersatile, setVolunteerIsVersatile] = useState(false)
  const [recommendations, setRecommendations] = useState([])
  const [assignmentGuidance, setAssignmentGuidance] = useState(null)
  const [assignmentGuidanceLoading, setAssignmentGuidanceLoading] = useState(false)
  const [sessionStatsById, setSessionStatsById] = useState({})
  const [expandedReasons, setExpandedReasons] = useState({})
  const [formError, setFormError] = useState("")
  const evaluationCacheRef = useRef(new Map())

  useEffect(() => {
    if (!isOpen) return

    const isEditMode = Boolean(initialData)
    const initialRole = String(initialData?.role || "participant").trim().toLowerCase() || "participant"
    const initialVolunteerTypes = isEditMode ? deriveVolunteerTypes(initialData) : []

    const initialEventId = defaultEventId || ""
    setEventId(String(isEditMode ? (initialData?.event_id || initialEventId) : initialEventId))
    setFirstName(String(isEditMode ? (initialData?.first_name || "") : ""))
    setLastName(String(isEditMode ? (initialData?.last_name || "") : ""))
    setEmail(String(isEditMode ? (initialData?.email || "") : ""))
    setRole(initialRole)
    setIsMinor(Boolean(isEditMode ? initialData?.is_minor : false))
    setRequiresAssistance(Boolean(isEditMode ? initialData?.requires_assistance : false))
    setPriority(String(isEditMode && initialData?.priority != null ? initialData.priority : ""))
    setNotes(String(isEditMode ? (initialData?.notes || "") : ""))
    setSessionId(String(isEditMode ? (initialData?.session_id || "") : getRememberedSessionId(initialEventId)))
    setVolunteerTypes(initialRole === "volunteer" ? initialVolunteerTypes : [])
    setVolunteerAdditionalTypes(
      initialRole === "volunteer"
        ? (Array.isArray(initialData?.volunteer_additional_types) ? initialData.volunteer_additional_types : [])
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
        : []
    )
    setVolunteerIsVersatile(Boolean(isEditMode && initialRole === "volunteer" ? initialData?.volunteer_is_versatile : false))
    setRecommendations([])
    setAssignmentGuidance(null)
    setAssignmentGuidanceLoading(false)
    setSessionStatsById({})
    setExpandedReasons({})
    setFormError("")
    evaluationCacheRef.current = new Map()
  }, [isOpen, defaultEventId, initialData])

  useEffect(() => {
    if (role === "volunteer") return
    setVolunteerTypes([])
    setVolunteerAdditionalTypes([])
    setVolunteerIsVersatile(false)
  }, [role])

  useEffect(() => {
    if (role !== "volunteer") return
    setRequiresAssistance(false)
  }, [role])

  useEffect(() => {
    let cancelled = false

    async function loadRecommendations() {
      if (!isOpen || !initialData?.id || sessionId || role === "volunteer") {
        setRecommendations([])
        return
      }

      try {
        const nextRecommendations = await fetchRecommendedSessions(initialData.id)
        if (!cancelled) {
          const normalizedRecommendations = Array.isArray(nextRecommendations) ? nextRecommendations : []
          setRecommendations(normalizedRecommendations)

          const topRecommendations = normalizedRecommendations
            .slice(0, 2)
            .map((recommendation) => String(recommendation?.session_id || ""))
            .filter(Boolean)

          topRecommendations.forEach((recommendedSessionId) => {
            const cacheKey = `${String(initialData.id)}:${recommendedSessionId}`
            if (evaluationCacheRef.current.has(cacheKey)) return

            evaluateAssignment(initialData.id, recommendedSessionId)
              .then((guidance) => {
                evaluationCacheRef.current.set(cacheKey, guidance || null)
              })
              .catch(() => {
                // Ignore preload failures so the normal selection flow still works.
              })
          })
        }
      } catch {
        if (!cancelled) {
          setRecommendations([])
        }
      }
    }

    loadRecommendations()

    return () => {
      cancelled = true
    }
  }, [initialData?.id, isOpen, role, sessionId])

  useEffect(() => {
    let cancelled = false

    async function loadSessionStats() {
      if (!isOpen || !initialData?.id || sessionId || role === "volunteer" || !eventId) {
        setSessionStatsById({})
        return
      }

      try {
        const payload = await fetchEventSessionStats(eventId)
        const nextStats = Object.fromEntries(
          (Array.isArray(payload?.sessions) ? payload.sessions : []).map((sessionStats) => [
            String(sessionStats?.session_id || ""),
            sessionStats,
          ]).filter(([sessionStatsId]) => sessionStatsId)
        )

        if (!cancelled) {
          setSessionStatsById(nextStats)
        }
      } catch {
        if (!cancelled) {
          setSessionStatsById({})
        }
      }
    }

    loadSessionStats()

    return () => {
      cancelled = true
    }
  }, [eventId, initialData?.id, isOpen, role, sessionId])

  useEffect(() => {
    let cancelled = false

    async function loadAssignmentGuidance() {
      if (!isOpen || !initialData?.id || !sessionId || role === "volunteer") {
        setAssignmentGuidance(null)
        setAssignmentGuidanceLoading(false)
        return
      }

      const cacheKey = `${String(initialData.id)}:${String(sessionId)}`
      const cachedGuidance = evaluationCacheRef.current.get(cacheKey)
      if (cachedGuidance !== undefined) {
        setAssignmentGuidance(cachedGuidance)
        setAssignmentGuidanceLoading(false)
        return
      }

      setAssignmentGuidanceLoading(true)
      try {
        const guidance = await evaluateAssignment(initialData.id, sessionId)
        if (!cancelled) {
          evaluationCacheRef.current.set(cacheKey, guidance || null)
          setAssignmentGuidance(guidance || null)
        }
      } catch {
        if (!cancelled) {
          setAssignmentGuidance(null)
        }
      } finally {
        if (!cancelled) {
          setAssignmentGuidanceLoading(false)
        }
      }
    }

    loadAssignmentGuidance()

    return () => {
      cancelled = true
    }
  }, [initialData?.id, isOpen, role, sessionId])

  const sessionOptions = useMemo(() => {
    return (Array.isArray(sessions) ? sessions : []).map((session, index) => {
      const name = session?.name || `Session ${index + 1}`
      const count = Number.isFinite(Number(session?.participant_count)) ? Number(session.participant_count) : null
      const cap = Number.isFinite(Number(session?.capacity)) ? Number(session.capacity) : null
      const capacityLabel = count != null && cap != null
        ? `${name} (${count}/${cap})`
        : name

      return {
        id: String(session?.id || ""),
        label: capacityLabel,
      }
    }).filter((option) => option.id)
  }, [sessions])

  const sessionNameById = useMemo(() => {
    return Object.fromEntries(
      (Array.isArray(sessions) ? sessions : []).map((session, index) => [
        String(session?.id || ""),
        session?.name || `Session ${index + 1}`,
      ])
    )
  }, [sessions])

  const resolvedEventType = useMemo(() => {
    const fromProp = normalizeEventType(eventType)
    if (fromProp) return fromProp

    const selected = (Array.isArray(eventOptions) ? eventOptions : []).find(
      (option) => String(option?.id || "") === String(eventId || "")
    )
    const fromSelectedEvent = normalizeEventType(selected?.event_type)
    if (fromSelectedEvent) return fromSelectedEvent

    const searchType = getSearchParamEventType()
    const fromQueryParam = normalizeEventType(searchType)
    if (fromQueryParam) return fromQueryParam

    return null
  }, [eventType, eventId, eventOptions])

  const volunteerTypeOptions = useMemo(
    () => (resolvedEventType === "chapter" ? VOLUNTEER_TYPE_CONFIG.chapter : VOLUNTEER_TYPE_CONFIG.tour),
    [resolvedEventType]
  )

  const allowedAdditionalTypeOptions = useMemo(
    () => buildAdditionalOptions(volunteerTypes),
    [volunteerTypes]
  )

  const additionalRolesHelperText = useMemo(() => {
    if (volunteerTypes.length <= 1) return ""

    const labelByValue = new Map(volunteerTypeOptions.map((option) => [option.value, option.label]))
    const selectedLabels = volunteerTypes
      .map((value) => labelByValue.get(value) || value)
      .filter(Boolean)

    if (selectedLabels.length <= 1) return ""
    return `Showing roles for: ${selectedLabels.join(" + ")}`
  }, [volunteerTypeOptions, volunteerTypes])

  const hasAdditionalTypeOptions = allowedAdditionalTypeOptions.length > 0

  useEffect(() => {
    const allowedVolunteerTypeValues = new Set(volunteerTypeOptions.map((option) => option.value))
    setVolunteerTypes((prev) => prev.filter((value) => allowedVolunteerTypeValues.has(value)))
  }, [volunteerTypeOptions])

  useEffect(() => {
    const allowedAdditionalValues = new Set(allowedAdditionalTypeOptions.map((option) => option.value))
    setVolunteerAdditionalTypes((prev) => prev.filter((value) => allowedAdditionalValues.has(value)))
  }, [allowedAdditionalTypeOptions])

  if (!isOpen) return null

  const handleAssign = (recommendedSessionId) => {
    const nextSessionId = String(recommendedSessionId || "")
    if (!nextSessionId) return
    setSessionId(nextSessionId)
    setRecommendations([])
  }

  const handleQuickAssignSuggested = () => {
    const suggestedSessionId = String(assignmentGuidance?.suggested_alternative_session_id || "")
    if (!suggestedSessionId) return
    setSessionId(suggestedSessionId)
  }

  const toggleReasons = (recommendedSessionId) => {
    const key = String(recommendedSessionId || "")
    if (!key) return
    setExpandedReasons((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setFormError("")

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setFormError("First name, last name, and email are required.")
      return
    }

    if (!lockEvent && !eventId) {
      setFormError("Select an event.")
      return
    }

    const parsedPriority = toNumberOrNull(priority)
    if (priority.trim() && parsedPriority == null) {
      setFormError("Priority must be a number.")
      return
    }

    const submitPayload = {
      event_id: lockEvent ? defaultEventId : eventId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      role,
      is_minor: isMinor,
      requires_assistance: role === "volunteer" ? false : requiresAssistance,
      priority: parsedPriority ?? undefined,
      notes: notes.trim() || undefined,
      session_id: sessionId || undefined,
    }

    if (role === "volunteer") {
      submitPayload.volunteer_type = getPrimaryVolunteerType(volunteerTypes) || undefined
      submitPayload.volunteer_additional_types = volunteerAdditionalTypes
      submitPayload.volunteer_is_versatile = volunteerIsVersatile
    }

    onSubmit(submitPayload)

    saveRememberedSessionId(lockEvent ? defaultEventId : eventId, sessionId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {!lockEvent && (
            <label className="sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Event</span>
              <select
                value={eventId}
                onChange={(e) => {
                  const nextEventId = e.target.value
                  setEventId(nextEventId)
                  setSessionId(getRememberedSessionId(nextEventId))
                  if (onEventChange) {
                    onEventChange(nextEventId)
                  }
                }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select event</option>
                {eventOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.title}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">First Name</span>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Last Name</span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Priority (optional)</span>
            <input
              type="number"
              min="0"
              max="3"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="0-3"
            />
          </label>

          {role !== "volunteer" && (
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={requiresAssistance}
                onChange={(e) => setRequiresAssistance(e.target.checked)}
              />
              Requires additional assistance
            </label>
          )}

          {role === "volunteer" && (
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h4 className="text-sm font-semibold text-slate-900">Volunteer Preferences</h4>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Volunteer Type</span>
                  <select
                    multiple
                    value={volunteerTypes}
                    onChange={(e) => setVolunteerTypes(getSelectedValues(e.target))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    size={Math.min(4, volunteerTypeOptions.length)}
                  >
                    {volunteerTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                {hasAdditionalTypeOptions ? (
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Additional Volunteer Types</span>
                    {additionalRolesHelperText && (
                      <span className="mb-2 block text-sm text-slate-600">
                        {additionalRolesHelperText}
                      </span>
                    )}
                    <select
                      multiple
                      value={volunteerAdditionalTypes}
                      onChange={(e) => setVolunteerAdditionalTypes(getSelectedValues(e.target))}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      size={4}
                    >
                      {allowedAdditionalTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="sm:col-span-2 text-sm text-slate-600">
                    No additional role selection required for this volunteer type
                  </p>
                )}

                <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={volunteerIsVersatile}
                    onChange={(e) => setVolunteerIsVersatile(e.target.checked)}
                  />
                  Flexible / versatile volunteer
                </label>
              </div>
            </div>
          )}

          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Session (optional)</span>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {sessionOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          {assignmentGuidanceLoading && sessionId && (
            <div className="sm:col-span-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Checking assignment guidance...
            </div>
          )}

          {!assignmentGuidanceLoading && assignmentGuidance && sessionId && (
            <div
              className={`sm:col-span-2 rounded border px-3 py-2 text-sm ${
                assignmentGuidance.status === "good"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : assignmentGuidance.status === "avoid"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {assignmentGuidance.status === "good" && (
                <p className="font-medium">Good choice</p>
              )}

              {assignmentGuidance.status === "warn" && (
                <p className="font-medium">Heads up before you assign</p>
              )}

              {assignmentGuidance.status === "avoid" && (
                <p className="font-medium">Assignment discouraged</p>
              )}

              <ul className="mt-1 list-disc space-y-1 pl-5">
                {(Array.isArray(assignmentGuidance.messages) ? assignmentGuidance.messages : []).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>

              {assignmentGuidance.suggested_alternative_session_id && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">Better option available</span>
                  <button
                    type="button"
                    onClick={handleQuickAssignSuggested}
                    className="rounded border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
                  >
                    Use {sessionNameById[String(assignmentGuidance.suggested_alternative_session_id)] || `Session ${assignmentGuidance.suggested_alternative_session_id}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {!sessionId && recommendations?.length > 0 && (
            <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <h4 className="text-sm font-semibold text-slate-900">Suggested Sessions</h4>

              <div className="mt-2 space-y-2">
                {recommendations.map((rec, index) => {
                  const sessionStats = sessionStatsById[String(rec.session_id)]
                  const reasonsExpanded = Boolean(expandedReasons[String(rec.session_id)])
                  const isTopRecommendation = index === 0
                  const projFlags = projectionBySession[String(rec.session_id)] || null
                  const availableSpots = Number(
                    sessionStats?.available_spots ?? (
                      Number(sessionStats?.capacity || 0) - Number(sessionStats?.current_count || 0)
                    )
                  )
                  const sessionAvailabilityBadge = Number.isFinite(availableSpots)
                    ? (availableSpots === 0 ? "Full" : availableSpots <= 2 ? "Nearly Full" : "")
                    : ""

                  return (
                    <div
                      key={rec.session_id}
                      className={`rounded border bg-white p-3 ${isTopRecommendation ? "border-sky-400 bg-sky-100/60 shadow-sm" : "border-sky-100"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800">
                            <strong>{sessionNameById[String(rec.session_id)] || `Session ${rec.session_id}`}</strong>
                            <span className="ml-2 opacity-60">({Math.round(Number(rec.score || 0))})</span>
                            {sessionAvailabilityBadge && (
                              <span
                                className={`ml-2 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sessionAvailabilityBadge === "Full" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                              >
                                {sessionAvailabilityBadge}
                              </span>
                            )}
                            {!sessionAvailabilityBadge && projFlags?.willBeFull && (
                              <span className="ml-2 text-[10px] text-orange-500">Filling quickly</span>
                            )}
                          </div>
                          {isTopRecommendation && (
                            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-sky-700">Top recommendation</div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleReasons(rec.session_id)}
                          className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          {reasonsExpanded ? "Hide why" : "Why?"}
                        </button>
                      </div>

                      {sessionStats && (
                        <div className="mt-3 space-y-2">
                          <SessionLoadBar
                            current={sessionStats.current_count}
                            capacity={sessionStats.capacity}
                          />
                          <SessionIndicators
                            assistance_count={sessionStats.assistance_count}
                            target_assistance={sessionStats.target_assistance}
                            minor_count={sessionStats.minor_count}
                            target_minors={sessionStats.target_minors}
                          />
                        </div>
                      )}

                      {reasonsExpanded && (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {(Array.isArray(rec.reasons) ? rec.reasons : []).map((reason, reasonIndex) => (
                            <li key={reasonIndex}>{reason}</li>
                          ))}
                        </ul>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAssign(rec.session_id)}
                        className="mt-3 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
                      >
                        Assign
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              rows={3}
            />
          </label>

          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isMinor}
              onChange={(e) => setIsMinor(e.target.checked)}
            />
            Minor participant
          </label>
        </div>

        {formError && (
          <p className="mt-3 text-sm text-red-600">{formError}</p>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
