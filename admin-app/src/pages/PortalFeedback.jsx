import { useState } from "react"
import { Link } from "react-router-dom"
import Card from "../components/Card"
import Button from "../components/Button"
import { submitPortalFeedback } from "../api/portal"
import { getStoredPortalToken } from "../api/portalAuth"

// Same feature/version/responses/time_to_complete shape the admin app's
// beta_uat feedback already sends to POST /api/feedback (api/routers/
// feedback.py) - a new feature value renders under its own schema in
// FeedbackReview.jsx (see that file's FEEDBACK_SCHEMAS entry) without any
// backend change or touching the admin schemas.
const FEEDBACK_FEATURE = "participant_portal_beta"
const FEEDBACK_PORTAL = "participant_portal"

// Actual deployed build identifier, not a hand-maintained release tag - same
// expression App.jsx already uses for its own build fingerprint.
const FEEDBACK_VERSION = import.meta.env.VITE_BUILD_ID || import.meta.env.VITE_APP_VERSION || "unknown"

const TEST_SCENARIOS = [
  { value: "new_registration", label: "New participant registration" },
  { value: "registration_claiming", label: "Existing registration claiming" },
  { value: "email_verification", label: "Email verification" },
  { value: "login_before_verification", label: "Login before verification" },
  { value: "resend_verification", label: "Resend verification" },
  { value: "returning_verified", label: "Returning verified participant" },
  { value: "invalid_link", label: "Invalid verification link" },
  { value: "expired_link", label: "Expired verification link" },
  { value: "other", label: "Other" },
]

const TASK_SECTIONS = [
  { key: "account_creation", label: "Account Creation" },
  { key: "verification_email", label: "Verification Email" },
  { key: "verification_experience", label: "Verification Experience" },
  { key: "verification_banner", label: "Verification Banner" },
  { key: "my_registrations", label: "My Registrations" },
]

const TASK_OPTIONS = [
  { value: "worked", label: "Worked" },
  { value: "confusing", label: "Confusing" },
  { value: "failed", label: "Didn't work" },
  { value: "not_tested", label: "Not tested" },
]

const OVERALL_RATING_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "okay", label: "Okay" },
  { value: "frustrating", label: "Frustrating" },
]

const EMPTY_FORM = {
  test_scenario: "",
  test_scenario_other: "",
  overall_rating: "",
  bugs_issues: "",
  additional_comments: "",
}

function buildInitialTaskForm() {
  const taskForm = {}
  for (const section of TASK_SECTIONS) {
    taskForm[`${section.key}_task`] = ""
    taskForm[`${section.key}_comment`] = ""
  }
  return taskForm
}

function TaskRatingField({ section, value, onChange }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-slate-700">{section.label}</legend>
      <div className="flex flex-wrap gap-3">
        {TASK_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="radio"
              name={`${section.key}_task`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function PortalFeedback() {
  const token = getStoredPortalToken()

  const [formOpenedAt] = useState(() => Date.now())
  const [form, setForm] = useState(EMPTY_FORM)
  const [taskForm, setTaskForm] = useState(buildInitialTaskForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState({ message: "", tone: "" })
  const [submitted, setSubmitted] = useState(false)

  if (!token) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Beta Feedback</h1>
        <p className="text-sm text-slate-600 mb-3">
          Sign in to submit beta feedback — every submission needs to be tied to a tester account during this
          beta period.
        </p>
        <Link to="/portal/login">
          <Button variant="primary">Sign In</Button>
        </Link>
      </Card>
    )
  }

  if (submitted) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-2">Thank you!</h1>
        <p className="text-sm text-slate-600">Your feedback has been submitted.</p>
      </Card>
    )
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateTaskField(key, value) {
    setTaskForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.test_scenario) {
      setSubmitStatus({ message: "Choose a test scenario before submitting.", tone: "warn" })
      return
    }

    setSubmitting(true)
    setSubmitStatus({ message: "", tone: "" })

    const timeToComplete = Math.round((Date.now() - formOpenedAt) / 1000)

    try {
      await submitPortalFeedback(
        {
          feature: FEEDBACK_FEATURE,
          version: FEEDBACK_VERSION,
          time_to_complete: timeToComplete,
          responses: {
            portal: FEEDBACK_PORTAL,
            ...form,
            ...taskForm,
          },
        },
        token,
      )
      setSubmitted(true)
    } catch (err) {
      setSubmitStatus({ message: err?.message || "Unable to submit feedback right now.", tone: "err" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-bold text-ocean mb-1">Beta Feedback</h1>
        <p className="text-sm text-slate-600">
          Help us improve the participant portal — tell us about your experience with account creation and email
          verification.
        </p>
      </Card>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="testScenario" className="mb-1 block text-sm font-semibold text-slate-700">
              Test Scenario
            </label>
            <select
              id="testScenario"
              required
              value={form.test_scenario}
              onChange={(e) => updateField("test_scenario", e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select a scenario...
              </option>
              {TEST_SCENARIOS.map((scenario) => (
                <option key={scenario.value} value={scenario.value}>
                  {scenario.label}
                </option>
              ))}
            </select>
            {form.test_scenario === "other" ? (
              <input
                type="text"
                placeholder="Briefly describe the scenario"
                value={form.test_scenario_other}
                onChange={(e) => updateField("test_scenario_other", e.target.value)}
                className="mt-2 w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
              />
            ) : null}
          </div>

          {TASK_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-2 border-t border-slate-100 pt-4">
              <TaskRatingField
                section={section}
                value={taskForm[`${section.key}_task`]}
                onChange={(value) => updateTaskField(`${section.key}_task`, value)}
              />
              <textarea
                placeholder={`${section.label} comments (optional)`}
                rows={2}
                value={taskForm[`${section.key}_comment`]}
                onChange={(e) => updateTaskField(`${section.key}_comment`, e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ))}

          <fieldset className="space-y-1.5 border-t border-slate-100 pt-4">
            <legend className="text-sm font-semibold text-slate-700">Overall Experience</legend>
            <div className="flex flex-wrap gap-3">
              {OVERALL_RATING_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="radio"
                    name="overall_rating"
                    value={option.value}
                    checked={form.overall_rating === option.value}
                    onChange={() => updateField("overall_rating", option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="border-t border-slate-100 pt-4">
            <label htmlFor="bugsIssues" className="mb-1 block text-sm font-semibold text-slate-700">
              Bugs / Issues
            </label>
            <textarea
              id="bugsIssues"
              rows={3}
              value={form.bugs_issues}
              onChange={(e) => updateField("bugs_issues", e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="additionalComments" className="mb-1 block text-sm font-semibold text-slate-700">
              Additional Comments
            </label>
            <textarea
              id="additionalComments"
              rows={3}
              value={form.additional_comments}
              onChange={(e) => updateField("additional_comments", e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>

          {submitStatus.message ? (
            <p className={`text-sm font-medium ${submitStatus.tone === "err" ? "text-danger" : "text-amber-700"}`}>
              {submitStatus.message}
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  )
}

export default PortalFeedback
