import { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  clearPortalSession,
  getPortalAuthChangedEventName,
  getStoredPortalProfile,
  getStoredPortalToken,
} from "../api/portalAuth"

const NAV_LINKS = [
  { to: "/portal", label: "Home", end: true },
  { to: "/portal/events", label: "Events" },
  { to: "/portal/register", label: "Register" },
  { to: "/portal/my-registrations", label: "My Registrations" },
]

const navLinkClass = ({ isActive }) =>
  [
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-white/20 text-white" : "text-white/85 hover:bg-white/10 hover:text-white",
  ].join(" ")

// Dedicated shell for the public participant/family portal — intentionally
// separate from components/AppLayout.jsx (the admin shell). Reachable with
// no auth token; must never assume a signed-in profile, notifications, or
// any of the admin chrome exists. Its own auth state (portalAuth.js) is
// completely isolated from the admin shell's — see ARCHITECTURE_OVERVIEW.md.
function PortalLayout() {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => getStoredPortalToken())
  const [profile, setProfile] = useState(() => getStoredPortalProfile())

  useEffect(() => {
    const eventName = getPortalAuthChangedEventName()
    const syncSession = () => {
      setToken(getStoredPortalToken())
      setProfile(getStoredPortalProfile())
    }

    window.addEventListener(eventName, syncSession)
    window.addEventListener("storage", syncSession)

    return () => {
      window.removeEventListener(eventName, syncSession)
      window.removeEventListener("storage", syncSession)
    }
  }, [])

  function handleSignOut() {
    clearPortalSession()
    navigate("/portal")
  }

  return (
    <div className="min-h-screen bg-warmbg text-slate-800">
      <header className="bg-ocean text-white shadow-[0_2px_10px_rgba(15,23,42,0.14)]">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/portal" className="text-lg font-semibold tracking-tight">
            Surfers For Autism
          </Link>

          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Participant portal navigation">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass}>
                {link.label}
              </NavLink>
            ))}

            {token ? (
              <>
                {profile?.email ? (
                  <span className="hidden max-w-[200px] truncate text-sm text-white/85 sm:inline">
                    {profile.email}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <NavLink to="/portal/login" end className={navLinkClass}>
                Login
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-[1100px] px-4 pb-6 text-xs text-slate-500">
        <p>
          Surfers For Autism — Participant &amp; Family Portal. Staff and volunteer administration
          lives at <Link to="/login" className="underline">the admin sign-in</Link>.
        </p>
      </footer>
    </div>
  )
}

export default PortalLayout
