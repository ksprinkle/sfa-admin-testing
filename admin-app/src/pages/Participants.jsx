import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { fetchAllParticipants, checkInParticipant, promoteParticipant, 
  removeParticipant, verifyWaiver, updateParticipantPriority, updateParticipantType,
  fetchParticipantRemovalLog, exportParticipantRemovalLogCsv, fetchEvents,
  fetchAdminEvent, createAdminParticipant } from "../api/events"
import { useNavigate, useSearchParams } from "react-router-dom"
import BackButton from "../components/BackButton"
import SyncStateIndicator from "../components/SyncStateIndicator"
import ParticipantForm from "../components/ParticipantForm"

const PRIORITY_LEVELS = [
  { value: 1, label: "High", dotClass: "bg-red-500" },
  { value: 2, label: "Medium", dotClass: "bg-amber-400" },
  { value: 3, label: "Low", dotClass: "bg-gray-500" },
  { value: 0, label: "Unset", dotClass: "bg-gray-300" },
]

const WAIVER_LEGEND = [
  { value: true, label: "Verified", dotClass: "bg-green-500" },
  { value: false, label: "Pending", dotClass: "bg-orange-600" },
]

const PARTICIPANT_TYPE_OPTIONS = [
  { key: "surfer", label: "Surfer", role: "participant", volunteer_type: null, dotClass: "bg-indigo-500" },
  { key: "food", label: "Food", role: "volunteer", volunteer_type: "food", dotClass: "bg-green-500" },
  { key: "raffle", label: "Raffle", role: "volunteer", volunteer_type: "raffle", dotClass: "bg-purple-500" },
  { key: "beach", label: "Beach", role: "volunteer", volunteer_type: "beach", dotClass: "bg-sky-500" },
  { key: "buddy", label: "Buddy", role: "volunteer", volunteer_type: "buddy", dotClass: "bg-cyan-600" },
  { key: "instructor", label: "Instructor", role: "volunteer", volunteer_type: "instructor", dotClass: "bg-orange-500" },
]

function getParticipantTypeKey(participant) {
  const role = normalizeRole(participant.role)
  if (role === "volunteer") {
    const type = normalizeVolunteerType(participant.volunteer_type)
    if (type && PARTICIPANT_TYPE_OPTIONS.some((opt) => opt.key === type)) {
      return type
    }
    return null
  }
  return "surfer"
}

const VOLUNTEER_TYPE_OPTIONS = PARTICIPANT_TYPE_OPTIONS.filter((opt) => opt.key !== "surfer")

const VOLUNTEER_SECONDARY_ROLE_OPTIONS = [
  { key: "buddy", label: "Buddy", dotClass: "bg-cyan-600" },
  { key: "instructor", label: "Instructor", dotClass: "bg-orange-500" },
  { key: "spotter", label: "Spotter", dotClass: "bg-teal-600" },
  { key: "board_rescue", label: "Board Rescue", dotClass: "bg-blue-600" },
  { key: "lifeguard", label: "Lifeguard", dotClass: "bg-rose-600" },
  { key: "registration", label: "Registration", dotClass: "bg-blue-500" },
  { key: "setup_teardown", label: "Setup/Tear Down", dotClass: "bg-amber-600" },
  { key: "equipment_handling", label: "Equipment Handling", dotClass: "bg-slate-600" },
  { key: "snacks_drinks", label: "Snacks/Drinks", dotClass: "bg-emerald-600" },
]

const BEACH_ROLE_KEYS = new Set(["food", "raffle", "beach", "registration", "setup_teardown", "equipment_handling", "snacks_drinks"])
const WATER_ROLE_KEYS = new Set(["buddy", "instructor", "spotter", "board_rescue", "lifeguard"])

function normalizeRole(value) {
  return (value || "").trim().toLowerCase()
}

function normalizeVolunteerType(value) {
  const normalized = (value || "").trim().toLowerCase()
  const aliasMap = {
    "cleanup": "setup_teardown",
    "setup/tear down": "setup_teardown",
    "setup-teardown": "setup_teardown",
    "equipment handling": "equipment_handling",
    "snacks/drinks": "snacks_drinks",
    "board rescue": "board_rescue",
    "surf_buddy": "buddy",
    "surf_instructor": "instructor",
  }
  const aliased = aliasMap[normalized] || normalized
  return aliased || null
}

function normalizeParticipantFormEventType(value) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "chapter" || normalized === "tour") return normalized
  return null
}

function getGroupForRole(roleKey) {
  const normalized = normalizeVolunteerType(roleKey)
  if (!normalized) return null
  if (BEACH_ROLE_KEYS.has(normalized)) return "beach"
  if (WATER_ROLE_KEYS.has(normalized)) return "water"
  return null
}

function isRoleAllowedForGroups(roleKey, groupSelection) {
  const normalizedRole = normalizeVolunteerType(roleKey)
  const selectedGroups = normalizeGroupSelection(groupSelection)

  if (!normalizedRole) return false
  if (selectedGroups.length === 0) return false

  const roleGroup = getGroupForRole(normalizedRole)
  return Boolean(roleGroup && selectedGroups.includes(roleGroup))
}

function normalizeGroupSelection(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter((item) => item === "beach" || item === "water")))
  }

  if (!value) return []

  return Array.from(
    new Set(
      String(value)
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item === "beach" || item === "water")
    )
  )
}

function formatEventType(eventType) {
  if (!eventType) return "-"

  return String(eventType)
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function normalizeEventStatus(status) {
  return String(status || "").trim().toLowerCase()
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function classifyParticipantEventAssociation(participant, eventById, todayIso) {
  const eventId = String(participant?.event_id || "")
  if (!eventId) {
    return {
      key: "unlinked",
      label: "No Event",
      pillClass: "border-slate-300 bg-slate-50 text-slate-700",
    }
  }

  const eventInfo = eventById.get(eventId)
  if (!eventInfo) {
    return {
      key: "unlinked",
      label: "No Event Match",
      pillClass: "border-slate-300 bg-slate-50 text-slate-700",
    }
  }

  const status = normalizeEventStatus(eventInfo.status)
  const startDate = String(eventInfo.start_date || "").slice(0, 10)
  const isArchived = status === "archived"
  const isCancelled = status === "cancelled"
  const isPast = Boolean(startDate && startDate < todayIso)

  if (isArchived || isCancelled || isPast) {
    return {
      key: "past_archived",
      label: "Past/Archived",
      pillClass: "border-amber-300 bg-amber-50 text-amber-800",
    }
  }

  return {
    key: "upcoming_active",
    label: "Upcoming/Active",
    pillClass: "border-emerald-300 bg-emerald-50 text-emerald-800",
  }
}

function normalizeParticipantForUI(participant) {
  const role = normalizeRole(participant.role)
  const volunteerType = normalizeVolunteerType(participant.volunteer_type)
  const versatile = Boolean(participant.volunteer_is_versatile)
  const additionalRoles = Array.from(
    new Set(
      (Array.isArray(participant.volunteer_additional_types) ? participant.volunteer_additional_types : [])
        .map((value) => normalizeVolunteerType(value))
        .filter((value) => value && value !== volunteerType)
    )
  )
  const uiGroups = Array.from(
    new Set(
      [volunteerType, ...additionalRoles]
        .map((value) => getGroupForRole(value))
        .filter(Boolean)
    )
  )

  return {
    ...participant,
    role,
    volunteer_type: volunteerType,
    volunteer_group_ui: uiGroups.join(",") || null,
    volunteer_additional_types: additionalRoles,
    volunteer_is_versatile: versatile,
  }
}

function ParticipantTypeRadioGroup({ participant, onChange, onGroupChange, onAdditionalRolesChange, onVersatileChange }) {
  const selectedKey = getParticipantTypeKey(participant)
  const isSurfer = normalizeRole(participant.role) !== "volunteer"
  const isVersatile = Boolean(participant.volunteer_is_versatile)
  const selectedGroups = normalizeGroupSelection(participant.volunteer_group_ui)
  const fallbackGroup = getGroupForRole(selectedKey)
  if (selectedGroups.length === 0 && fallbackGroup) {
    selectedGroups.push(fallbackGroup)
  }
  const needsPrimarySelection = selectedGroups.length > 0 && !selectedKey
  const selectedAdditionalRoles = Array.isArray(participant.volunteer_additional_types)
    ? participant.volunteer_additional_types.map((value) => String(value).toLowerCase())
    : []
  const normalizedEventType = (participant.event_type || "").trim().toLowerCase()
  const isTourEventType = normalizedEventType === "tour"
  const tourOnlyPrimaryKeys = new Set(["food", "raffle"])
  const visiblePrimaryOptions = selectedGroups.length > 0
    ? VOLUNTEER_TYPE_OPTIONS
        .filter((opt) => selectedGroups.includes(getGroupForRole(opt.key)))
        .filter((opt) => isTourEventType || !tourOnlyPrimaryKeys.has(opt.key))
    : []
  const primaryOptionsForDisplay = visiblePrimaryOptions
  const showPrimaryRolePills = Boolean(selectedKey)
  const visibleSecondaryRoleOptions = VOLUNTEER_SECONDARY_ROLE_OPTIONS
    .filter((role) => role.key !== selectedKey)
    .filter((role) => isRoleAllowedForGroups(role.key, selectedGroups))

  const toggleGroup = (groupKey) => {
    const next = selectedGroups.includes(groupKey)
      ? selectedGroups.filter((value) => value !== groupKey)
      : [...selectedGroups, groupKey]
    onGroupChange(next)
  }

  const toggleAdditionalRole = (roleKey) => {
    const next = selectedAdditionalRoles.includes(roleKey)
      ? selectedAdditionalRoles.filter((value) => value !== roleKey)
      : [...selectedAdditionalRoles, roleKey]
    onAdditionalRolesChange(next)
  }

  if (isSurfer) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
          <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-indigo-300 bg-white">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          </span>
          Surfer
        </span>
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Group</span>
        <button
          type="button"
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] transition ${
            selectedGroups.includes("beach")
              ? "border-sky-300 bg-sky-50 text-sky-700"
              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
          }`}
          onClick={() => toggleGroup("beach")}
          title="Toggle Beach group"
        >
          Beach
        </button>
        <button
          type="button"
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] transition ${
            selectedGroups.includes("water")
              ? "border-cyan-300 bg-cyan-50 text-cyan-700"
              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
          }`}
          onClick={() => toggleGroup("water")}
          title="Toggle Water group"
        >
          Water
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {primaryOptionsForDisplay.length === 0 && !selectedKey && (
          <span className="text-[10px] text-gray-500">No primary type selected</span>
        )}
        {showPrimaryRolePills && primaryOptionsForDisplay.map((opt) => {
          const selected = selectedKey === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition ${
                selected
                  ? "border-gray-400 bg-gray-100 text-gray-800"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => onChange(selected ? {
                key: null,
                label: "None",
                role: "volunteer",
                volunteer_type: null,
              } : opt)}
              title={`Set primary volunteer type to ${opt.label}`}
            >
              <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-gray-300 bg-white">
                {selected && <span className={`h-1.5 w-1.5 rounded-full ${opt.dotClass}`} />}
              </span>
              <span>{opt.label}</span>
            </button>
          )
        })}
        {needsPrimarySelection && (
          <span className="text-[10px] font-medium text-amber-700">Primary role required</span>
        )}
      </div>

      {(selectedKey || selectedGroups.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {visibleSecondaryRoleOptions.length === 0 && (
            <span className="text-[10px] text-gray-500">No additional roles available</span>
          )}

          {visibleSecondaryRoleOptions.map((role) => {
            const active = selectedAdditionalRoles.includes(role.key)
            return (
              <button
                key={role.key}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition ${
                  active
                    ? "border-teal-300 bg-teal-50 text-teal-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() => toggleAdditionalRole(role.key)}
                title={`${active ? "Remove" : "Add"} ${role.label} as additional role`}
              >
                <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-gray-300 bg-white">
                  {active && <span className={`h-1.5 w-1.5 rounded-full ${role.dotClass}`} />}
                </span>
                + {role.label}
              </button>
            )
          })}

          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition ${
              isVersatile
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
            }`}
            onClick={() => onVersatileChange(!isVersatile)}
            title="Mark volunteer as versatile/flexible"
          >
            {isVersatile ? "Flexible: ON" : "Flexible: OFF"}
          </button>
        </div>
      )}
    </div>
  )
}

const CHECKIN_LEGEND = [
  { value: "checked", label: "Checked In", dotClass: "bg-green-500" },
  { value: "waitlisted", label: "Waitlisted", dotClass: "bg-yellow-400" },
  { value: "pending", label: "Not Checked In", dotClass: "bg-orange-600" },
]

const REMOVAL_REASON_OPTIONS = {
  "1": { code: "no_show", label: "No-show" },
  "2": { code: "changed_mind", label: "Changed mind" },
  "3": { code: "duplicate_registration", label: "Duplicate registration" },
  "4": { code: "admin_correction", label: "Admin correction" },
  "5": { code: "safety_issue", label: "Safety issue" },
  "6": { code: "other", label: "Other" },
}

const REMOVAL_REASON_CODE_LABELS = {
  no_show: "No-show",
  changed_mind: "Changed mind",
  duplicate_registration: "Duplicate registration",
  admin_correction: "Admin correction",
  safety_issue: "Safety issue",
  other: "Other",
}

const PARTICIPANTS_CACHE_KEY = "sfa.offline.participants.cache"
const PARTICIPANT_ACTION_QUEUE_KEY = "sfa.offline.participants.queue"
const NON_RETRYABLE_STATUS_CODES = new Set([400, 404])
const RECOVERABLE_STATUS_CODES = new Set([409, 429, 500, 502, 503, 504])

function buildQueueItemId(action, entityId, updatedAt) {
  return String(action?.id || `${String(action?.type || "action")}:${String(entityId || "unknown")}:${Number(updatedAt || Date.now())}`)
}

function getCachedParticipants() {
  try {
    const raw = localStorage.getItem(PARTICIPANTS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCachedParticipants(participants) {
  try {
    localStorage.setItem(PARTICIPANTS_CACHE_KEY, JSON.stringify(Array.isArray(participants) ? participants : []))
  } catch {
    // Ignore storage failures.
  }
}

function normalizeQueuedParticipantAction(action) {
  if (!action || typeof action !== "object") return null
  if (!action.type || action.participantId == null) return null

  const updatedAt = Number.isFinite(Number(action.updatedAt)) ? Number(action.updatedAt) : Date.now()
  const syncStatus = action.syncStatus === "failed"
    ? "failed"
    : action.syncStatus === "synced"
      ? "synced"
      : action.status === "failed"
        ? "failed"
        : action.status === "synced"
          ? "synced"
          : "pending"
  const lastError = String(action.lastError || action.error || "")

  return {
    ...action,
    id: buildQueueItemId(action, action.participantId, updatedAt),
    participantId: String(action.participantId),
    syncStatus,
    status: syncStatus,
    retryable: action.retryable !== false,
    lastStatus: Number.isFinite(Number(action.lastStatus)) ? Number(action.lastStatus) : null,
    lastError,
    error: lastError || null,
    updatedAt,
    lastAttemptAt: updatedAt,
  }
}

function getSyncStatus(entityId, queue) {
  return (queue || []).find((item) => String(item.participantId) === String(entityId) && item.syncStatus !== "synced") || null
}

function SyncStatusIcon({ status }) {
  if (status === "pending") {
    return <span className="ml-0.5 inline-block animate-spin text-xs text-amber-600">⏳</span>
  }

  if (status === "failed") {
    return <span className="ml-0.5 inline-block text-xs text-red-500">●</span>
  }

  if (status === "synced") {
    return <span className="ml-0.5 inline-block text-xs text-green-500">✓</span>
  }

  return null
}

function dedupeParticipantQueue(actions) {
  const byKey = new Map()
  for (const entry of actions || []) {
    const normalized = normalizeQueuedParticipantAction(entry)
    if (!normalized) continue
    const actionKey =
      normalized.type === "update_priority" || normalized.type === "update_type"
        ? `${normalized.type}:${normalized.participantId}`
        : `${normalized.type}:${normalized.participantId}:${normalized.id || normalized.updatedAt}`
    byKey.set(actionKey, normalized)
  }
  return [...byKey.values()]
}

function getQueuedParticipantActions() {
  try {
    const raw = localStorage.getItem(PARTICIPANT_ACTION_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? dedupeParticipantQueue(parsed) : []
  } catch {
    return []
  }
}

function saveQueuedParticipantActions(actions) {
  try {
    localStorage.setItem(PARTICIPANT_ACTION_QUEUE_KEY, JSON.stringify(dedupeParticipantQueue(actions)))
  } catch {
    // Ignore storage failures.
  }
}

function isOfflineError(err) {
  const msg = String(err?.message || "").toLowerCase()
  return !navigator.onLine || msg.includes("failed to fetch") || msg.includes("load failed") || msg.includes("network")
}

function getQueueErrorMeta(err) {
  const status = Number(err?.status)
  const safeStatus = Number.isFinite(status) ? status : null
  const detail = String(err?.message || "Unknown error")

  if (safeStatus === 404) {
    return { retryable: false, status: safeStatus, detail, summary: "participant no longer exists" }
  }
  if (safeStatus === 400) {
    return { retryable: false, status: safeStatus, detail, summary: "invalid participant state" }
  }
  if (safeStatus === 409) {
    return { retryable: true, status: safeStatus, detail, summary: "capacity or state conflict" }
  }

  return {
    retryable: RECOVERABLE_STATUS_CODES.has(safeStatus) || safeStatus == null || !NON_RETRYABLE_STATUS_CODES.has(safeStatus),
    status: safeStatus,
    detail,
    summary: "server rejected the update",
  }
}

function enqueueParticipantAction(action) {
  const normalized = normalizeQueuedParticipantAction({
    ...action,
    syncStatus: "pending",
    status: "pending",
    retryable: true,
    lastStatus: null,
    lastError: "",
    error: null,
    updatedAt: Date.now(),
    lastAttemptAt: Date.now(),
  })
  if (!normalized) return getQueuedParticipantActions()

  const queue = getQueuedParticipantActions()

  if (normalized.type === "update_priority" || normalized.type === "update_type") {
    const filtered = queue.filter((item) => !(item.type === normalized.type && String(item.participantId) === String(normalized.participantId)))
    const next = [...filtered, normalized]
    saveQueuedParticipantActions(next)
    return next
  }

  const next = [...queue, normalized]
  saveQueuedParticipantActions(next)
  return next
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedParticipantId = (searchParams.get("participant_id") || "").trim()
  const requestedEventId = (searchParams.get("event_id") || "").trim()
  const requestedEventType = (searchParams.get("event_type") || "").trim().toLowerCase()
  const requestedSessionId = (searchParams.get("session_id") || "").trim()

  const [priorityError, setPriorityError] = useState("")
  const [actionError, setActionError] = useState("")
  const [removalLogError, setRemovalLogError] = useState("")
  const [removalLogs, setRemovalLogs] = useState([])
  const [isRemovalLogLoading, setIsRemovalLogLoading] = useState(false)
  const [removalLogPage, setRemovalLogPage] = useState(1)
  const REMOVAL_LOG_PAGE_SIZE = 20
  const [removalLogFilters, setRemovalLogFilters] = useState({
    email: "",
    reason_code: "",
    event_id: "",
    event_type: "",
    date_from: "",
    date_to: "",
  })
  const [focusedParticipantId, setFocusedParticipantId] = useState("")
  const [queuedParticipantActions, setQueuedParticipantActions] = useState(() => getQueuedParticipantActions())
  const [queueNotice, setQueueNotice] = useState("")
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [createEventId, setCreateEventId] = useState("")
  const [createSessions, setCreateSessions] = useState([])
  const [createEventMeta, setCreateEventMeta] = useState({ title: "", event_type: "" })
  const [createToast, setCreateToast] = useState(null)
  const participantRowRefs = useRef({})
  const focusAppliedRef = useRef(false)
  const actionSyncRef = useRef(false)
  const participantActionLocksRef = useRef(new Set())
  const createToastTimerRef = useRef(null)
  const retriedCreateQueueIdsRef = useRef(new Set())

  const pendingQueueCount = queuedParticipantActions.filter((item) => item.syncStatus !== "failed").length
  const failedQueueCount = queuedParticipantActions.filter((item) => item.syncStatus === "failed").length
  const queueStateByParticipant = queuedParticipantActions.reduce((acc, item) => {
    const participantId = String(item.participantId)
    const current = acc[participantId]
    if (item.syncStatus === "failed") {
      acc[participantId] = "failed"
      return acc
    }
    if (!current) {
      acc[participantId] = "pending"
    }
    return acc
  }, {})

  const persistQueuedParticipantActions = (nextQueue) => {
    const normalized = dedupeParticipantQueue(nextQueue)
    saveQueuedParticipantActions(normalized)
    setQueuedParticipantActions(normalized)
    return normalized
  }

  const dismissCreateToast = useCallback(() => {
    if (createToastTimerRef.current) {
      window.clearTimeout(createToastTimerRef.current)
      createToastTimerRef.current = null
    }
    setCreateToast(null)
  }, [])

  const showCreateToast = useCallback((message, options = {}) => {
    const {
      tone = "success",
      retryQueueItemId = null,
      durationMs = 2600,
    } = options

    if (createToastTimerRef.current) {
      window.clearTimeout(createToastTimerRef.current)
      createToastTimerRef.current = null
    }

    setCreateToast({ message, tone, retryQueueItemId })

    if (durationMs > 0) {
      createToastTimerRef.current = window.setTimeout(() => {
        setCreateToast(null)
        createToastTimerRef.current = null
      }, durationMs)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (createToastTimerRef.current) {
        window.clearTimeout(createToastTimerRef.current)
      }
    }
  }, [])

  const retryRecoverableQueueActions = () => {
    queuedParticipantActions
      .filter((item) => item.syncStatus === "failed" && item.retryable && item.type === "create_participant")
      .forEach((item) => {
        retriedCreateQueueIdsRef.current.add(String(item.id))
      })

    const next = queuedParticipantActions.map((item) => {
      if (item.syncStatus === "failed" && item.retryable) {
        return {
          ...item,
          syncStatus: "pending",
          status: "pending",
          lastStatus: null,
          lastError: "",
          error: null,
          updatedAt: Date.now(),
          lastAttemptAt: Date.now(),
        }
      }
      return item
    })
    persistQueuedParticipantActions(next)
    setQueueNotice("")
    processQueuedParticipantActions()
  }

  const dismissFailedQueueActions = () => {
    const next = queuedParticipantActions.filter((item) => item.syncStatus !== "failed")
    persistQueuedParticipantActions(next)
    setQueueNotice("")
  }

  const retryQueueItem = (queueItemId) => {
    const retryTarget = queuedParticipantActions.find((item) => String(item.id) === String(queueItemId))
    if (retryTarget?.type === "create_participant") {
      retriedCreateQueueIdsRef.current.add(String(queueItemId))
    }

    const next = queuedParticipantActions.map((item) => {
      if (String(item.id) !== String(queueItemId) || item.syncStatus !== "failed" || !item.retryable) {
        return item
      }
      return {
        ...item,
        syncStatus: "pending",
        status: "pending",
        lastStatus: null,
        lastError: "",
        error: null,
        updatedAt: Date.now(),
        lastAttemptAt: Date.now(),
      }
    })
    persistQueuedParticipantActions(next)
    setQueueNotice("")
    processQueuedParticipantActions()
  }

  const retryAllFailed = (queue) => {
    ;(queue || [])
      .filter((item) => item.status === "failed")
      .forEach((item) => retryQueueItem(item.id))
  }

  async function handlePriorityChange(participantId, newPriority) {
    // Optimistic update
    updateParticipantsLocal(prev => prev.map(p => p.id === participantId ? { ...p, priority: newPriority } : p))
    setPriorityError("")
    try {
      await updateParticipantPriority(participantId, newPriority);
    } catch (err) {
      console.error('Priority update error:', err);
      const msg = err?.message || "Unknown error"
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({ type: "update_priority", participantId, priority: newPriority })
        persistQueuedParticipantActions(nextQueue)
        setPriorityError("Priority saved locally and queued for sync while offline.")
        return
      }
      await refreshParticipants()
      setPriorityError(`Failed to update priority: ${msg}`)
    }
  }
  // Use a ref to always get the latest refreshParticipants
  const refreshRef = useRef();
  const refreshRemovalLogRef = useRef();

  // Utility: Refresh participants from 
  const refreshParticipants = useCallback(async () => {
    try {
      const data = await fetchAllParticipants();
      setParticipants((prev) => {
        const next = data.map((rawParticipant) => {
        const normalized = normalizeParticipantForUI(rawParticipant)
        const previous = prev.find((p) => p.id === normalized.id)
        if (normalized.role === "volunteer" && previous?.volunteer_group_ui) {
          return {
            ...normalized,
            volunteer_group_ui: previous.volunteer_group_ui,
          }
        }

        return normalized
        })
        saveCachedParticipants(next)
        return next
      });
    } catch (err) {
      console.error("Failed to refresh participants", err);
      const cached = getCachedParticipants().map((item) => normalizeParticipantForUI(item))
      if (cached.length > 0) {
        setParticipants(cached)
      }
    }
  }, []);

  const refreshRemovalLog = useCallback(async () => {
    setIsRemovalLogLoading(true)
    setRemovalLogError("")
    try {
      const data = await fetchParticipantRemovalLog({ limit: 1000 })
      setRemovalLogs(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Failed to refresh removal logs", err)
      setRemovalLogError(err?.message || "Failed to load removal history")
    } finally {
      setIsRemovalLogLoading(false)
    }
  }, [])

  // Keep ref up to date
  useEffect(() => {
    refreshRef.current = refreshParticipants;
  }, [refreshParticipants]);

  useEffect(() => {
    refreshRemovalLogRef.current = refreshRemovalLog
  }, [refreshRemovalLog])

  const updateParticipantsLocal = useCallback((updater) => {
    setParticipants((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater
      saveCachedParticipants(next)
      return next
    })
  }, [])

  const processQueuedParticipantActions = useCallback(async () => {
    if (actionSyncRef.current) return
    if (!navigator.onLine) {
      setBrowserOnline(false)
      return
    }

    const queued = getQueuedParticipantActions()
    if (!queued.length) {
      setQueuedParticipantActions([])
      setQueueNotice("")
      return
    }

    actionSyncRef.current = true
    const remaining = []
    let needsParticipantRefresh = false
    let needsRemovalRefresh = false

    try {
      for (let i = 0; i < queued.length; i += 1) {
        const action = queued[i]

        if (action.syncStatus === "failed") {
          remaining.push(action)
          continue
        }

        try {
          if (action.type === "checkin") {
            await checkInParticipant(action.participantId)
            needsParticipantRefresh = true
            continue
          }
          if (action.type === "verify_waiver") {
            await verifyWaiver(action.participantId)
            needsParticipantRefresh = true
            continue
          }
          if (action.type === "promote") {
            await promoteParticipant(action.participantId)
            needsParticipantRefresh = true
            continue
          }
          if (action.type === "remove") {
            await removeParticipant(action.participantId, action.reasonCode, action.reasonNote || "")
            needsParticipantRefresh = true
            needsRemovalRefresh = true
            continue
          }
          if (action.type === "update_priority") {
            await updateParticipantPriority(action.participantId, action.priority)
            needsParticipantRefresh = true
            continue
          }
          if (action.type === "update_type") {
            await updateParticipantType(action.participantId, action.payload || {})
            needsParticipantRefresh = true
            continue
          }
          if (action.type === "create_participant") {
            await createAdminParticipant(action.payload || {})
            if (retriedCreateQueueIdsRef.current.delete(String(action.id))) {
              showCreateToast("Participant synced", { tone: "success" })
            }
            needsParticipantRefresh = true
            continue
          }
          if (action.type === "edit_participant") {
            await updateParticipantType(action.participantId, action.payload || {})
            needsParticipantRefresh = true
            continue
          }
        } catch (err) {
          if (isOfflineError(err)) {
            remaining.push(
              ...queued.slice(i).map((entry) => ({
                ...entry,
                syncStatus: entry.syncStatus === "failed" ? "failed" : "pending",
                status: entry.syncStatus === "failed" ? "failed" : "pending",
                error: entry.lastError || entry.error || null,
                updatedAt: Date.now(),
                lastAttemptAt: Date.now(),
              }))
            )
            break
          }

          const meta = getQueueErrorMeta(err)
          const failedAction = {
            ...action,
            syncStatus: "failed",
            status: "failed",
            retryable: meta.retryable,
            lastStatus: meta.status,
            lastError: meta.detail,
            error: meta.detail,
            updatedAt: Date.now(),
            lastAttemptAt: Date.now(),
          }
          remaining.push(failedAction)
          if (action.type === "create_participant") {
            showCreateToast("Failed to sync participant", {
              tone: "error",
              retryQueueItemId: failedAction.id,
              durationMs: 0,
            })
          }
          setQueueNotice(`1 queued change failed to sync: ${meta.summary}.`)
          console.error("Queued participant action failed", action, err)
        }
      }
    } finally {
      persistQueuedParticipantActions(remaining)
      actionSyncRef.current = false
    }

    if (needsParticipantRefresh) {
      await refreshParticipants()
    }
    if (needsRemovalRefresh) {
      await refreshRemovalLog()
    }
  }, [refreshParticipants, refreshRemovalLog, showCreateToast])

  const handleCreateParticipantSubmit = useCallback((payload) => {
    const localId = `local-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const selectedSession = createSessions.find((session) => String(session.id) === String(payload.session_id || ""))

    const optimisticParticipant = normalizeParticipantForUI({
      id: localId,
      event_id: payload.event_id,
      session_id: payload.session_id || null,
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email,
      role: payload.role || "participant",
      is_minor: Boolean(payload.is_minor),
      requires_assistance: Boolean(payload.requires_assistance),
      checked_in: false,
      is_waitlisted: false,
      priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : 0,
      waiver_signed: false,
      waiver_verified: false,
      event_title: createEventMeta.title || undefined,
      event_type: createEventMeta.event_type || undefined,
      session_name: selectedSession?.name || null,
      notes: payload.notes || null,
      volunteer_type: null,
      volunteer_additional_types: [],
      volunteer_is_versatile: false,
    })

    updateParticipantsLocal((prev) => [optimisticParticipant, ...prev])

    const nextQueue = enqueueParticipantAction({
      type: "create_participant",
      participantId: localId,
      payload,
    })
    persistQueuedParticipantActions(nextQueue)
    if (navigator.onLine) {
      showCreateToast("Participant added", { tone: "success" })
    } else {
      showCreateToast("Participant saved (syncing...)", { tone: "info" })
    }
    setCreateModalOpen(false)
    processQueuedParticipantActions()
  }, [createSessions, createEventMeta, processQueuedParticipantActions, showCreateToast, updateParticipantsLocal])

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
            if (data.action === "remove" && refreshRemovalLogRef.current) {
              refreshRemovalLogRef.current()
            }
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
        if (refreshRemovalLogRef.current) refreshRemovalLogRef.current()
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, []);

  const [participants, setParticipants] = useState([])
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [showParticipantFilters, setShowParticipantFilters] = useState(() => Boolean(requestedEventId || requestedEventType || requestedSessionId))
  const [participantFilters, setParticipantFilters] = useState({
    event_id: requestedEventId,
    event_type: requestedEventType,
    session_id: requestedSessionId,
  })
  const [showAssistanceNeededOnly, setShowAssistanceNeededOnly] = useState(false)
  const [eventAssociationFilter, setEventAssociationFilter] = useState("upcoming_active")
  const [allEventsForFilters, setAllEventsForFilters] = useState([])

  const refreshFilterEvents = useCallback(async () => {
    try {
      const data = await fetchEvents()
      setAllEventsForFilters(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Failed to load events for filters", err)
      setAllEventsForFilters([])
      setActionError("Could not refresh event filters. You can still work with current participant data.")
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const participantEventOptions = Array.from(
    new Map([
      ...allEventsForFilters
        .map((event) => [
          String(event.id || ""),
          {
            id: String(event.id || ""),
            title: event.title || String(event.id || ""),
            event_type: String(event.event_type || "").trim().toLowerCase(),
          },
        ])
        .filter(([eventId]) => Boolean(eventId)),
      ...participants
        .map((participant) => [
          String(participant.event_id || ""),
          {
            id: String(participant.event_id || ""),
            title: participant.event_title || String(participant.event_id || ""),
            event_type: String(participant.event_type || "").trim().toLowerCase(),
          },
        ])
        .filter(([eventId]) => Boolean(eventId)),
    ]).values()
  ).sort((left, right) => String(left.title).localeCompare(String(right.title)))

  const filteredParticipantEventOptions = participantEventOptions.filter((event) => {
    if (!participantFilters.event_type) return true
    return String(event.event_type || "").trim().toLowerCase() === participantFilters.event_type
  })

  const createEventOptions = useMemo(
    () => participantEventOptions.map((event) => ({ id: event.id, title: event.title })),
    [participantEventOptions]
  )

  const loadCreateEventSessions = useCallback(async (eventId) => {
    if (!eventId) {
      setCreateSessions([])
      setCreateEventMeta({ title: "", event_type: "" })
      return
    }

    const fallbackEvent = participantEventOptions.find((event) => String(event.id) === String(eventId))

    try {
      const eventDetail = await fetchAdminEvent(eventId)
      const normalizedSessions = Array.isArray(eventDetail?.sessions)
        ? eventDetail.sessions
        : []
      setCreateSessions(normalizedSessions)
      setCreateEventMeta({
        title: eventDetail?.title || fallbackEvent?.title || "",
        event_type: String(eventDetail?.event_type || fallbackEvent?.event_type || "").trim().toLowerCase(),
      })
    } catch (err) {
      setCreateSessions([])
      setCreateEventMeta({
        title: fallbackEvent?.title || "",
        event_type: String(fallbackEvent?.event_type || "").trim().toLowerCase(),
      })
      console.error("Failed to load sessions for selected event", err)
    }
  }, [participantEventOptions])

  const openCreateModal = useCallback(() => {
    const fallbackEventId = participantFilters.event_id || createEventOptions[0]?.id || ""
    setCreateEventId(fallbackEventId)
    setCreateModalOpen(true)
    if (fallbackEventId) {
      loadCreateEventSessions(fallbackEventId)
    } else {
      setCreateSessions([])
      setCreateEventMeta({ title: "", event_type: "" })
    }
  }, [participantFilters.event_id, createEventOptions, loadCreateEventSessions])

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false)
  }, [])

  const openEditModal = useCallback((participant) => {
    if (!participant?.id) return
    setEditingParticipant(participant)
    const participantEventId = String(participant.event_id || "")
    setCreateEventId(participantEventId)
    setEditModalOpen(true)
    if (participantEventId) {
      loadCreateEventSessions(participantEventId)
    }
  }, [loadCreateEventSessions])

  const closeEditModal = useCallback(() => {
    setEditModalOpen(false)
    setEditingParticipant(null)
  }, [])

  const handleEditParticipantSubmit = useCallback((payload) => {
    if (!editingParticipant?.id) return

    const participantId = String(editingParticipant.id)
    const selectedSession = createSessions.find((session) => String(session.id) === String(payload.session_id || ""))

    updateParticipantsLocal((prev) => prev.map((participant) => {
      if (String(participant.id) !== participantId) return participant

      const nextRole = String(payload.role || participant.role || "participant").trim().toLowerCase()
      return normalizeParticipantForUI({
        ...participant,
        event_id: payload.event_id || participant.event_id,
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        role: nextRole,
        is_minor: Boolean(payload.is_minor),
        requires_assistance: Boolean(payload.requires_assistance),
        priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : 0,
        notes: payload.notes || null,
        session_id: payload.session_id || null,
        session_name: payload.session_id ? (selectedSession?.name || null) : null,
        event_title: createEventMeta.title || participant.event_title,
        event_type: createEventMeta.event_type || participant.event_type,
        volunteer_type: nextRole === "volunteer" ? (payload.volunteer_type || null) : null,
        volunteer_additional_types: nextRole === "volunteer"
          ? (Array.isArray(payload.volunteer_additional_types) ? payload.volunteer_additional_types : [])
          : [],
        volunteer_is_versatile: nextRole === "volunteer" ? Boolean(payload.volunteer_is_versatile) : false,
      })
    }))

    const nextQueue = enqueueParticipantAction({
      type: "edit_participant",
      participantId,
      payload,
    })
    persistQueuedParticipantActions(nextQueue)
    setEditModalOpen(false)
    setEditingParticipant(null)
    processQueuedParticipantActions()
  }, [createSessions, createEventMeta, editingParticipant, processQueuedParticipantActions, updateParticipantsLocal])


  const participantSessionOptions = Array.from(
    new Map([
      ...allEventsForFilters.flatMap((event) =>
        (Array.isArray(event.sessions) ? event.sessions : []).map((session, index) => [
          String(session.id || ""),
          {
            id: String(session.id || ""),
            event_id: String(event.id || ""),
            name: session.name || `Session ${index + 1}`,
          },
        ])
      ),
      ...participants
        .map((participant) => [
          String(participant.session_id || ""),
          {
            id: String(participant.session_id || ""),
            event_id: String(participant.event_id || ""),
            name: participant.session_name || "Unassigned",
          },
        ])
        .filter(([sessionId]) => Boolean(sessionId)),
    ]).values()
  )
    .filter((session) => !participantFilters.event_id || session.event_id === participantFilters.event_id)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)))

  const participantEventTypeOptions = Array.from(
    new Set(
      [...participants, ...allEventsForFilters]
        .map((item) => String(item.event_type || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right))

  const eventsById = useMemo(() => {
    return new Map(
      allEventsForFilters
        .map((event) => [String(event.id || ""), event])
        .filter(([id]) => Boolean(id))
    )
  }, [allEventsForFilters])

  const todayIso = useMemo(() => getTodayIsoDate(), [])

  const participantAssociationCounts = useMemo(() => {
    return participants.reduce(
      (counts, participant) => {
        const association = classifyParticipantEventAssociation(participant, eventsById, todayIso)
        counts[association.key] = (counts[association.key] || 0) + 1
        return counts
      },
      { upcoming_active: 0, past_archived: 0, unlinked: 0 }
    )
  }, [participants, eventsById, todayIso])

  const filteredParticipants = participants
    .filter((p) =>
      `${p.first_name} ${p.last_name} ${p.email} ${p.event_title}`
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
    )
    .filter((p) => {
      if (!participantFilters.event_id) return true
      return String(p.event_id || "") === participantFilters.event_id
    })
    .filter((p) => {
      if (!participantFilters.event_type) return true
      return String(p.event_type || "").trim().toLowerCase() === participantFilters.event_type
    })
    .filter((p) => {
      if (!participantFilters.session_id) return true
      return String(p.session_id || "") === participantFilters.session_id
    })
    .filter((p) => {
      if (!showAssistanceNeededOnly) return true
      return Boolean(p.requires_assistance)
    })
    .filter((p) => {
      if (eventAssociationFilter === "all") return true
      const association = classifyParticipantEventAssociation(p, eventsById, todayIso)
      return association.key === eventAssociationFilter
    })
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

  // Keep removal history aligned with currently selected participant event filters.
  useEffect(() => {
    setRemovalLogFilters((prev) => ({
      ...prev,
      event_type: participantFilters.event_type || "",
      event_id: participantFilters.event_id || "",
    }))
  }, [participantFilters.event_type, participantFilters.event_id])

  useEffect(() => {
    setParticipantFilters((prev) => {
      const nextEventType = requestedEventType || prev.event_type
      const nextEventId = requestedEventId || prev.event_id
      const nextSessionId = requestedSessionId || prev.session_id
      if (
        prev.event_type === nextEventType &&
        prev.event_id === nextEventId &&
        prev.session_id === nextSessionId
      ) {
        return prev
      }
      return {
        ...prev,
        event_type: nextEventType,
        event_id: nextEventId,
        session_id: nextSessionId,
      }
    })
    if (requestedEventId || requestedEventType || requestedSessionId) {
      setShowParticipantFilters(true)
    }
  }, [requestedEventId, requestedEventType, requestedSessionId])

  // Initial load
  useEffect(() => {
    refreshParticipants();
    refreshRemovalLog();
    refreshFilterEvents();
    processQueuedParticipantActions()
  }, [refreshParticipants, refreshRemovalLog, refreshFilterEvents, processQueuedParticipantActions]);

  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true)
      processQueuedParticipantActions()
    }
    const onOffline = () => {
      setBrowserOnline(false)
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [processQueuedParticipantActions])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && getQueuedParticipantActions().length > 0) {
        processQueuedParticipantActions()
      }
    }, 5000)

    const onFocus = () => {
      if (navigator.onLine && getQueuedParticipantActions().length > 0) {
        processQueuedParticipantActions()
      }
    }

    window.addEventListener("focus", onFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [processQueuedParticipantActions])

  useEffect(() => {
    if (!requestedParticipantId || participants.length === 0 || focusAppliedRef.current) return

    const match = participants.find((p) => String(p.id) === String(requestedParticipantId))
    if (!match) return

    const matchedId = String(match.id)
    setFocusedParticipantId(matchedId)

    window.requestAnimationFrame(() => {
      participantRowRefs.current[matchedId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    })

    focusAppliedRef.current = true

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("participant_id")
    setSearchParams(nextParams)

    const clearTimer = window.setTimeout(() => {
      setFocusedParticipantId("")
    }, 4500)

    return () => window.clearTimeout(clearTimer)
  }, [requestedParticipantId, participants, searchParams, setSearchParams])

  async function handleCheckIn(participantId) {
    const actionKey = String(participantId)
    if (participantActionLocksRef.current.has(actionKey)) return
    participantActionLocksRef.current.add(actionKey)

    setActionError("")
    updateParticipantsLocal((prev) => prev.map((p) =>
      p.id === participantId ? { ...p, checked_in: true, is_waitlisted: false } : p
    ))
    try {
      await checkInParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      const msg = err.message || "Failed to check in participant"
      const offline = isOfflineError(err)
      if (offline) {
        const nextQueue = enqueueParticipantAction({ type: "checkin", participantId })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: check-in saved locally and queued for sync.")
      } else if (msg.includes("Waiver not verified")) {
        updateParticipantsLocal((prev) => prev.map((p) =>
          p.id === participantId ? { ...p, checked_in: false } : p
        ))
        setActionError("Cannot check in: waiver must be verified first.")
      } else {
        await refreshParticipants()
        setActionError(`Check-in failed: ${msg}`)
      }
    } finally {
      participantActionLocksRef.current.delete(actionKey)
    }
  }

  async function handleRemove(participant) {
    if (!participant?.id) return
    const actionKey = String(participant.id)
    if (participantActionLocksRef.current.has(actionKey)) return
    participantActionLocksRef.current.add(actionKey)

    try {
      const reasonPrompt = [
        `Remove ${participant.first_name} ${participant.last_name} from active roster?`,
        "Choose reason number:",
        "1) No-show",
        "2) Changed mind",
        "3) Duplicate registration",
        "4) Admin correction",
        "5) Safety issue",
        "6) Other",
      ].join("\n")

      const reasonChoice = window.prompt(reasonPrompt, "1")
      if (reasonChoice === null) return

      const selectedReason = REMOVAL_REASON_OPTIONS[(reasonChoice || "").trim()]
      if (!selectedReason) {
        setActionError("Removal cancelled: invalid reason selection.")
        return
      }

      let reasonNote = window.prompt("Optional note for removal log (required if reason is Other):", "")
      if (reasonNote === null) reasonNote = ""

      if (selectedReason.code === "other" && !(reasonNote || "").trim()) {
        setActionError("A note is required when removal reason is Other.")
        return
      }

      setActionError("")
      updateParticipantsLocal((prev) => prev.filter((p) => p.id !== participant.id))
      try {
        await removeParticipant(participant.id, selectedReason.code, (reasonNote || "").trim())
        await refreshParticipants()
        await refreshRemovalLog()
      } catch (err) {
        console.error(err)
        if (isOfflineError(err)) {
          const nextQueue = enqueueParticipantAction({
            type: "remove",
            participantId: participant.id,
            reasonCode: selectedReason.code,
            reasonNote: (reasonNote || "").trim(),
          })
          persistQueuedParticipantActions(nextQueue)
          setActionError("Offline: removal saved locally and queued for sync.")
          return
        }
        await refreshParticipants()
        setActionError(`Failed to remove: ${err.message || "Unknown error"}`)
      }
    } finally {
      participantActionLocksRef.current.delete(actionKey)
    }
  }

  async function handlePromote(participantId) {
    const actionKey = String(participantId)
    if (participantActionLocksRef.current.has(actionKey)) return
    participantActionLocksRef.current.add(actionKey)

    setActionError("")
    updateParticipantsLocal((prev) => prev.map((p) =>
      p.id === participantId ? { ...p, is_waitlisted: false } : p
    ))
    try {
      await promoteParticipant(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({ type: "promote", participantId })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: promotion saved locally and queued for sync.")
        return
      }
      await refreshParticipants()
      setActionError(`Failed to promote: ${err.message || "Unknown error"}`)
    } finally {
      participantActionLocksRef.current.delete(actionKey)
    }
  }

  async function handleVerifyWaiver(participantId) {
    const actionKey = String(participantId)
    if (participantActionLocksRef.current.has(actionKey)) return
    participantActionLocksRef.current.add(actionKey)

    setActionError("")
    updateParticipantsLocal((prev) => prev.map((p) =>
      p.id === participantId ? { ...p, waiver_verified: true } : p
    ))
    try {
      await verifyWaiver(participantId)
      await refreshParticipants()
    } catch (err) {
      console.error(err)
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({ type: "verify_waiver", participantId })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: waiver verification saved locally and queued for sync.")
        return
      }
      await refreshParticipants()
      setActionError(`Failed to verify waiver: ${err.message || "Unknown error"}`)
    } finally {
      participantActionLocksRef.current.delete(actionKey)
    }
  }

  async function handleParticipantTypeChange(participantId, targetOption) {
    const currentParticipant = participants.find((p) => p.id === participantId)
    const nextRole = targetOption?.role || "volunteer"
    const nextVolunteerType = targetOption?.volunteer_type ?? null
    const existingGroups = normalizeGroupSelection(currentParticipant?.volunteer_group_ui)
    const inferredGroup = getGroupForRole(nextVolunteerType)
    const nextGroups = inferredGroup && !existingGroups.includes(inferredGroup)
      ? [...existingGroups, inferredGroup]
      : existingGroups
    const currentAdditional = Array.isArray(currentParticipant?.volunteer_additional_types)
      ? currentParticipant.volunteer_additional_types
      : []
    const nextAdditional = !nextVolunteerType
      ? []
      : currentAdditional
          .map((value) => normalizeVolunteerType(value))
          .filter((value) => value && value !== nextVolunteerType)
          .filter((value) => isRoleAllowedForGroups(value, nextGroups))

    updateParticipantsLocal(prev => prev.map(p => p.id === participantId
      ? {
          ...p,
          role: nextRole,
          volunteer_type: nextVolunteerType,
          volunteer_group_ui: nextGroups.length ? nextGroups.join(",") : null,
          volunteer_additional_types: nextAdditional,
        }
      : p
    ))
    try {
      await updateParticipantType(participantId, {
        role: nextRole,
        volunteer_type: nextVolunteerType,
        volunteer_additional_types: nextAdditional,
      })
    } catch (err) {
      console.error(err)
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({
          type: "update_type",
          participantId,
          payload: {
            role: nextRole,
            volunteer_type: nextVolunteerType,
            volunteer_additional_types: nextAdditional,
          },
        })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: participant type change saved locally and queued for sync.")
        return
      }
      setActionError(`Failed to update participant type: ${err.message || "Unknown error"}`)
      await refreshParticipants()
    }
  }

  async function handleVolunteerGroupChange(participantId, groupSelection) {
    const participant = participants.find((p) => p.id === participantId)
    if (!participant) return

    const nextGroups = normalizeGroupSelection(groupSelection)

    const currentPrimary = normalizeVolunteerType(participant.volunteer_type)
    const currentGroup = getGroupForRole(currentPrimary)
    const keepCurrentPrimary = currentPrimary && currentGroup && nextGroups.includes(currentGroup)
    const nextVolunteerType = keepCurrentPrimary
      ? currentPrimary
      : null

    const currentAdditional = Array.isArray(participant.volunteer_additional_types)
      ? participant.volunteer_additional_types
      : []
    const nextAdditional = !nextVolunteerType
      ? []
      : currentAdditional
          .map((value) => normalizeVolunteerType(value))
          .filter((value) => value && value !== nextVolunteerType)
          .filter((value) => isRoleAllowedForGroups(value, nextGroups))

    updateParticipantsLocal((prev) => prev.map((p) => p.id === participantId
      ? {
          ...p,
          role: "volunteer",
          volunteer_type: nextVolunteerType,
          volunteer_group_ui: nextGroups.length ? nextGroups.join(",") : null,
          volunteer_additional_types: nextAdditional,
        }
      : p
    ))
    try {
      await updateParticipantType(participantId, {
        role: "volunteer",
        volunteer_type: nextVolunteerType,
        volunteer_additional_types: nextAdditional,
      })
    } catch (err) {
      console.error(err)
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({
          type: "update_type",
          participantId,
          payload: {
            role: "volunteer",
            volunteer_type: nextVolunteerType,
            volunteer_additional_types: nextAdditional,
          },
        })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: volunteer group change saved locally and queued for sync.")
        return
      }
      setActionError(`Failed to update volunteer group: ${err.message || "Unknown error"}`)
      await refreshParticipants()
    }
  }

  async function handleAdditionalVolunteerRolesChange(participantId, additionalRoles) {
    const participant = participants.find((p) => p.id === participantId)
    const primaryRole = normalizeVolunteerType(participant?.volunteer_type)
    const selectedGroups = normalizeGroupSelection(participant?.volunteer_group_ui)
    const normalized = Array.from(new Set((additionalRoles || []).map((value) => String(value).toLowerCase())))
      .filter((value) => value !== primaryRole)
      .filter((value) => isRoleAllowedForGroups(value, selectedGroups))

    updateParticipantsLocal(prev => prev.map(p => p.id === participantId
      ? { ...p, volunteer_additional_types: normalized }
      : p
    ))
    try {
      await updateParticipantType(participantId, { volunteer_additional_types: normalized })
    } catch (err) {
      console.error(err)
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({
          type: "update_type",
          participantId,
          payload: { volunteer_additional_types: normalized },
        })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: additional volunteer roles saved locally and queued for sync.")
        return
      }
      setActionError(`Failed to update additional volunteer roles: ${err.message || "Unknown error"}`)
      await refreshParticipants()
    }
  }

  async function handleVersatileFlagChange(participantId, nextValue) {
    const participant = participants.find((p) => p.id === participantId)
    const currentAdditional = Array.isArray(participant?.volunteer_additional_types)
      ? participant.volunteer_additional_types
      : []
    const normalizedAdditional = currentAdditional

    updateParticipantsLocal(prev => prev.map(p => p.id === participantId
      ? { ...p, volunteer_is_versatile: nextValue, volunteer_additional_types: normalizedAdditional }
      : p
    ))
    try {
      await updateParticipantType(participantId, {
        volunteer_is_versatile: nextValue,
        volunteer_additional_types: normalizedAdditional,
      })
    } catch (err) {
      console.error(err)
      if (isOfflineError(err)) {
        const nextQueue = enqueueParticipantAction({
          type: "update_type",
          participantId,
          payload: {
            volunteer_is_versatile: nextValue,
            volunteer_additional_types: normalizedAdditional,
          },
        })
        persistQueuedParticipantActions(nextQueue)
        setActionError("Offline: flexible volunteer setting saved locally and queued for sync.")
        return
      }
      setActionError(`Failed to update flexible volunteer setting: ${err.message || "Unknown error"}`)
      await refreshParticipants()
    }
  }

  async function handleExportRemovalLogCsv() {
    setRemovalLogError("")
    try {
      const { blob, filename } = await exportParticipantRemovalLogCsv({
        ...removalLogFilters,
        limit: 5000,
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      setRemovalLogError(err?.message || "Failed to export CSV")
    }
  }

  const filteredRemovalLogs = removalLogs.filter((row) => {
    const emailFilter = (removalLogFilters.email || "").trim().toLowerCase()
    const reasonFilter = (removalLogFilters.reason_code || "").trim().toLowerCase()
    const eventFilter = (removalLogFilters.event_id || "").trim()
    const eventTypeFilter = (removalLogFilters.event_type || "").trim().toLowerCase()
    const fromFilter = removalLogFilters.date_from || ""
    const toFilter = removalLogFilters.date_to || ""

    const rowEmail = (row.email || "").toLowerCase()
    const rowReason = (row.removed_reason_code || "").toLowerCase()
    const rowEvent = String(row.event_id || "")
    const rowEventType = String(row.event_type || "").trim().toLowerCase()
    const rowDate = (row.created_at || "").slice(0, 10)

    if (emailFilter && !rowEmail.includes(emailFilter)) return false
    if (reasonFilter && rowReason !== reasonFilter) return false
    if (eventFilter && rowEvent !== eventFilter) return false
    if (eventTypeFilter && rowEventType !== eventTypeFilter) return false
    if (fromFilter && rowDate && rowDate < fromFilter) return false
    if (toFilter && rowDate && rowDate > toFilter) return false

    return true
  })

  const totalRemovalLogPages = Math.max(1, Math.ceil(filteredRemovalLogs.length / REMOVAL_LOG_PAGE_SIZE))
  const safeRemovalLogPage = Math.min(removalLogPage, totalRemovalLogPages)
  const removalLogStart = (safeRemovalLogPage - 1) * REMOVAL_LOG_PAGE_SIZE
  const pagedRemovalLogs = filteredRemovalLogs.slice(removalLogStart, removalLogStart + REMOVAL_LOG_PAGE_SIZE)

  useEffect(() => {
    setRemovalLogPage(1)
  }, [removalLogFilters.email, removalLogFilters.reason_code, removalLogFilters.event_id, removalLogFilters.event_type, removalLogFilters.date_from, removalLogFilters.date_to])

  useEffect(() => {
    if (removalLogPage > totalRemovalLogPages) {
      setRemovalLogPage(totalRemovalLogPages)
    }
  }, [removalLogPage, totalRemovalLogPages])

  function applyRemovalLogQuickFilter(type) {
    const today = new Date()
    const toIsoDate = (d) => d.toISOString().slice(0, 10)

    if (type === "no_show") {
      setRemovalLogFilters((prev) => ({
        ...prev,
        reason_code: "no_show",
      }))
      return
    }

    if (type === "today") {
      const todayIso = toIsoDate(today)
      setRemovalLogFilters((prev) => ({
        ...prev,
        date_from: todayIso,
        date_to: todayIso,
      }))
      return
    }

    if (type === "last_30") {
      const from = new Date(today)
      from.setDate(from.getDate() - 30)
      setRemovalLogFilters((prev) => ({
        ...prev,
        date_from: toIsoDate(from),
        date_to: toIsoDate(today),
      }))
      return
    }

    if (type === "clear") {
      setRemovalLogFilters({
        email: "",
        reason_code: "",
        event_id: "",
        event_type: "",
        date_from: "",
        date_to: "",
      })
    }
  }

  const removalEventOptions = Array.from(
    new Map([
      ...allEventsForFilters
        .map((event) => [
          String(event.id || ""),
          {
            id: String(event.id || ""),
            title: event.title || String(event.id || ""),
            event_type: String(event.event_type || "").trim().toLowerCase(),
          },
        ])
        .filter(([eventId]) => Boolean(eventId)),
      ...removalLogs
        .map((row) => [
          String(row.event_id || ""),
          {
            id: String(row.event_id || ""),
            title: row.event_title || String(row.event_id || ""),
            event_type: String(row.event_type || "").trim().toLowerCase(),
          },
        ])
        .filter(([eventId]) => Boolean(eventId)),
    ]).values()
  ).sort((left, right) => String(left.title).localeCompare(String(right.title)))

  const filteredRemovalEventOptions = removalEventOptions.filter((event) => {
    if (!removalLogFilters.event_type) return true
    return String(event.event_type || "").trim().toLowerCase() === removalLogFilters.event_type
  })

  const removalEventTypeOptions = Array.from(
    new Set(
      removalLogs
        .map((row) => String(row.event_type || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right))

  const participantFormEventId = createEventId ? String(createEventId) : null
  const participantFormEventType = normalizeParticipantFormEventType(createEventMeta?.event_type)

  return (

    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold flex-1 min-w-[180px]">Participants</h1>
        <BackButton fallbackTo="/dashboard" className="" />
        <button
          type="button"
          onClick={() => navigate("/event-templates")}
          className="px-3 py-2 sm:py-1 bg-sky-100 text-sky-800 rounded hover:bg-sky-200 text-sm"
        >
          Templates
        </button>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-3 py-2 sm:py-1 rounded bg-emerald-600 text-sm text-white hover:bg-emerald-700"
        >
          Add Participant
        </button>
        <button
          onClick={async () => {
            await refreshParticipants()
            await refreshRemovalLog()
            await refreshFilterEvents()
          }}
          className="px-3 py-2 sm:py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
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

      <ParticipantForm
        isOpen={createModalOpen}
        onClose={closeCreateModal}
        onSubmit={handleCreateParticipantSubmit}
        onEventChange={(eventId) => {
          setCreateEventId(eventId)
          loadCreateEventSessions(eventId)
        }}
        eventOptions={createEventOptions}
        sessions={createSessions}
        eventId={participantFormEventId}
        eventType={participantFormEventType}
        defaultEventId={createEventId}
        lockEvent={false}
        title="Add Participant"
        submitLabel="Add Participant"
      />

      <ParticipantForm
        isOpen={editModalOpen}
        onClose={closeEditModal}
        onSubmit={handleEditParticipantSubmit}
        onEventChange={(eventId) => {
          setCreateEventId(eventId)
          loadCreateEventSessions(eventId)
        }}
        eventOptions={createEventOptions}
        sessions={createSessions}
        eventId={participantFormEventId}
        eventType={participantFormEventType}
        defaultEventId={createEventId}
        initialData={editingParticipant}
        lockEvent={false}
        title="Edit Participant"
        submitLabel="Save Changes"
      />

      {(pendingQueueCount > 0 || failedQueueCount > 0) && (
        <div className="mb-3 space-y-2 rounded border border-amber-400 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <div>
            Offline queue active: {pendingQueueCount} pending · {failedQueueCount} failed.
            {!browserOnline ? " Device is offline." : " Syncing will continue while online."}
          </div>
          {queueNotice && <div>{queueNotice}</div>}
          {failedQueueCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => retryAllFailed(queuedParticipantActions)}
                className="text-xs text-blue-600 underline"
              >
                Retry All Failed ({failedQueueCount})
              </button>
              <button
                type="button"
                onClick={retryRecoverableQueueActions}
                className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
              >
                Retry recoverable
              </button>
              <button
                type="button"
                onClick={dismissFailedQueueActions}
                className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
              >
                Dismiss failed
              </button>
            </div>
          )}
        </div>
      )}

      {actionError && (
        <div className="mb-3 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="ml-4 text-red-500 font-bold">✕</button>
        </div>
      )}

      {createToast && (
        <div className="fixed right-4 top-4 z-50 rounded border px-4 py-3 text-sm shadow-lg bg-white">
          <div className="flex items-center gap-3">
            <span
              className={`font-medium ${
                createToast.tone === "error"
                  ? "text-red-700"
                  : createToast.tone === "info"
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              {createToast.message}
            </span>
            {createToast.retryQueueItemId && (
              <button
                type="button"
                onClick={() => {
                  retryQueueItem(createToast.retryQueueItemId)
                  dismissCreateToast()
                }}
                className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={dismissCreateToast}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 text-center sticky top-0 bg-warmbg z-10 pb-2">

        <input
          type="text"
          placeholder="Search participants..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full border rounded p-2 mb-2"
          aria-label="Search participants"
        />

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowParticipantFilters((prev) => !prev)}
            className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-2 sm:py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {showParticipantFilters ? "Hide filters" : "Filter by Event / Type"}
          </button>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setShowAssistanceNeededOnly((prev) => !prev)}
              className={`rounded-full border px-3 py-2 sm:py-1 text-xs font-medium transition ${
                showAssistanceNeededOnly
                  ? "border-sky-400 bg-sky-600 text-white"
                  : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
              }`}
            >
              Show Assistance Needed
            </button>
            <button
              type="button"
              onClick={() => setEventAssociationFilter("all")}
              className={`rounded-full border px-3 py-2 sm:py-1 text-xs font-medium transition ${
                eventAssociationFilter === "all"
                  ? "border-slate-400 bg-slate-700 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              All ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => setEventAssociationFilter("upcoming_active")}
              className={`rounded-full border px-3 py-2 sm:py-1 text-xs font-medium transition ${
                eventAssociationFilter === "upcoming_active"
                  ? "border-emerald-400 bg-emerald-600 text-white"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              Upcoming/Active ({participantAssociationCounts.upcoming_active || 0})
            </button>
            <button
              type="button"
              onClick={() => setEventAssociationFilter("past_archived")}
              className={`rounded-full border px-3 py-2 sm:py-1 text-xs font-medium transition ${
                eventAssociationFilter === "past_archived"
                  ? "border-amber-400 bg-amber-600 text-white"
                  : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              }`}
            >
              Past/Archived ({participantAssociationCounts.past_archived || 0})
            </button>
            <button
              type="button"
              onClick={() => setEventAssociationFilter("unlinked")}
              className={`rounded-full border px-3 py-2 sm:py-1 text-xs font-medium transition ${
                eventAssociationFilter === "unlinked"
                  ? "border-slate-500 bg-slate-700 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              No Event Match ({participantAssociationCounts.unlinked || 0})
            </button>
          </div>

          {(participantFilters.event_id || participantFilters.event_type || showAssistanceNeededOnly) && (
            <button
              type="button"
              onClick={() => {
                setParticipantFilters({ event_id: "", event_type: "", session_id: "" })
                setShowAssistanceNeededOnly(false)
              }}
              className="inline-flex items-center rounded border border-gray-300 bg-gray-50 px-2.5 py-2 sm:py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Clear participant filters
            </button>
          )}
        </div>

        {showParticipantFilters && (
          <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <select
              value={participantFilters.event_type}
              onChange={(e) =>
                setParticipantFilters((prev) => ({
                  ...prev,
                  event_type: e.target.value,
                  event_id: "",
                  session_id: "",
                }))
              }
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All event types</option>
              {participantEventTypeOptions.map((eventType) => (
                <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>
              ))}
            </select>

            <select
              value={participantFilters.event_id}
              onChange={(e) => setParticipantFilters((prev) => ({ ...prev, event_id: e.target.value, session_id: "" }))}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All events</option>
              {filteredParticipantEventOptions.map((event) => (
                <option key={event.id} value={event.id}>{event.title}</option>
              ))}
            </select>

            <select
              value={participantFilters.session_id}
              onChange={(e) => setParticipantFilters((prev) => ({ ...prev, session_id: e.target.value }))}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              disabled={!participantFilters.event_id}
            >
              <option value="">{participantFilters.event_id ? "All sessions" : "Select an event first"}</option>
              {participantSessionOptions.map((session) => (
                <option key={session.id} value={session.id}>{session.name}</option>
              ))}
            </select>
          </div>
        )}

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
      <div className="bg-white rounded-xl shadow overflow-auto max-h-[70vh]">

        <table className="w-full min-w-[980px] text-sm">

          <thead className="bg-gray-50 border-b sticky top-0 z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="w-36 px-2 py-3">Name</th>
              <th className="w-44 px-2 py-3">Email</th>
              <th className="w-20 px-1.5 py-3">Event</th>
              <th className="w-24 px-1.5 py-3">Event Type</th>
              <th className="w-20 px-1 py-3 text-center">Priority</th>
              <th className="w-12 px-2 py-3 text-center">WVR</th>
              <th className="w-12 px-2 py-3 text-center">CHK</th>
              <th className="w-12 px-2 py-3 text-center">STS</th>
              <th className="w-16 px-2 py-3 text-center">Actions</th>
            </tr>
            <tr className="border-t text-[10px] text-gray-600">
              <th className="px-2 pb-2 align-top">
                <div className="inline-flex flex-wrap items-center gap-2">
                  {PARTICIPANT_TYPE_OPTIONS.map((opt) => (
                    <span key={opt.key} className="inline-flex items-center gap-1">
                      <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-gray-300 bg-white">
                        <span className={`h-1.5 w-1.5 rounded-full ${opt.dotClass}`} />
                      </span>
                      {opt.label}
                    </span>
                  ))}
                </div>
              </th>
              <th className="px-2 pb-2" colSpan={4}></th>
              <th className="px-2 pb-2 text-center font-medium">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  {WAIVER_LEGEND.map((item) => (
                    <span key={String(item.value)} className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                      {item.label}
                    </span>
                  ))}
                </span>
              </th>
              <th className="px-2 pb-2 text-center font-medium">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  {CHECKIN_LEGEND.map((item) => (
                    <span key={item.value} className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                      {item.label}
                    </span>
                  ))}
                </span>
              </th>
              <th className="px-2 pb-2 text-center font-medium">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-yellow-400" />
                    Waitlisted
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-500" />
                    Confirmed
                  </span>
                </span>
              </th>
              <th className="px-2 pb-2" />
            </tr>
            
          </thead>

          <tbody>

            {filteredParticipants.map((p) => {
              const clampedPriority = Math.max(0, Math.min(3, p.priority));
              const isVolunteerRow = normalizeRole(p.role) === "volunteer"
              const eventAssociation = classifyParticipantEventAssociation(p, eventsById, todayIso)
              const syncItem = getSyncStatus(p.id, queuedParticipantActions)
              return (
                <tr
                  key={p.id}
                  ref={(node) => {
                    participantRowRefs.current[String(p.id)] = node
                  }}
                  className={`border-b transition ${focusedParticipantId === String(p.id)
                    ? "ring-2 ring-sky-400 bg-sky-50/60"
                    : isVolunteerRow
                      ? "bg-cyan-50/45 hover:bg-cyan-100/60"
                      : "bg-amber-50/35 hover:bg-amber-100/50"
                  }`}
                >
                  <td className="w-36 px-2 py-2 font-medium text-gray-900" title={`${p.first_name} ${p.last_name}`}>
                    <span className="mb-1 inline-flex items-center gap-1.5">
                      <SyncStateIndicator state={queueStateByParticipant[String(p.id)] || "synced"} />
                      <span className="block truncate whitespace-nowrap">{p.first_name} {p.last_name}</span>
                    </span>
                    {syncItem?.syncStatus === "pending" && (
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <SyncStatusIcon status={syncItem.status} />
                        <span>Syncing</span>
                      </div>
                    )}
                    {syncItem?.syncStatus === "failed" && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 text-red-600">
                          <SyncStatusIcon status={syncItem.status} />
                          <span>Failed</span>
                        </span>
                        {syncItem.retryable && (
                          <button
                            type="button"
                            onClick={() => retryQueueItem(syncItem.id)}
                            className="text-blue-600 underline"
                          >
                            Retry
                          </button>
                        )}
                        {syncItem.error && (
                          <span className="text-gray-500">({syncItem.error})</span>
                        )}
                      </div>
                    )}
                    {Number(p.no_show_count || 0) > 0 && (
                      <span className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {p.no_show_count} prior no-show{p.no_show_count === 1 ? "" : "s"}
                      </span>
                    )}
                    {p.requires_assistance && (
                      <span className="mt-1 inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                        Needs Assistance
                      </span>
                    )}
                    <ParticipantTypeRadioGroup
                      participant={p}
                      onChange={(option) => handleParticipantTypeChange(p.id, option)}
                      onGroupChange={(group) => handleVolunteerGroupChange(p.id, group)}
                      onAdditionalRolesChange={(roles) => handleAdditionalVolunteerRolesChange(p.id, roles)}
                      onVersatileChange={(value) => handleVersatileFlagChange(p.id, value)}
                    />
                  </td>
                  <td className="w-44 px-2 py-2 text-xs text-gray-500" title={p.email}>
                    <span className="block truncate whitespace-nowrap">{p.email}</span>
                  </td>
                  <td className="w-20 px-1.5 py-2 text-gray-700" title={p.event_title}>
                    <span className="block truncate whitespace-nowrap">{p.event_title}</span>
                    <span className={`mt-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${eventAssociation.pillClass}`}>
                      {eventAssociation.label}
                    </span>
                  </td>
                  <td className="w-24 px-1.5 py-2 text-gray-700" title={formatEventType(p.event_type)}>
                    <span className="block truncate whitespace-nowrap">{formatEventType(p.event_type)}</span>
                  </td>
                  <td className="w-20 px-1 py-2 text-center">
                    <PriorityDropdown
                      current={clampedPriority}
                      onChange={level => handlePriorityChange(p.id, level)}
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${p.waiver_verified ? "bg-green-500" : "bg-orange-600"}`}
                      title={p.waiver_verified ? "Waiver Verified" : "Waiver Pending"}
                    />
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${
                        p.checked_in ? "bg-green-500" : p.is_waitlisted ? "bg-yellow-400" : "bg-orange-600"
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
                      onEdit={openEditModal}
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

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Removal History</h2>
          {isRemovalLogLoading && <span className="text-xs text-gray-500">Loading...</span>}
          <button
            type="button"
            onClick={handleExportRemovalLogCsv}
            className="ml-auto rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
          >
            Export CSV
          </button>
        </div>

        {removalLogError && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {removalLogError}
          </div>
        )}

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-6">
          <input
            type="text"
            value={removalLogFilters.email}
            onChange={(e) => setRemovalLogFilters((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Filter by email"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <select
            value={removalLogFilters.reason_code}
            onChange={(e) => setRemovalLogFilters((prev) => ({ ...prev, reason_code: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All reasons</option>
            {Object.entries(REMOVAL_REASON_CODE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <select
            value={removalLogFilters.event_type}
            onChange={(e) => setRemovalLogFilters((prev) => ({ ...prev, event_type: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All event types</option>
            {removalEventTypeOptions.map((eventType) => (
              <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>
            ))}
          </select>
          <select
            value={removalLogFilters.event_id}
            onChange={(e) => setRemovalLogFilters((prev) => ({ ...prev, event_id: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All events</option>
            {filteredRemovalEventOptions.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
          <input
            type="date"
            value={removalLogFilters.date_from}
            onChange={(e) => setRemovalLogFilters((prev) => ({ ...prev, date_from: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={removalLogFilters.date_to}
            onChange={(e) => setRemovalLogFilters((prev) => ({ ...prev, date_to: e.target.value }))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyRemovalLogQuickFilter("no_show")}
            className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            No-show
          </button>
          <button
            type="button"
            onClick={() => applyRemovalLogQuickFilter("today")}
            className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyRemovalLogQuickFilter("last_30")}
            className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100"
          >
            Last 30 days
          </button>
          <button
            type="button"
            onClick={() => applyRemovalLogQuickFilter("clear")}
            className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Clear filters
          </button>
          <span className="ml-auto text-xs text-gray-500">
            {filteredRemovalLogs.length} matching record{filteredRemovalLogs.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-auto rounded border border-gray-100">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Participant</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Event Type</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Stage</th>
                <th className="px-2 py-2">Removed By</th>
                <th className="px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {pagedRemovalLogs.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-2 whitespace-nowrap">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.first_name} {row.last_name}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.email}</td>
                  <td className="px-2 py-2 whitespace-nowrap" title={row.event_id}>{row.event_title || row.event_id}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatEventType(row.event_type)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{REMOVAL_REASON_CODE_LABELS[row.removed_reason_code] || row.removed_reason_code}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.removed_stage}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.removed_by_user_email || row.removed_by_user_id || "-"}</td>
                  <td className="px-2 py-2">{row.removed_reason_note || "-"}</td>
                </tr>
              ))}
              {filteredRemovalLogs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2 py-4 text-center text-gray-500">No removal records match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span>
            Page {safeRemovalLogPage} of {totalRemovalLogPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRemovalLogPage((prev) => Math.max(1, prev - 1))}
              disabled={safeRemovalLogPage <= 1}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setRemovalLogPage((prev) => Math.min(totalRemovalLogPages, prev + 1))}
              disabled={safeRemovalLogPage >= totalRemovalLogPages}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}