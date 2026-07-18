import Card from "../components/Card"

// Placeholder only — no participant authentication is wired here yet.
// The backend already supports logging in as a participant-role account
// (see api/routers/auth.py, api/services/authorization.py), but building
// the actual sign-in form/session flow is deferred to a later slice.
function PortalLogin() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Participant Login</h1>
        <p className="text-sm text-slate-600">
          Participant accounts are coming in an upcoming release. Once available, you&apos;ll be
          able to sign in here to view your registrations and manage waivers.
        </p>
      </Card>
    </div>
  )
}

export default PortalLogin
