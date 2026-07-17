import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { fetchUsers } from "../api/permissions"

const ROLES = ["admin", "participant"]
const TEXT_FILTER_DEBOUNCE_MS = 400

function getRoleTone(role) {
  const normalized = String(role || "").toLowerCase()
  if (normalized === "admin") return "border-indigo-200 bg-indigo-50 text-indigo-900"
  return "border-slate-200 bg-slate-100 text-slate-700"
}

export default function PermissionsManagement() {
  const [searchParams, setSearchParams] = useSearchParams()

  const email = searchParams.get("email") || ""
  const role = searchParams.get("role") || ""

  const [emailDraft, setEmailDraft] = useState(email)
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function updateFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (emailDraft !== email) updateFilter("email", emailDraft)
    }, TEXT_FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailDraft])

  // Keep the draft in sync when the URL changes from outside a debounced edit
  // (browser back/forward, or a shared link with this filter pre-filled).
  useEffect(() => {
    setEmailDraft(email)
  }, [email])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(() => {
      if (isCancelled) return
      setLoading(true)
      setError(null)
    })

    fetchUsers({ emailContains: email || undefined, role: role || undefined })
      .then((payload) => {
        if (!isCancelled) setUsers(Array.isArray(payload) ? payload : [])
      })
      .catch((e) => {
        if (!isCancelled) setError(e.message)
      })
      .finally(() => {
        if (!isCancelled) setLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [email, role])

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ocean mb-1">Permissions Management</h1>
      <p className="text-sm text-slate-500 mb-4">Search registered users and review their current role</p>

      <div className="flex gap-3 flex-wrap mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
          <input
            type="text"
            placeholder="email contains…"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={role}
            onChange={(e) => updateFilter("role", e.target.value)}
          >
            <option value="">All</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {users && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Users</h2>
            <span className="text-xs text-slate-400">{users.length} total</span>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No users match these filters</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Email</th>
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700">{user.email}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getRoleTone(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
