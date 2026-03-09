import { Routes, Route, useLocation } from "react-router-dom"
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

function App() {
  const location = useLocation()
  const token = localStorage.getItem("token")

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
      {token && <TopBar title={getTitle()} />}

     <Routes>
    {!token ? (
      <Route path="*" element={<Login />} />
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

      </>
        )}
      </Routes>

      {token && <BottomNav />}
    </div>
  )
}

export default App