import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"
import { registerAndSignIn } from "../api/portalAuth"

// Reuses the hardened POST /api/auth/register endpoint from Slice A via
// portalAuth.js's registerAndSignIn() (register, then sign in with the
// existing loginParticipant()) — no new backend logic here. Deliberately
// narrow, matching PortalLogin.jsx: account creation and automatic sign-in
// only. No email verification UI, no claiming, nothing referencing either —
// those don't exist yet.
function PortalCreateAccount() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setSubmitting(true)

    try {
      await registerAndSignIn(email.trim(), password)
      navigate("/portal/my-registrations")
    } catch (err) {
      setError(err?.message || "Account creation failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Create Account</h1>
        <p className="text-sm text-slate-600 mb-3">
          Create an account to sign in and view your registrations and waiver status.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="createAccountEmail" className="mb-1 block text-xs font-semibold text-slate-700">
              Email
            </label>
            <input
              id="createAccountEmail"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="createAccountPassword" className="mb-1 block text-xs font-semibold text-slate-700">
              Password
            </label>
            <input
              id="createAccountPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="createAccountConfirmPassword" className="mb-1 block text-xs font-semibold text-slate-700">
              Confirm Password
            </label>
            <input
              id="createAccountConfirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create Account"}
          </Button>

          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
        </form>

        <p className="mt-3 text-sm text-slate-600">
          Already have an account? <Link to="/portal/login" className="font-medium text-ocean hover:underline">Sign in</Link>.
        </p>
      </Card>
    </div>
  )
}

export default PortalCreateAccount
