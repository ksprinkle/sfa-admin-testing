import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"
import { confirmEmailVerification, resendVerificationEmail } from "../api/portal"
import { getStoredPortalProfile, getStoredPortalToken, refreshPortalProfile } from "../api/portalAuth"

// Single page, multiple render states — the same pattern PortalRegister.jsx
// already uses for its own loading/error/success flow. A ?token= in the URL
// (from the verification email link, see api/services/account_verification.py)
// auto-submits on mount; landing here with no token shows a check-your-email /
// resend prompt instead.
function PortalVerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")

  const [status, setStatus] = useState(token ? "checking" : "no_token")
  const [claimedRegistrations, setClaimedRegistrations] = useState(0)

  const [resendEmail, setResendEmail] = useState("")
  const [resendStatus, setResendStatus] = useState("idle")
  const [resendMessage, setResendMessage] = useState("")

  const hasPortalSession = Boolean(getStoredPortalToken())
  const storedProfile = getStoredPortalProfile()

  useEffect(() => {
    if (!token) return

    let cancelled = false

    confirmEmailVerification(token)
      .then(async (result) => {
        if (cancelled) return
        setStatus(result.status)
        setClaimedRegistrations(result.claimedRegistrations)

        if (result.status === "verified" && getStoredPortalToken()) {
          // Keeps the stored profile (and anything reading email_verified_at,
          // e.g. the nav banner) current immediately, without a re-login.
          await refreshPortalProfile()
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("invalid")
      })

    return () => {
      cancelled = true
    }
    // Only ever runs once per page load — token comes from the URL the user
    // arrived with, not something that changes during this page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleResend(email) {
    const cleanEmail = (email || "").trim()
    if (!cleanEmail) return

    setResendStatus("sending")
    setResendMessage("")

    try {
      const body = await resendVerificationEmail(cleanEmail)
      setResendStatus("sent")
      setResendMessage(body?.message || "If that email exists and is not yet verified, a verification email has been sent.")
    } catch (err) {
      setResendStatus("error")
      setResendMessage(err?.message || "Unable to resend the verification email right now.")
    }
  }

  const primaryCta = hasPortalSession ? (
    <Link to="/portal/my-registrations">
      <Button variant="primary">View My Registrations</Button>
    </Link>
  ) : (
    <Link to="/portal/login">
      <Button variant="primary">Log In</Button>
    </Link>
  )

  if (status === "checking") {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Verifying your email...</h1>
        <p className="text-sm text-slate-600">One moment, please.</p>
      </Card>
    )
  }

  if (status === "verified") {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Email verified</h1>
        <p className="text-sm text-slate-600 mb-3">Your email address has been verified.</p>
        {claimedRegistrations > 0 ? (
          <p className="text-sm text-slate-600 mb-3">
            We found and linked {claimedRegistrations} past registration{claimedRegistrations === 1 ? "" : "s"} to
            your account.
          </p>
        ) : null}
        {primaryCta}
      </Card>
    )
  }

  if (status === "already_used") {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Already verified</h1>
        <p className="text-sm text-slate-600 mb-3">This email address has already been verified.</p>
        {primaryCta}
      </Card>
    )
  }

  if (status === "expired") {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">This link has expired</h1>
        <p className="text-sm text-slate-600 mb-3">
          Verification links expire after 24 hours. Request a new one below.
        </p>
        <ResendForm
          hasPortalSession={hasPortalSession}
          storedEmail={storedProfile?.email}
          resendEmail={resendEmail}
          setResendEmail={setResendEmail}
          resendStatus={resendStatus}
          resendMessage={resendMessage}
          onResend={handleResend}
        />
      </Card>
    )
  }

  if (status === "invalid") {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">We couldn&apos;t verify that link</h1>
        <p className="text-sm text-slate-600 mb-3">
          This verification link isn&apos;t valid. If you still need to verify your email, request a new link
          below.
        </p>
        <ResendForm
          hasPortalSession={hasPortalSession}
          storedEmail={storedProfile?.email}
          resendEmail={resendEmail}
          setResendEmail={setResendEmail}
          resendStatus={resendStatus}
          resendMessage={resendMessage}
          onResend={handleResend}
        />
      </Card>
    )
  }

  // status === "no_token" — landed here directly, not via an email link.
  if (hasPortalSession && storedProfile?.email_verified_at) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Already verified</h1>
        <p className="text-sm text-slate-600 mb-3">Your email address is already verified.</p>
        {primaryCta}
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-ocean mb-2">Verify your email</h1>
      <p className="text-sm text-slate-600 mb-3">
        Check your inbox for a verification link. Didn&apos;t get it, or has it expired?
      </p>
      <ResendForm
        hasPortalSession={hasPortalSession}
        storedEmail={storedProfile?.email}
        resendEmail={resendEmail}
        setResendEmail={setResendEmail}
        resendStatus={resendStatus}
        resendMessage={resendMessage}
        onResend={handleResend}
      />
    </Card>
  )
}

// Shared by the expired/invalid/no-token states below: one click using the
// signed-in user's own email when a portal session exists, otherwise a small
// inline email field — mirrors PortalMyRegistrations.jsx's not-signed-in
// pattern of asking for only what's actually needed.
function ResendForm({ hasPortalSession, storedEmail, resendEmail, setResendEmail, resendStatus, resendMessage, onResend }) {
  if (resendStatus === "sent") {
    return <p className="text-sm text-slate-600">{resendMessage}</p>
  }

  if (hasPortalSession && storedEmail) {
    return (
      <div className="space-y-2">
        <Button variant="primary" disabled={resendStatus === "sending"} onClick={() => onResend(storedEmail)}>
          {resendStatus === "sending" ? "Sending..." : "Resend Verification Email"}
        </Button>
        {resendStatus === "error" ? <p className="text-sm font-medium text-danger">{resendMessage}</p> : null}
      </div>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        onResend(resendEmail)
      }}
    >
      <label htmlFor="resendEmail" className="block text-xs font-semibold text-slate-700">
        Email
      </label>
      <input
        id="resendEmail"
        type="email"
        required
        autoComplete="email"
        value={resendEmail}
        onChange={(e) => setResendEmail(e.target.value)}
        className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
      />
      <Button variant="primary" type="submit" disabled={resendStatus === "sending"}>
        {resendStatus === "sending" ? "Sending..." : "Resend Verification Email"}
      </Button>
      {resendStatus === "error" ? <p className="text-sm font-medium text-danger">{resendMessage}</p> : null}
    </form>
  )
}

export default PortalVerifyEmail
