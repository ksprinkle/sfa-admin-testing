import logo from "../assets/icon-192.png"
import { useMemo, useState } from "react"

function TopBar({ title, onMenuClick, profile, onSignOut, releaseTag }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const profileName = profile?.email || "Signed-in user"
  const initials = useMemo(() => {
    const candidate = String(profile?.email || "U").trim().toUpperCase()
    return candidate.slice(0, 1)
  }, [profile?.email])

  return (
    <div className="bg-ocean-dark text-white min-h-14 flex items-center justify-between px-4 py-2 shadow-md">
      <button onClick={onMenuClick} className="text-xl">
        ☰
      </button>

      <div className="flex items-center gap-2">
        <img
          src={logo}
          alt="Surfers For Autism"
          className="h-6 brightness-0 invert"
        />
        <div className="leading-tight">
          <h1 className="font-semibold text-base">{title}</h1>
          {releaseTag && <p className="text-[10px] text-white/75">{releaseTag}</p>}
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-white/10 text-xs font-semibold hover:bg-white/20"
          title="Profile menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {initials}
        </button>

        {menuOpen && (
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-800 shadow-lg">
            <div className="border-b border-gray-100 px-2 pb-2">
              <p className="text-[11px] uppercase tracking-wide text-secondary">Signed in as</p>
              <p className="truncate font-medium text-gray-900">{profileName}</p>
              <p className="mt-0.5 text-xs text-secondary">Role: {profile?.role || "admin"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onSignOut?.()
              }}
              className="mt-2 w-full rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default TopBar