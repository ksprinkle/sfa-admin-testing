import { useEffect, useState } from "react"
import { Routes, Route, useLocation, Navigate } from "react-router-dom"
import BottomNav from "./components/BottomNav"
import AppLayout from "./components/AppLayout"
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
import {
  clearAuthSession,
  fetchMyProfile,
  getAuthChangedEventName,
  getStoredProfile,
  getStoredToken,
  promoteUserToAdminByEmail,
} from "./api/auth"
import { getReleaseTag } from "./config/release"

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

function App() {
  const location = useLocation()
  const [token, setToken] = useState(() => getStoredToken())
  const [profile, setProfile] = useState(() => getStoredProfile())
  const [buildFingerprint, setBuildFingerprint] = useState(() => (import.meta.env.DEV ? "dev-local" : "..."))

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
        return "Surfers Admin"
    }
  }

  return (
    <AppLayout
      title={getTitle()}
      releaseTag={token ? getReleaseTag() : undefined}
      profile={token ? profile : null}
      onSignOut={handleSignOut}
      canPromoteUsers={Boolean(token && profile?.role === "admin")}
      onPromoteUser={handlePromoteUser}
      buildFingerprint={token ? buildFingerprint : undefined}
      showHeader={Boolean(token)}
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
            <Route path="/feedback" element={<FeedbackReview />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </AppLayout>
  )
}

export default App