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

function App() {
  const location = useLocation()
  const [token, setToken] = useState(() => getStoredToken())
  const [profile, setProfile] = useState(() => getStoredProfile())

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

      {token && <BottomNav />}
    </div>
  )
}

export default App