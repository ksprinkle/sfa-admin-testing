import { useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { fetchEvents } from "../api/events"

const CHECKIN_FALLBACK_PATH = "/events"

function CheckInTabIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#F8FAFC" stroke="#BFDBFE" strokeWidth="1.2" />
      <path d="M10 7h8" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12h8" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 17h8" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.6 7.1l1.4 1.5 2.2-2.4" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 12.1l1.4 1.5 2.2-2.4" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.7 15.7l2.9 2.9" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.6 15.7l-2.9 2.9" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function resolveEventIdFromPath(pathname) {
  const match = pathname.match(/^\/events\/([^/]+)(?:\/|$)/)
  return match ? match[1] : null
}

function BottomNav() {
  const location = useLocation()
  const [checkInTarget, setCheckInTarget] = useState(CHECKIN_FALLBACK_PATH)

  useEffect(() => {
    let isCancelled = false

    const computeCheckInTarget = async () => {
      const routeEventId = resolveEventIdFromPath(location.pathname)
      if (routeEventId) {
        setCheckInTarget(`/events/${routeEventId}/checkin`)
        return
      }

      try {
        const events = await fetchEvents()
        const liveEvents = events.filter((event) => event.status?.toLowerCase() === "published")

        if (isCancelled) return

        if (liveEvents.length === 1) {
          setCheckInTarget(`/events/${liveEvents[0].id}/checkin`)
          return
        }

        if (liveEvents.length > 1) {
          setCheckInTarget("/events?status=published")
          return
        }

        setCheckInTarget(CHECKIN_FALLBACK_PATH)
      } catch {
        if (!isCancelled) {
          setCheckInTarget(CHECKIN_FALLBACK_PATH)
        }
      }
    }

    computeCheckInTarget()

    return () => {
      isCancelled = true
    }
  }, [location.pathname])

  const checkInActive = useMemo(() => location.pathname.includes("/checkin"), [location.pathname])

  const navItem = (to, label, icon, activeOverride = null) => {
  const active = activeOverride ?? location.pathname === to

  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
        active ? "text-ocean bg-slate-100/70" : "text-gray-500"
      }`}
    >
      <span className={`leading-none ${active ? "text-[22px]" : "text-lg"}`}>{icon}</span>
      <span className={`${active ? "text-[11px] font-bold tracking-wide" : "text-xs font-medium"}`}>{label}</span>
    </Link>
  )
}

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] flex">
        {navItem("/", "Dashboard", "🏄")}
        {navItem("/events", "Events", "📅")}
        {navItem(checkInTarget, "Check-In", <CheckInTabIcon />, checkInActive)}
        {navItem("/participants", "Participants", "👥")}
    </div>
  )
}

export default BottomNav