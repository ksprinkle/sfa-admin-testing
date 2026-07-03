import { useEffect, useMemo, useState } from "react"
import Button from "../Button"
import { fetchCommunicationTemplates, sendCommunicationMessage } from "../../api/communications"

const recipientGroupOptions = ["All Participants", "Volunteers", "Event Staff", "Recent Attendees", "Custom Segment"]
const deliveryMethodOptions = ["Email", "SMS"]
const recipientSummaryByGroup = {
  "All Participants": { estimate: 68, label: "Estimated recipient count" },
  Volunteers: { estimate: 42, label: "Estimated recipient count" },
  "Event Staff": { estimate: 12, label: "Estimated recipient count" },
  "Recent Attendees": { estimate: 7, label: "Estimated recipient count" },
  "Custom Segment": { estimate: "Custom Selection", label: "Estimated recipient count" },
}

const DEFAULT_FORM = {
  recipientGroup: recipientGroupOptions[0],
  deliveryMethod: deliveryMethodOptions[0],
  templateId: "",
  subject: "",
  messageBody: "",
}

function normalizeChannel(channel) {
  return String(channel || "").trim().toLowerCase()
}

function normalizeAudienceType(recipientGroup) {
  return String(recipientGroup || "manual")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "manual"
}

function getTemplateContent(template) {
  return {
    recipientGroup: recipientGroupOptions[0],
    subject: template?.subject_template || "",
    messageBody: template?.body_template || "",
  }
}

function getDefaultTemplate(templates, deliveryMethod) {
  const channel = normalizeChannel(deliveryMethod)
  return templates.find((template) => normalizeChannel(template.channel) === channel) || null
}

function MessageComposerModal({ isOpen, onClose, onNext }) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateError, setTemplateError] = useState("")
  const [sendingMessage, setSendingMessage] = useState(false)
  const [sendError, setSendError] = useState("")
  const availableTemplates = useMemo(
    () => templates.filter((template) => normalizeChannel(template.channel) === normalizeChannel(form.deliveryMethod)),
    [templates, form.deliveryMethod],
  )

  useEffect(() => {
    if (!isOpen) return undefined

    let isCancelled = false

    const loadTemplates = async () => {
      setLoadingTemplates(true)
      setTemplateError("")
      setSendError("")

      try {
        const data = await fetchCommunicationTemplates()
        const nextTemplates = Array.isArray(data) ? data : []

        if (isCancelled) return

        setTemplates(nextTemplates)

        const defaultTemplate = getDefaultTemplate(nextTemplates, DEFAULT_FORM.deliveryMethod)
        setForm((current) => {
          if (current.templateId) {
            return current
          }

          if (!defaultTemplate) {
            return {
              ...DEFAULT_FORM,
              deliveryMethod: current.deliveryMethod || DEFAULT_FORM.deliveryMethod,
            }
          }

          const content = getTemplateContent(defaultTemplate)
          return {
            recipientGroup: DEFAULT_FORM.recipientGroup,
            deliveryMethod: DEFAULT_FORM.deliveryMethod,
            templateId: String(defaultTemplate.id),
            subject: content.subject,
            messageBody: content.messageBody,
          }
        })
      } catch (error) {
        if (!isCancelled) {
          setTemplates([])
          setTemplateError(error?.message || "Failed to load communication templates")
        }
      } finally {
        if (!isCancelled) {
          setLoadingTemplates(false)
        }
      }
    }

    setForm(DEFAULT_FORM)
    loadTemplates()

    return () => {
      isCancelled = true
    }
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
    setSendError("")

    setForm((current) => {
      if (name === "deliveryMethod") {
        const nextTemplate = getDefaultTemplate(templates, value)

        if (!nextTemplate) {
          return {
            ...current,
            deliveryMethod: value,
            templateId: "",
            subject: "",
            messageBody: "",
          }
        }

        const content = getTemplateContent(nextTemplate)
        return {
          ...current,
          deliveryMethod: value,
          templateId: String(nextTemplate.id),
          subject: content.subject,
          messageBody: content.messageBody,
        }
      }

      if (name === "template") {
        const selectedTemplate = templates.find((template) => String(template.id) === String(value)) || null
        if (!selectedTemplate) {
          return {
            ...current,
            templateId: value,
          }
        }

        const content = getTemplateContent(selectedTemplate)
        return {
          ...current,
          templateId: String(selectedTemplate.id),
          subject: content.subject,
          messageBody: content.messageBody,
        }
      }

      return {
        ...current,
        [name]: value,
      }
    })
  }

  const handleNext = async () => {
    if (sendingMessage) return

    const body = String(form.messageBody || "").trim()
    if (!body) {
      setSendError("Enter a message body before sending.")
      return
    }

    const payload = {
      template_id: form.templateId || null,
      channel: normalizeChannel(form.deliveryMethod),
      audience_type: normalizeAudienceType(form.recipientGroup),
      audience_filter: { recipient_group: form.recipientGroup },
      subject: String(form.subject || "").trim() || null,
      body,
    }

    setSendingMessage(true)
    setSendError("")

    try {
      const createdMessage = await sendCommunicationMessage(payload)
      await onNext?.(createdMessage)
    } catch (error) {
      setSendError(error?.message || "We could not send your message. Please try again.")
    } finally {
      setSendingMessage(false)
    }
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

        {(templateError || sendError) ? (
          <div
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {sendError || templateError}
          </div>
        ) : null}

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
                {loadingTemplates ? (
                  <div className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-secondary">
                    Loading templates...
                  </div>
                ) : (
                  <select
                    name="template"
                    value={form.templateId}
                    onChange={handleChange}
                    disabled={loadingTemplates || sendingMessage}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
                  >
                    <option value="">Select a template</option>
                    {availableTemplates.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                )}
                {templateError ? <p className="text-xs text-red-700">{templateError}</p> : null}
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-900 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Subject</span>
                <input
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  disabled={sendingMessage}
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
                  disabled={sendingMessage}
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
          <Button variant="primary" onClick={handleNext} className="w-full sm:w-auto" disabled={sendingMessage}>
            {sendingMessage ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </section>
    </div>
  )
}

export default MessageComposerModal