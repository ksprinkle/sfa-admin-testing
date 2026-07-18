import Card from "../components/Card"
import Button from "../components/Button"

// import.meta.env.BASE_URL (not a relative "./" link) so this resolves
// correctly regardless of route depth or the GitHub Pages base path.
const REGISTRATION_FORM_URL = `${import.meta.env.BASE_URL}participant-registration.html`

// Placeholder only — no registration form here yet. This is built in the
// next slice; today this page points visitors to the existing, working
// static registration form instead of leaving them stuck.
function PortalRegister() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Event Registration</h1>
        <p className="text-sm text-slate-600 mb-3">
          Registering directly inside this portal is coming in an upcoming release. For now,
          please use our current registration form to sign up for an event.
        </p>
        <a href={REGISTRATION_FORM_URL} target="_blank" rel="noreferrer">
          <Button variant="primary">Open the current registration form</Button>
        </a>
      </Card>
    </div>
  )
}

export default PortalRegister
