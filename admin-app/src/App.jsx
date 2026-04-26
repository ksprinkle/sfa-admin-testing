import { useEffect, useState } from "react"
import { Routes, Route, useLocation, Navigate } from "react-router-dom"
import TopBar from "./components/TopBar"
import BottomNav from "./components/BottomNav"
import Dashboard from "./pages/Dashboard"
import Events from "./pages/Events"
import Participants from "./pages/Participants"
import Login from "./pages/Login"
import EventDetail from "./pages/EventDetail"
import CreateEvent from "./pages/CreateEvent"
import EditEvent from "./pages/EditEvent"
import CheckIn from "./pages/CheckIn"
import { clearAuthSession, fetchMyProfile, getAuthChangedEventName, getStoredProfile, getStoredToken } from "./api/auth"

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
      .catch(() => {
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

  const getTitle = () => {
    switch (location.pathname) {
      case "/":
        return "Dashboard"
      case "/events":
        return "Events"
      case "/participants":
        return "Participants"
      default:
        return "Surfers Admin"
    }
  }

  return (
    <div className="min-h-screen bg-warmbg pb-20">
      {token && <TopBar title={getTitle()} profile={profile} onSignOut={handleSignOut} />}

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
            <Route path=":eventId/edit" element={<EditEvent />} />
          </Route>

          <Route path="/participants" element={<Participants />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>

      {token && (
        <div className="fixed bottom-16 right-2 z-40 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm backdrop-blur">
          Build {buildFingerprint}
        </div>
      )}

      {token && <BottomNav />}
    </div>
  )
}

export default App