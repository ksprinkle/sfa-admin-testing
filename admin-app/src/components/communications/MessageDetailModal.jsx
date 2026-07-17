import { useEffect, useState } from "react"
import Button from "../Button"
import { deleteCommunicationMessage, updateCommunicationMessage } from "../../api/communications"

function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase()
  if (normalized === "dispatched") return "border-emerald-200 bg-emerald-50 text-emerald-900"
  if (normalized === "ready") return "border-sky-200 bg-sky-50 text-sky-900"
  if (normalized === "draft") return "border-slate-200 bg-slate-100 text-slate-700"
  return "border-gray-200 bg-gray-100 text-secondary"
}

function formatDateTime(value) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleString()
}

function MetadataField({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900">{children}</p>
    </div>
  )
}

function MessageDetailModal({ message, onClose, onUpdated, onDeleted }) {
  const [isEditing, setIsEditing] = useState(false)
  const [subjectDraft, setSubjectDraft] = useState("")
  const [bodyDraft, setBodyDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  // Reset local edit state whenever a different message is opened (or the
  // modal is closed), so stale drafts never leak between messages.
  useEffect(() => {
    setIsEditing(false)
    setSubjectDraft(message?.subject || "")
    setBodyDraft(message?.body || "")
    setSaveError("")
    setDeleteError("")
  }, [message])

  useEffect(() => {
    if (!message) return undefined

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [message, onClose])

  if (!message) return null

  const isReady = message.status === "ready"

  const handleSave = async () => {
    const body = bodyDraft.trim()
    if (!body) {
      setSaveError("Message body cannot be empty.")
      return
    }

    setSaving(true)
    setSaveError("")

    try {
      const updated = await updateCommunicationMessage(message.id, {
        subject: subjectDraft.trim() || null,
        body,
      })
      setIsEditing(false)
      await onUpdated?.(updated)
    } catch (error) {
      setSaveError(error?.message || "Failed to save changes.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm("Delete this message?\n\nThis action cannot be undone.")
    if (!confirmed) return

    setDeleting(true)
    setDeleteError("")

    try {
      await deleteCommunicationMessage(message.id)
      await onDeleted?.(message.id)
    } catch (error) {
      setDeleteError(error?.message || "Failed to delete message.")
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      <section
        className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Message details"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Communications</p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">
              {isEditing ? "Edit Message" : "Message Details"}
            </h3>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={onClose}
              className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetadataField label="Status">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(message.status)}`}>
              {message.status}
            </span>
          </MetadataField>
          <MetadataField label="Channel">{String(message.channel || "—").toUpperCase()}</MetadataField>
          <MetadataField label="Audience">{message.audience_type || "—"}</MetadataField>
          <MetadataField label="Created">{formatDateTime(message.created_at)}</MetadataField>
          <MetadataField label="Updated">{formatDateTime(message.updated_at)}</MetadataField>
        </div>

        {(saveError || deleteError) ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {saveError || deleteError}
          </div>
        ) : null}

        {isEditing ? (
          <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Subject</span>
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                disabled={saving}
                placeholder="Message subject"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Body</span>
              <textarea
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                disabled={saving}
                rows={7}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900 focus:border-sky-400 focus:outline-none"
              />
            </label>
          </div>
        ) : (
          <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
            <MetadataField label="Subject">{message.subject || "(no subject)"}</MetadataField>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Body</p>
              <div className="mt-1 rounded-xl border border-gray-200 bg-slate-50 p-4 text-sm leading-6 text-gray-700">
                <p className="whitespace-pre-wrap">{message.body}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          {isEditing ? (
            <>
              <Button variant="neutral" onClick={() => setIsEditing(false)} disabled={saving} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : isReady ? (
            <>
              <Button variant="danger" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">
                {deleting ? "Deleting..." : "Delete"}
              </Button>
              <Button variant="neutral" onClick={() => setIsEditing(true)} disabled={deleting} className="w-full sm:w-auto">
                Edit
              </Button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default MessageDetailModal
