import { useEffect, useState } from "react"
import Button from "../Button"

const recipientGroupOptions = ["All Participants", "Volunteers", "Event Staff", "Recent Attendees", "Custom Segment"]
const deliveryMethodOptions = ["Email", "SMS"]
const templateOptions = {
  Email: ["Event reminder", "Volunteer follow-up", "Thank you note"],
  SMS: ["Weather update", "Schedule reminder", "Urgent notice"],
}

const DEFAULT_FORM = {
  recipientGroup: recipientGroupOptions[0],
  deliveryMethod: deliveryMethodOptions[0],
  template: templateOptions.Email[0],
  subject: "",
  messageBody: "",
}

function MessageComposerModal({ isOpen, onClose, onNext }) {
  const [form, setForm] = useState(DEFAULT_FORM)

  useEffect(() => {
    if (!isOpen) return

    setForm(DEFAULT_FORM)
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

  const availableTemplates = templateOptions[form.deliveryMethod] || templateOptions.Email

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((current) => {
      if (name === "deliveryMethod") {
        const nextTemplates = templateOptions[value] || templateOptions.Email
        return {
          ...current,
          deliveryMethod: value,
          template: nextTemplates.includes(current.template) ? current.template : nextTemplates[0],
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

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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

          <label className="space-y-2 text-sm font-medium text-gray-900 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Template Selection</span>
            <select
              name="template"
              value={form.template}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
            >
              {availableTemplates.map((option) => (
                <option key={option} value={option}>
                  {option}
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