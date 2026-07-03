import { useEffect, useState } from "react"
import Button from "../Button"

const recipientGroupOptions = ["All Participants", "Volunteers", "Event Staff", "Recent Attendees", "Custom Segment"]
const deliveryMethodOptions = ["Email", "SMS"]
const recipientSummaryByGroup = {
  "All Participants": { estimate: 68, label: "Estimated recipient count" },
  Volunteers: { estimate: 42, label: "Estimated recipient count" },
  "Event Staff": { estimate: 12, label: "Estimated recipient count" },
  "Recent Attendees": { estimate: 7, label: "Estimated recipient count" },
  "Custom Segment": { estimate: "Custom Selection", label: "Estimated recipient count" },
}

const MOCK_MESSAGE_TEMPLATES = [
  {
    id: "email-event-reminder",
    deliveryMethod: "Email",
    name: "Event reminder",
    recipientGroup: "All Participants",
    subject: "Reminder: Upcoming event details",
    messageBody: "Hi everyone,\n\nThis is a reminder about the upcoming event. Please review your schedule, arrival time, and any event-day instructions before the session begins.\n\nThanks,\nSurfers Admin",
  },
  {
    id: "email-volunteer-follow-up",
    deliveryMethod: "Email",
    name: "Volunteer follow-up",
    recipientGroup: "Volunteers",
    subject: "Thank you for volunteering",
    messageBody: "Hello volunteers,\n\nThank you for supporting the event. We appreciate your time, flexibility, and commitment to the day.\n\nBest,\nSurfers Admin",
  },
  {
    id: "email-thank-you-note",
    deliveryMethod: "Email",
    name: "Thank you note",
    recipientGroup: "Recent Attendees",
    subject: "Thank you for joining us",
    messageBody: "Hi there,\n\nThank you for being part of our latest event. We look forward to seeing you again at the next session.\n\nWarmly,\nSurfers Admin",
  },
  {
    id: "sms-weather-update",
    deliveryMethod: "SMS",
    name: "Weather update",
    recipientGroup: "All Participants",
    subject: "Weather update for today",
    messageBody: "Weather update: please check current conditions and event alerts before departure. Reply if you need help coordinating arrival.",
  },
  {
    id: "sms-schedule-reminder",
    deliveryMethod: "SMS",
    name: "Schedule reminder",
    recipientGroup: "Volunteers",
    subject: "Schedule reminder",
    messageBody: "Reminder: please review your assigned schedule and arrival instructions before the event starts.",
  },
  {
    id: "sms-urgent-notice",
    deliveryMethod: "SMS",
    name: "Urgent notice",
    recipientGroup: "Custom Segment",
    subject: "Urgent event notice",
    messageBody: "Urgent notice: check the latest event update as soon as possible for timing or safety changes.",
  },
]

function getTemplatesForMethod(deliveryMethod) {
  return MOCK_MESSAGE_TEMPLATES.filter((template) => template.deliveryMethod === deliveryMethod)
}

function getTemplateByName(deliveryMethod, templateName) {
  return getTemplatesForMethod(deliveryMethod).find((template) => template.name === templateName) || null
}

function getDefaultTemplate(deliveryMethod) {
  return getTemplatesForMethod(deliveryMethod)[0] || null
}

function buildFormState({ deliveryMethod = deliveryMethodOptions[0], templateName = "" } = {}) {
  const selectedTemplate = getTemplateByName(deliveryMethod, templateName) || getDefaultTemplate(deliveryMethod)

  return {
    recipientGroup: selectedTemplate?.recipientGroup || recipientGroupOptions[0],
    deliveryMethod,
    template: selectedTemplate?.name || "",
    subject: selectedTemplate?.subject || "",
    messageBody: selectedTemplate?.messageBody || "",
  }
}

const DEFAULT_FORM = buildFormState()

function MessageComposerModal({ isOpen, onClose, onNext }) {
  const [form, setForm] = useState(DEFAULT_FORM)

  useEffect(() => {
    if (!isOpen) return

    setForm(buildFormState())
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const availableTemplates = getTemplatesForMethod(form.deliveryMethod)
  const previewSubject = form.subject.trim() || "Preview subject"
  const previewBody = form.messageBody.trim() || "Your message preview will appear here as you type."
  const previewRecipient = form.recipientGroup || "Recipient group"
  const previewDeliveryMethod = form.deliveryMethod || "Email"
  const recipientSummary = recipientSummaryByGroup[form.recipientGroup] || {
    estimate: "Custom Selection",
    label: "Estimated recipient count",
  }

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((current) => {
      if (name === "deliveryMethod") {
        const nextTemplate = getDefaultTemplate(value)
        return buildFormState({
          deliveryMethod: value,
          templateName: nextTemplate?.name || "",
        })
      }

      if (name === "template") {
        const selectedTemplate = getTemplateByName(current.deliveryMethod, value)
        if (!selectedTemplate) {
          return {
            ...current,
            template: value,
          }
        }

        return {
          ...current,
          template: selectedTemplate.name,
          recipientGroup: selectedTemplate.recipientGroup || current.recipientGroup,
          subject: selectedTemplate.subject,
          messageBody: selectedTemplate.messageBody,
        }
      }

      return {
        ...current,
        [name]: value,
      }
    })
  }

  const handleNext = () => {
    onNext?.(form)
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={onClose}
      />

      <section
        className="relative z-10 w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Compose new message"
      >
        <div className="flex flex-col gap-2 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Communications</p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">Compose New Message</h3>
            <p className="mt-1 text-sm text-secondary">Draft a message locally before any delivery workflow is connected.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-gray-900">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Recipient Group</span>
                <select
                  name="recipientGroup"
                  value={form.recipientGroup}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
                >
                  {recipientGroupOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-900">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Delivery Method</span>
                <select
                  name="deliveryMethod"
                  value={form.deliveryMethod}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
                >
                  {deliveryMethodOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Recipient Summary</p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{form.recipientGroup}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-secondary">{recipientSummary.label}</p>
                    <p className="mt-1 text-2xl font-bold text-sky-900">{recipientSummary.estimate}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-secondary">
                  This summary updates immediately from local mock data when the recipient group changes.
                </p>
              </div>

              <label className="space-y-2 text-sm font-medium text-gray-900 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Template Selection</span>
                <select
                  name="template"
                  value={form.template}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
                >
                  {availableTemplates.map((option) => (
                    <option key={option.id} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-900 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Subject</span>
                <input
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  placeholder="Message subject"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-900 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Message Body</span>
                <textarea
                  name="messageBody"
                  value={form.messageBody}
                  onChange={handleChange}
                  rows={7}
                  placeholder="Write your message here..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Live Preview</p>
                <h4 className="mt-1 text-sm font-semibold text-gray-900">Email-style rendering</h4>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-900">
                {previewDeliveryMethod}
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-white bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">To</p>
                <p className="mt-1 text-sm font-medium text-gray-900">{previewRecipient}</p>
              </div>

              <div className="px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Subject</p>
                <h5 className="mt-1 text-base font-semibold text-gray-900">{previewSubject}</h5>

                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-gray-700">
                  <p className="whitespace-pre-wrap">{previewBody}</p>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-secondary">
              Updates from the form appear here immediately and remain editable in the composer fields.
            </p>
          </aside>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="neutral" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleNext} className="w-full sm:w-auto">
            Next
          </Button>
        </div>
      </section>
    </div>
  )
}

export default MessageComposerModal