import { useState } from "react"
import { useNavigate } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"
import { loginParticipant } from "../api/portalAuth"

// Reuses the existing /api/auth/login endpoint as-is (see api/portalAuth.js)
// — no new backend auth logic. Deliberately narrow: sign in only, no
// password reset, MFA, or account creation. Account creation itself
// (POST /api/auth/register) already exists on the backend but nothing in
// either app calls it yet — see KNOWN_TECHNICAL_DEBT.md.
function PortalLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      await loginParticipant(email.trim(), password)
      navigate("/portal/my-registrations")
    } catch (err) {
      setError(err?.message || "Sign in failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Participant Login</h1>
        <p className="text-sm text-slate-600 mb-3">
          Sign in to view your registrations and waiver status.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="portalEmail" className="mb-1 block text-xs font-semibold text-slate-700">
              Email
            </label>
            <input
              id="portalEmail"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="portalPassword" className="mb-1 block text-xs font-semibold text-slate-700">
              Password
            </label>
            <input
              id="portalPassword"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign In"}
          </Button>

          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        </form>
      </Card>
    </div>
  )
}

export default PortalLogin
