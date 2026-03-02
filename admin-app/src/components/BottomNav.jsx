import { Link, useLocation } from "react-router-dom"

function BottomNav() {
  const location = useLocation()

  const navItem = (to, label, icon) => {
  const active = location.pathname === to

  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
        active ? "text-ocean" : "text-gray-400"
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-xs">{label}</span>
    </Link>
  )
}

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] flex">
        {navItem("/", "Dashboard", "🏄")}
        {navItem("/events", "Events", "📅")}
        {navItem("/participants", "Participants", "👥")}
    </div>
  )
}

export default BottomNav