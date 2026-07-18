import { Link } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"

function PortalHome() {
  return (
    <div className="space-y-6">
      <Card>
        <h1 className="text-2xl font-bold text-ocean mb-2">Welcome, Surfers &amp; Families</h1>
        <p className="text-slate-600 mb-4">
          Surfers For Autism hosts free surf therapy events for children and adults with autism.
          This portal is where participants and families will be able to browse upcoming events,
          register, and manage waivers online.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/portal/events">
            <Button variant="primary">Browse Events</Button>
          </Link>
          <Link to="/portal/register">
            <Button variant="neutral">Register for an Event</Button>
          </Link>
        </div>
      </Card>

      <Card>
        <Card.Header>What&apos;s here today</Card.Header>
        <Card.Body>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Browse upcoming published events and their availability.</li>
            <li>
              Online registration and participant login are launching in an upcoming release — see
              the Register and Login pages for details.
            </li>
          </ul>
        </Card.Body>
      </Card>
    </div>
  )
}

export default PortalHome
