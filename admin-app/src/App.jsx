import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom"
import BottomNav from "./components/BottomNav"
import AppLayout from "./components/AppLayout"
import GlobalSearch from "./components/GlobalSearch"
import CommandPalette from "./components/CommandPalette"
import Dashboard from "./pages/Dashboard"
import Events from "./pages/Events"
import Participants from "./pages/Participants"
import Login from "./pages/Login"
import EventDetail from "./pages/EventDetail"
import CreateEvent from "./pages/CreateEvent"
import EditEvent from "./pages/EditEvent"
import CheckIn from "./pages/CheckIn"
import FastAssign from "./pages/FastAssign"
import FeedbackReview from "./pages/FeedbackReview"
import EventTemplates from "./pages/EventTemplates"
import WaiverTemplates from "./pages/WaiverTemplates"
import VolunteerDashboard from "./pages/VolunteerDashboard"
import ExecutiveDashboard from "./pages/ExecutiveDashboard"
import Communications from "./pages/Communications"
import {
  clearAuthSession,
  fetchMyProfile,
  getAuthChangedEventName,
  getStoredProfile,
  getStoredToken,
  promoteUserToAdminByEmail,
} from "./api/auth"
import { fetchAllParticipants, fetchEvents, fetchVolunteerDashboard } from "./api/events"
import { getReleaseTag } from "./config/release"

const GLOBAL_SEARCH_RECENTS_STORAGE_KEY = "sfa.globalSearchRecents"
const GLOBAL_SEARCH_RECENTS_LIMIT = 10

function getBuildFingerprint() {
  const envFingerprint = import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_APP_VERSION
  if (envFingerprint) return String(envFingerprint)

  if (typeof document === "undefined") return "unknown"

  const scriptSrc = Array.from(document.scripts)
    .map((script) => script.src || "")
    .find((src) => src.includes("/assets/") && /\.js(?:\?.*)?$/.test(src))

  if (!scriptSrc) return import.meta.env.DEV ? "dev-local" : "unknown"

  const hashMatch = scriptSrc.match(/\/assets\/[^/]*?-([A-Za-z0-9_-]{6,})\.js(?:\?.*)?$/)
  if (hashMatch?.[1]) return hashMatch[1]

  return import.meta.env.DEV ? "dev-local" : "unknown"
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function formatSearchDate(value) {
  if (!value) return ""

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

function formatSearchTime(value) {
  if (!value) return ""

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

function scoreSearchItem(item, query) {
  if (!query) return 0

  const searchText = normalizeSearchText(item.searchText)
  if (!searchText) return 0

  const title = normalizeSearchText(item.title)
  const subtitle = normalizeSearchText(item.subtitle)
  const detail = normalizeSearchText(item.detail)

  if (!searchText.includes(query)) return 0

  let score = 40
  if (title === query) score += 60
  else if (title.startsWith(query)) score += 30

  if (subtitle.includes(query)) score += 10
  if (detail.includes(query)) score += 8

  const tokens = query.split(" ").filter(Boolean)
  if (tokens.length > 1 && tokens.every((token) => searchText.includes(token))) {
    score += 12
  }

  return score
}

function buildParticipantDetailPath({ participantId, eventId, eventType, sessionId, searchText }) {
  const params = new URLSearchParams()

  if (participantId) params.set("participant_id", String(participantId))
  if (eventId) params.set("event_id", String(eventId))
  if (eventType) params.set("event_type", String(eventType).trim().toLowerCase())
  if (sessionId) params.set("session_id", String(sessionId))
  if (searchText) params.set("search", String(searchText))

  return `/participants?${params.toString()}`
}

function buildGlobalSearchSections(query, data) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const eventResults = (Array.isArray(data.events) ? data.events : [])
    .map((event) => {
      const item = {
        kind: "event",
        id: `event:${event.id}`,
        title: event.title || "Untitled event",
        subtitle: [event.status, event.event_type, formatSearchDate(event.start_date)].filter(Boolean).join(" • "),
        detail: [event.location?.venue, event.location?.city, event.location?.state].filter(Boolean).join(", "),
        badgeLabel: "EV",
        badgeClass: "bg-sky-100 text-sky-800",
        to: `/events/${event.id}`,
        searchText: [
          event.title,
          event.slug,
          event.status,
          event.event_type,
          event.start_date,
          event.end_date,
          event.location?.venue,
          event.location?.city,
          event.location?.state,
          event.directions,
          event.internal_notes,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const participantResults = (Array.isArray(data.participants) ? data.participants : [])
    .map((participant) => {
      const fullName = [participant.first_name, participant.last_name].filter(Boolean).join(" ").trim() || participant.email || "Unnamed participant"
      const item = {
        kind: "participant",
        id: `participant:${participant.id}`,
        title: fullName,
        subtitle: [participant.email, participant.event_title, participant.session_name].filter(Boolean).join(" • "),
        detail: [participant.role, participant.volunteer_type].filter(Boolean).join(" • "),
        badgeLabel: participant.role === "volunteer" ? "VT" : "PT",
        badgeClass: participant.role === "volunteer" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800",
        to: buildParticipantDetailPath({
          participantId: participant.id,
          eventId: participant.event_id,
          eventType: participant.event_type,
          sessionId: participant.session_id,
          searchText: fullName,
        }),
        searchText: [
          fullName,
          participant.email,
          participant.phone,
          participant.event_title,
          participant.session_name,
          participant.role,
          participant.volunteer_type,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const volunteerResults = (Array.isArray(data.volunteers) ? data.volunteers : [])
    .map((volunteer) => {
      const item = {
        kind: "volunteer",
        id: `volunteer:${volunteer.participant_id || volunteer.id}`,
        title: volunteer.full_name || volunteer.email || "Unnamed volunteer",
        subtitle: [volunteer.event_title, volunteer.session_name || "Unassigned"].filter(Boolean).join(" • "),
        detail: [volunteer.computed_status, volunteer.waiver_document_status, volunteer.compliance_status].filter(Boolean).join(" • "),
        badgeLabel: "VO",
        badgeClass: "bg-teal-100 text-teal-800",
        to: buildParticipantDetailPath({
          participantId: volunteer.participant_id,
          eventId: volunteer.event_id,
          eventType: volunteer.event_type,
          sessionId: volunteer.session_id,
          searchText: volunteer.full_name || volunteer.email || query,
        }),
        searchText: [
          volunteer.full_name,
          volunteer.email,
          volunteer.event_title,
          volunteer.session_name,
          volunteer.computed_status,
          volunteer.status_reasons,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const sessionResults = (Array.isArray(data.events) ? data.events : []).flatMap((event) =>
    (Array.isArray(event.sessions) ? event.sessions : []).map((session) => {
      const item = {
        kind: "session",
        id: `session:${event.id}:${session.id}`,
        title: session.name || "Untitled session",
        subtitle: [event.title, session.start_time ? formatSearchTime(session.start_time) : ""].filter(Boolean).join(" • "),
        detail: session.capacity != null ? `${session.participant_count || 0}/${session.capacity} participants` : `${session.participant_count || 0} participants`,
        badgeLabel: "SS",
        badgeClass: "bg-amber-100 text-amber-800",
        to: `/events/${event.id}?session_id=${encodeURIComponent(session.id)}`,
        searchText: [
          session.name,
          event.title,
          event.event_type,
          event.status,
          session.start_time,
          session.capacity,
          session.participant_count,
        ].join(" "),
      }

      return { ...item, score: scoreSearchItem(item, normalizedQuery) }
    })
  )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))

  const sections = [
    { label: "Events", items: eventResults.slice(0, 5) },
    { label: "Participants", items: participantResults.slice(0, 5) },
    { label: "Volunteers", items: volunteerResults.slice(0, 5) },
    { label: "Sessions", items: sessionResults.slice(0, 5) },
  ]

  return sections.filter((section) => section.items.length > 0)
}

function readGlobalSearchRecents() {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(GLOBAL_SEARCH_RECENTS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => item && typeof item === "object" && item.id && item.title && item.to)
      .slice(0, GLOBAL_SEARCH_RECENTS_LIMIT)
  } catch {
    return []
  }
}

function writeGlobalSearchRecents(items) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      GLOBAL_SEARCH_RECENTS_STORAGE_KEY,
      JSON.stringify(items.slice(0, GLOBAL_SEARCH_RECENTS_LIMIT))
    )
  } catch {
    // Ignore storage write failures and keep in-memory state only.
  }
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [token, setToken] = useState(() => getStoredToken())
  const [profile, setProfile] = useState(() => getStoredProfile())
  const [buildFingerprint, setBuildFingerprint] = useState(() => (import.meta.env.DEV ? "dev-local" : "..."))
  const [globalSearchInput, setGlobalSearchInput] = useState("")
  const [globalSearchQuery, setGlobalSearchQuery] = useState("")
  const [globalSearchData, setGlobalSearchData] = useState({
    events: [],
    participants: [],
    volunteers: [],
  })
  const [globalSearchRecents, setGlobalSearchRecents] = useState(() => readGlobalSearchRecents())
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [globalSearchError, setGlobalSearchError] = useState("")
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const commandPaletteReturnFocusRef = useRef(null)

  useEffect(() => {
    const authChangedEvent = getAuthChangedEventName()

    const syncSession = () => {
      setToken(getStoredToken())
      setProfile(getStoredProfile())
    }

    window.addEventListener(authChangedEvent, syncSession)
    window.addEventListener("storage", syncSession)

    return () => {
      window.removeEventListener(authChangedEvent, syncSession)
      window.removeEventListener("storage", syncSession)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setProfile(null)
      setGlobalSearchData({ events: [], participants: [], volunteers: [] })
      setGlobalSearchError("")
      setGlobalSearchInput("")
      setGlobalSearchQuery("")
      return
    }

    if (profile?.email) return

    let isCancelled = false
    fetchMyProfile(token)
      .then((nextProfile) => {
        if (!isCancelled) {
          setProfile(nextProfile)
        }
      })
      .catch((error) => {
        const message = String(error?.message || "").toLowerCase()
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false
        const isNetworkFailure = message.includes("failed to fetch") || message.includes("network")

        // Keep the current auth session during offline/network interruptions.
        if (isOffline || isNetworkFailure) return

        clearAuthSession()
      })

    return () => {
      isCancelled = true
    }
  }, [token, profile?.email])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setGlobalSearchQuery(globalSearchInput)
    }, 220)

    return () => window.clearTimeout(timeoutId)
  }, [globalSearchInput])

  const loadGlobalSearchData = useCallback(async () => {
    setGlobalSearchLoading(true)
    setGlobalSearchError("")

    try {
      const [eventsResult, participantsResult, volunteerResult] = await Promise.allSettled([
        fetchEvents(),
        fetchAllParticipants(),
        fetchVolunteerDashboard(),
      ])

      setGlobalSearchData((prev) => ({
        events: eventsResult.status === "fulfilled" && Array.isArray(eventsResult.value)
          ? eventsResult.value
          : prev.events,
        participants: participantsResult.status === "fulfilled" && Array.isArray(participantsResult.value)
          ? participantsResult.value
          : prev.participants,
        volunteers: volunteerResult.status === "fulfilled" && Array.isArray(volunteerResult.value?.volunteers)
          ? volunteerResult.value.volunteers
          : prev.volunteers,
      }))

      const failures = [
        eventsResult.status === "rejected" ? `events: ${eventsResult.reason?.message || "failed to load"}` : null,
        participantsResult.status === "rejected" ? `participants: ${participantsResult.reason?.message || "failed to load"}` : null,
        volunteerResult.status === "rejected" ? `volunteers: ${volunteerResult.reason?.message || "failed to load"}` : null,
      ].filter(Boolean)

      setGlobalSearchError(failures.length ? `Some search sources are unavailable. Showing best available results (${failures.join(", ")}).` : "")
      return failures
    } finally {
      setGlobalSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setGlobalSearchLoading(false)
      setGlobalSearchError("")
      return
    }

    const normalizedQuery = normalizeSearchText(globalSearchQuery)
    if (!normalizedQuery) {
      setGlobalSearchLoading(false)
      setGlobalSearchError("")
      return
    }

    let isCancelled = false
    loadGlobalSearchData().catch(() => {
      if (isCancelled) return
    })

    return () => {
      isCancelled = true
    }
  }, [token, globalSearchQuery, loadGlobalSearchData])

  useEffect(() => {
    writeGlobalSearchRecents(globalSearchRecents)
  }, [globalSearchRecents])

  useEffect(() => {
    const refreshBuildFingerprint = () => {
      setBuildFingerprint(getBuildFingerprint())
    }

    refreshBuildFingerprint()
    window.addEventListener("load", refreshBuildFingerprint)

    return () => {
      window.removeEventListener("load", refreshBuildFingerprint)
    }
  }, [])

  const handleSignOut = () => {
    clearAuthSession()
    setToken(null)
    setProfile(null)
    setGlobalSearchInput("")
    setGlobalSearchQuery("")
  }

  const handlePromoteUser = async () => {
    const emailInput = window.prompt("Enter the registered email to promote to admin:")
    if (emailInput === null) return

    const email = emailInput.trim()
    if (!email) {
      window.alert("Email is required.")
      return
    }

    try {
      const updated = await promoteUserToAdminByEmail(email, token)
      window.alert(`${updated.email} is now ${updated.role}.`)
    } catch (error) {
      window.alert(error?.message || "Could not promote user")
    }
  }

  const getTitle = () => {
    switch (location.pathname) {
      case "/":
        return "Dashboard"
      case "/events":
        return "Events"
      case "/participants":
        return "Participants"
      case "/event-templates":
        return "Event Templates"
      case "/feedback":
        return "Feedback"
      case "/waiver-templates":
        return "Waiver Templates"
      case "/volunteer-dashboard":
        return "Volunteer Dashboard"
      case "/executive-dashboard":
        return "Executive Dashboard"
      case "/communications":
        return "Communications"
      default:
        if (location.pathname.startsWith("/event-templates")) {
          return "Event Templates"
        }
        if (location.pathname.startsWith("/waiver-templates")) {
          return "Waiver Templates"
        }
        if (location.pathname.startsWith("/volunteer-dashboard")) {
          return "Volunteer Dashboard"
        }
        if (location.pathname.startsWith("/executive-dashboard")) {
          return "Executive Dashboard"
        }
        if (location.pathname.startsWith("/communications")) {
          return "Communications"
        }
        return "Surfers Admin"
    }
  }

  const commandPaletteCommands = useMemo(() => {
    const navigationCommands = [
      { id: "go-dashboard", label: "Open Dashboard", description: "Go to dashboard home", group: "Navigation", to: "/" },
      { id: "go-events", label: "Open Events", description: "View and manage events", group: "Navigation", to: "/events" },
      { id: "go-participants", label: "Open Participants", description: "Manage participant roster", group: "Navigation", to: "/participants" },
      { id: "go-volunteers", label: "Open Volunteer Dashboard", description: "View volunteer operations", group: "Navigation", to: "/volunteer-dashboard" },
      { id: "go-executive", label: "Open Executive Dashboard", description: "View analytics and diagnostics", group: "Navigation", to: "/executive-dashboard" },
      { id: "go-communications", label: "Open Communications", description: "Review delivery and messages", group: "Navigation", to: "/communications" },
      { id: "go-feedback", label: "Open Feedback", description: "Review operator feedback", group: "Navigation", to: "/feedback" },
      { id: "go-waivers", label: "Open Waiver Templates", description: "Manage waiver templates", group: "Navigation", to: "/waiver-templates" },
      { id: "go-event-templates", label: "Open Event Templates", description: "Manage event templates", group: "Navigation", to: "/event-templates" },
    ]

    const recentSearchCommands = globalSearchRecents.map((item) => ({
      id: `recent-search:${item.id}`,
      label: item.title,
      description: [item.subtitle, item.kind ? `Type: ${item.kind}` : "", item.lastUsedAt ? `Recent: ${formatSearchTime(item.lastUsedAt)}` : ""]
        .filter(Boolean)
        .join(" • "),
      group: "Recent Searches",
      to: item.to,
    }))

    const operationalCommands = [
      { id: "events-live", label: "Open Live Events", description: "View published events", group: "Operations", to: "/events?status=published&type=all" },
      { id: "exec-attention", label: "Open Executive Attention", description: "Jump to executive attention section", group: "Operations", to: "/executive-dashboard?focus=attention" },
      { id: "exec-metrics", label: "Open Executive Metrics", description: "Jump to executive metrics section", group: "Operations", to: "/executive-dashboard?focus=metrics" },
      { id: "communications-deliveries", label: "Open Communications Deliveries", description: "Jump to delivery health workflow", group: "Operations", to: "/communications?focus=deliveries" },
      { id: "new-event", label: "Create Event", description: "Start a new event", group: "Actions", to: "/events/new" },
      { id: "open-feedback-form", label: "Open Feedback Form", description: "Open event creation feedback form in a new tab", group: "Operations", actionKey: "open-feedback-form" },
      { id: "refresh-search-sources", label: "Refresh Search Sources", description: "Reload events, participants, and volunteer data", group: "Operations", actionKey: "refresh-search-sources" },
      { id: "refresh-page", label: "Refresh Current Page", description: "Reload the current page", group: "Operations", actionKey: "refresh-page" },
      { id: "sign-out", label: "Sign Out", description: "End your admin session", group: "Operations", actionKey: "sign-out" },
    ]

    const adminOnlyCommands = profile?.role === "admin"
      ? [{ id: "promote-user", label: "Promote User", description: "Promote a registered user to admin", group: "Operations", actionKey: "promote-user" }]
      : []

    return token
      ? [...navigationCommands, ...recentSearchCommands, ...operationalCommands, ...adminOnlyCommands]
      : []
  }, [token, profile?.role, globalSearchRecents])

  const openCommandPalette = useCallback(() => {
    commandPaletteReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setCommandPaletteOpen(true)
  }, [])

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false)

    const previousFocus = commandPaletteReturnFocusRef.current
    if (previousFocus && typeof previousFocus.focus === "function") {
      window.setTimeout(() => previousFocus.focus(), 0)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setCommandPaletteOpen(false)
      return
    }

    const onKeyDown = (event) => {
      const key = String(event.key || "").toLowerCase()
      const target = event.target
      const isEditableTarget = target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        if (event.repeat || isEditableTarget) return
        event.preventDefault()
        if (commandPaletteOpen) {
          closeCommandPalette()
        } else {
          openCommandPalette()
        }
      }

      if (key === "escape") {
        closeCommandPalette()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [token, commandPaletteOpen, openCommandPalette, closeCommandPalette])

  const searchSections = useMemo(() => buildGlobalSearchSections(globalSearchQuery, globalSearchData), [globalSearchQuery, globalSearchData])

  const handleGlobalSearchSelect = (item) => {
    if (!item?.to) return

    setGlobalSearchRecents((current) => {
      const entry = {
        id: `${item.kind || "item"}:${item.id || item.to}`,
        kind: item.kind || "search",
        title: item.title || "Search result",
        subtitle: item.subtitle || item.detail || "",
        to: item.to,
        lastUsedAt: new Date().toISOString(),
      }

      const next = [entry, ...current.filter((candidate) => candidate.id !== entry.id)]
      return next.slice(0, GLOBAL_SEARCH_RECENTS_LIMIT)
    })

    setGlobalSearchInput("")
    setGlobalSearchQuery("")
    navigate(item.to)
  }

  const handleCommandPaletteSelect = async (command) => {
    if (!command) return

    closeCommandPalette()

    try {
      if (command.actionKey === "open-feedback-form") {
        window.open("./event-creation-feedback-form.html", "_blank")
        return
      }

      if (command.actionKey === "refresh-search-sources") {
        const failures = await loadGlobalSearchData().catch(() => ["refresh failed"])
        if (Array.isArray(failures) && failures.length > 0) {
          window.alert(`Search sources refreshed with issues: ${failures.join(", ")}`)
        }
        return
      }

      if (command.actionKey === "refresh-page") {
        window.location.reload()
        return
      }

      if (command.actionKey === "sign-out") {
        handleSignOut()
        navigate("/login", { replace: true })
        return
      }

      if (command.actionKey === "promote-user") {
        await handlePromoteUser()
        return
      }

      if (typeof command.action === "function") {
        command.action()
        return
      }

      if (command.to) {
        navigate(command.to)
      }
    } catch (error) {
      window.alert(error?.message || "Unable to execute command")
    }
  }

  return (
    <>
      <AppLayout
        title={getTitle()}
        releaseTag={token ? getReleaseTag() : undefined}
        profile={token ? profile : null}
        onSignOut={handleSignOut}
        canPromoteUsers={Boolean(token && profile?.role === "admin")}
        onPromoteUser={handlePromoteUser}
        onOpenCommandPalette={token ? openCommandPalette : undefined}
        buildFingerprint={token ? buildFingerprint : undefined}
        showHeader={Boolean(token)}
        searchPanel={token ? (
          <GlobalSearch
            query={globalSearchInput}
            debouncedQuery={globalSearchQuery}
            sections={searchSections}
            loading={globalSearchLoading}
            errorMessage={globalSearchError}
            onQueryChange={setGlobalSearchInput}
            onSelect={handleGlobalSearchSelect}
          />
        ) : null}
        footer={token ? <BottomNav /> : null}
      >
        <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />

        {!token ? (
          <Route path="*" element={<Navigate to="/login" replace />} />
        ) : (
          <>
            <Route path="/" element={<Dashboard />} />

            <Route path="/events">
              <Route index element={<Events />} />
              <Route path="new" element={<CreateEvent />} />
              <Route path=":eventId" element={<EventDetail />} />
              <Route path=":eventId/checkin" element={<CheckIn />} />
              <Route path=":eventId/fast-assign" element={<FastAssign />} />
              <Route path=":eventId/edit" element={<EditEvent />} />
            </Route>

            <Route path="/participants" element={<Participants />} />
            <Route path="/event-templates" element={<EventTemplates />} />
            <Route path="/waiver-templates" element={<WaiverTemplates />} />
            <Route path="/volunteer-dashboard" element={<VolunteerDashboard />} />
            <Route path="/executive-dashboard" element={<ExecutiveDashboard />} />
            <Route path="/communications" element={<Communications />} />
            <Route path="/feedback" element={<FeedbackReview />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
        </Routes>
      </AppLayout>

      {token && commandPaletteOpen ? (
        <CommandPalette
          isOpen
          commands={commandPaletteCommands}
          onClose={closeCommandPalette}
          onSelectCommand={handleCommandPaletteSelect}
        />
      ) : null}
    </>
  )
}

export default App