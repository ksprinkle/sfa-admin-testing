import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"
import { fetchPublicEventBySlug, fetchPublicEvents, registerParticipant } from "../api/portal"
import { getStoredPortalToken } from "../api/portalAuth"
import { formatEventDateRange, formatEventLocation } from "../utils/portalFormat"

const EMPTY_FORM = { firstName: "", lastName: "", email: "", isMinor: false }

// React recreation of admin-app/public/participant-registration.html, kept
// in the portal route group and pointed at the same canonical endpoint
// (POST /api/public/events/{slug}/register via api/portal.js). The static
// page still exists and still works — see KNOWN_TECHNICAL_DEBT.md /
// FEATURE_INVENTORY.md for the plan to retire it once this is validated.
//
// When an active waiver template exists, that endpoint now also issues a
// waiver signing token as part of registration (api/services/
// public_onboarding.py) — handleSubmit redirects straight into the existing
// public waiver-signing.html page when that happens.
function PortalRegister() {
  const [searchParams] = useSearchParams()

  const [openEvents, setOpenEvents] = useState([])
  const [openEventsLoading, setOpenEventsLoading] = useState(true)
  const [openEventsError, setOpenEventsError] = useState("")

  const [slugInput, setSlugInput] = useState(searchParams.get("slug") || "")
  const [currentSlug, setCurrentSlug] = useState("")
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [loadStatus, setLoadStatus] = useState({ message: "", tone: "" })

  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState({ message: "", tone: "" })

  async function loadOpenEvents() {
    setOpenEventsLoading(true)
    setOpenEventsError("")

    try {
      const events = await fetchPublicEvents()
      setOpenEvents((Array.isArray(events) ? events : []).filter((event) => event?.participant_available))
    } catch (err) {
      setOpenEvents([])
      setOpenEventsError(err?.message || "Failed to load open events.")
    } finally {
      setOpenEventsLoading(false)
    }
  }

  async function loadEvent(slug) {
    const trimmedSlug = String(slug || "").trim()
    if (!trimmedSlug) {
      setLoadStatus({ message: "Enter an event slug.", tone: "warn" })
      return
    }

    setLoadStatus({ message: "Loading event...", tone: "" })
    setSubmitStatus({ message: "", tone: "" })

    try {
      const event = await fetchPublicEventBySlug(trimmedSlug)
      setCurrentSlug(trimmedSlug)
      setSelectedEvent(event)
      setLoadStatus({ message: "Event loaded.", tone: "ok" })
    } catch (err) {
      setCurrentSlug("")
      setSelectedEvent(null)
      setLoadStatus({ message: err?.message || "Failed to load event.", tone: "err" })
    }
  }

  useEffect(() => {
    loadOpenEvents()

    const slugFromQuery = searchParams.get("slug")
    if (slugFromQuery) {
      loadEvent(slugFromQuery)
    }
    // Intentionally run only once on mount, matching the static page's
    // behavior — it doesn't re-trigger on subsequent query-string changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleUseEvent(slug) {
    setSlugInput(slug)
    loadEvent(slug)
  }

  function handleLoadClick() {
    loadEvent(slugInput)
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleClear() {
    setForm(EMPTY_FORM)
    setSubmitStatus({ message: "", tone: "" })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!currentSlug) {
      setSubmitStatus({ message: "Load an event before submitting.", tone: "warn" })
      return
    }

    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const email = form.email.trim()

    if (!firstName || !lastName || !email) {
      setSubmitStatus({ message: "Complete all required fields.", tone: "warn" })
      return
    }

    setSubmitting(true)
    setSubmitStatus({ message: "Submitting registration...", tone: "" })

    try {
      const result = await registerParticipant(
        currentSlug,
        {
          first_name: firstName,
          last_name: lastName,
          email,
          role: "participant",
          is_minor: form.isMinor,
        },
        getStoredPortalToken(),
      )

      const isWaitlisted = Boolean(result?.participant?.is_waitlisted)
      const waiver = result?.waiver

      setForm(EMPTY_FORM)

      // A waiver template is active, so the backend already issued a signing
      // token for this participant (api/services/public_onboarding.py) —
      // continue straight into the existing public waiver signing page
      // (admin-app/public/waiver-signing.html, unchanged) rather than
      // stopping at a confirmation message.
      if (waiver?.required && waiver?.token) {
        setSubmitStatus({
          message: isWaitlisted
            ? "Registration submitted successfully. This event is at capacity, so you've been added to the waitlist. Redirecting you to sign the waiver..."
            : "Registration submitted successfully. Redirecting you to sign the waiver...",
          tone: "ok",
        })
        window.location.href = `${import.meta.env.BASE_URL}waiver-signing.html?token=${encodeURIComponent(waiver.token)}`
        return
      }

      // No active waiver template — preserve the prior confirmation-only behavior.
      setSubmitStatus(
        isWaitlisted
          ? {
              message:
                "Registration submitted successfully. This event is at capacity, so you've been added to the waitlist — we'll reach out if a spot opens up.",
              tone: "ok",
            }
          : {
              message: "Registration submitted successfully. You are now in intake and waiting assignment.",
              tone: "ok",
            },
      )
    } catch (err) {
      setSubmitStatus({ message: err?.message || "Registration failed.", tone: "err" })
    } finally {
      setSubmitting(false)
    }
  }

  const participantOpen = Boolean(selectedEvent?.registration?.participant_open)

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-ocean mb-1">Open Events</h1>
            <p className="text-sm text-slate-500">
              Select an open event to start registration. This list updates from live event settings.
            </p>
          </div>
          <Button variant="neutral" type="button" onClick={loadOpenEvents}>
            Refresh List
          </Button>
        </div>

        {openEventsLoading ? <p className="text-sm text-slate-500">Loading open events...</p> : null}
        {openEventsError ? <p className="text-sm text-danger">{openEventsError}</p> : null}
        {!openEventsLoading && !openEventsError && openEvents.length === 0 ? (
          <p className="text-sm text-slate-600">No open events are currently available for participant registration.</p>
        ) : null}

        <div className="space-y-2">
          {openEvents.map((event) => (
            <div key={event.id} className="rounded-[var(--radius-md)] border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">{event.title || "Untitled Event"}</h3>
              <p className="mb-2 text-xs text-slate-500">
                {formatEventDateRange(event.start_date, event.end_date)} • {formatEventLocation(event.location)}
              </p>
              <Button variant="primary" type="button" onClick={() => handleUseEvent(event.slug)}>
                Use This Event
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ocean mb-1">Participant Registration</h2>
        <p className="text-sm text-slate-500 mb-3">Use your event slug to load registration details and submit intake.</p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="eventSlug" className="mb-1 block text-xs font-semibold text-slate-700">
              Event Slug
            </label>
            <input
              id="eventSlug"
              type="text"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder="example: jupiter-chapter-june-2026"
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <Button variant="primary" type="button" onClick={handleLoadClick}>
            Load Event
          </Button>
        </div>
        {loadStatus.message ? (
          <p className={`mt-2 text-sm font-medium ${statusToneClass(loadStatus.tone)}`}>{loadStatus.message}</p>
        ) : null}
      </Card>

      {selectedEvent ? (
        <Card>
          <h2 className="text-lg font-semibold text-slate-800">{selectedEvent.title || "Event"}</h2>
          <p className="mb-2 text-sm text-slate-500">
            {formatEventDateRange(selectedEvent.start_date, selectedEvent.end_date)} •{" "}
            {formatEventLocation(selectedEvent.location)}
          </p>
          <span
            className={[
              "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
              participantOpen ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
            ].join(" ")}
          >
            {participantOpen ? "Participant registration is open" : "Participant registration is closed"}
          </span>
        </Card>
      ) : null}

      {selectedEvent ? (
        <Card>
          <h3 className="text-base font-semibold text-slate-800 mb-3">Register Participant</h3>

          <form onSubmit={handleSubmit} className="space-y-3" autoComplete="on">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="mb-1 block text-xs font-semibold text-slate-700">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="mb-1 block text-xs font-semibold text-slate-700">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-semibold text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                id="isMinor"
                name="isMinor"
                type="checkbox"
                checked={form.isMinor}
                onChange={(e) => updateField("isMinor", e.target.checked)}
                className="h-4 w-4"
              />
              Participant is a minor
            </label>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Registration"}
              </Button>
              <Button variant="neutral" type="button" onClick={handleClear} disabled={submitting}>
                Clear Form
              </Button>
            </div>

            {submitStatus.message ? (
              <p className={`text-sm font-medium ${statusToneClass(submitStatus.tone)}`}>{submitStatus.message}</p>
            ) : null}
          </form>
        </Card>
      ) : null}
    </div>
  )
}

function statusToneClass(tone) {
  if (tone === "ok") return "text-emerald-700"
  if (tone === "warn") return "text-amber-700"
  if (tone === "err") return "text-danger"
  return "text-slate-600"
}

export default PortalRegister
