import { Link, NavLink, Outlet } from "react-router-dom"

const NAV_LINKS = [
  { to: "/portal", label: "Home", end: true },
  { to: "/portal/events", label: "Events" },
  { to: "/portal/register", label: "Register" },
  { to: "/portal/login", label: "Login" },
]

// Dedicated shell for the public participant/family portal — intentionally
// separate from components/AppLayout.jsx (the admin shell). Reachable with
// no auth token; must never assume a signed-in profile, notifications, or
// any of the admin chrome exists.
function PortalLayout() {
  return (
    <div className="min-h-screen bg-warmbg text-slate-800">
      <header className="bg-ocean text-white shadow-[0_2px_10px_rgba(15,23,42,0.14)]">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/portal" className="text-lg font-semibold tracking-tight">
            Surfers For Autism
          </Link>

          <nav className="flex flex-wrap gap-1.5" aria-label="Participant portal navigation">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  [
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-white/20 text-white" : "text-white/85 hover:bg-white/10 hover:text-white",
                  ].join(" ")
                }
              >
                {link.label}
              </NavLink>
            ))}
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
