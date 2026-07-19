import { useState } from "react"
import { resendVerificationEmail } from "../api/portal"

// Shown by PortalLayout for any signed-in participant whose stored profile
// (portalAuth.js) shows email_verified_at as falsy. Disappears on its own
// once verified, since PortalLayout re-renders on profile.email_verified_at
// changing (portal-auth:changed, updated by refreshPortalProfile() after a
// successful verification).
function PortalVerificationBanner({ email }) {
  const [status, setStatus] = useState("idle")
  const [message, setMessage] = useState("")

  async function handleResend() {
    setStatus("sending")
    setMessage("")

    try {
      const body = await resendVerificationEmail(email)
      setStatus("sent")
      setMessage(body?.message || "If that email exists and is not yet verified, a verification email has been sent.")
    } catch (err) {
      setStatus("error")
      setMessage(err?.message || "Unable to resend the verification email right now.")
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-2">
        {status === "sent" ? (
          <span>{message}</span>
        ) : (
          <>
            <span>Please verify your email address to fully activate your account.</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={status === "sending"}
              className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Resend verification email"}
            </button>
          </>
        )}
        {status === "error" ? <span className="text-danger">{message}</span> : null}
      </div>
    </div>
  )
}

export default PortalVerificationBanner
