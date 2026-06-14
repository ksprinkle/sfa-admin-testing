import { useEffect, useMemo, useState } from "react"

import {
  activateWaiverTemplate,
  archiveWaiverTemplate,
  createWaiverTemplate,
  fetchWaiverTemplates,
  previewWaiverTemplate,
  updateWaiverTemplate,
} from "../api/waiverTemplates"

const EMPTY_FORM = {
  title: "",
  content: "",
}

function formatDateTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString()
}

function statusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase()
  if (normalized === "active") return "bg-green-100 text-green-800"
  if (normalized === "archived") return "bg-slate-200 text-slate-700"
  return "bg-amber-100 text-amber-800"
}

function WaiverTemplates() {
  const [templates, setTemplates] = useState([])
  const [selectedId, setSelectedId] = useState("")
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isNew, setIsNew] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === String(selectedId)) || null,
    [templates, selectedId],
  )

  const selectedIsEditable = selectedTemplate?.status === "draft"

  const loadTemplates = async (preferredId = null) => {
    setLoading(true)
    setError("")
    try {
      const data = await fetchWaiverTemplates()
      setTemplates(data)

      const nextSelected = preferredId
        ? data.find((item) => String(item.id) === String(preferredId))
        : data[0]

      if (nextSelected) {
        setSelectedId(nextSelected.id)
        setIsNew(false)
        setForm({ title: nextSelected.title, content: nextSelected.content })
        const nextPreview = await previewWaiverTemplate(nextSelected.id)
        setPreview(nextPreview)
      } else {
        setSelectedId("")
        setIsNew(true)
        setForm(EMPTY_FORM)
        setPreview(null)
      }
    } catch (loadError) {
      setError(loadError?.message || "Failed to load waiver templates")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleSelectTemplate = async (templateId) => {
    setSuccess("")
    setError("")
    setIsNew(false)
    setSelectedId(templateId)

    const template = templates.find((item) => String(item.id) === String(templateId))
    if (template) {
      setForm({ title: template.title, content: template.content })
    }

    try {
      const nextPreview = await previewWaiverTemplate(templateId)
      setPreview(nextPreview)
    } catch (previewError) {
      setError(previewError?.message || "Failed to load preview")
      setPreview(null)
    }
  }

  const resetNewForm = () => {
    setSuccess("")
    setError("")
    setIsNew(true)
    setSelectedId("")
    setPreview(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    setSuccess("")

    try {
      if (isNew) {
        const created = await createWaiverTemplate({
          title: form.title,
          content: form.content,
        })
        setSuccess(`Draft v${created.version} created.`)
        await loadTemplates(created.id)
      } else if (selectedTemplate) {
        const updated = await updateWaiverTemplate(selectedTemplate.id, {
          title: form.title,
          content: form.content,
        })
        setSuccess(`Draft v${updated.version} updated.`)
        await loadTemplates(updated.id)
      }
    } catch (saveError) {
      setError(saveError?.message || "Unable to save waiver template")
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async () => {
    if (!selectedTemplate) return
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const activated = await activateWaiverTemplate(selectedTemplate.id)
      setSuccess(`v${activated.version} is now Active. Previous Active was archived.`)
      await loadTemplates(activated.id)
    } catch (activateError) {
      setError(activateError?.message || "Unable to activate template")
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async () => {
    if (!selectedTemplate) return
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const archived = await archiveWaiverTemplate(selectedTemplate.id)
      setSuccess(`v${archived.version} archived.`)
      await loadTemplates(archived.id)
    } catch (archiveError) {
      setError(archiveError?.message || "Unable to archive template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-gray-900">Waiver Lifecycle Management</h2>
        <p className="mt-1 text-sm text-secondary">
          Active and Archived templates are immutable. To change legal content, create a new draft version and activate it.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Versions</h3>
            <button
              type="button"
              onClick={resetNewForm}
              className="rounded-lg bg-ocean px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              New Draft
            </button>
          </div>

          {loading ? <p className="text-sm text-secondary">Loading templates...</p> : null}

          <ul className="space-y-2">
            {templates.map((template) => {
              const isSelected = String(template.id) === String(selectedId)
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      isSelected ? "border-ocean bg-sky-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">v{template.version}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(template.status)}`}>
                        {template.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-secondary">{template.title}</p>
                    <p className="mt-1 text-xs text-gray-500">Created {formatDateTime(template.created_at)}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900">{isNew ? "Create Draft" : `Template v${selectedTemplate?.version}`}</h3>
            {!isNew && selectedTemplate ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(selectedTemplate.status)}`}>
                {selectedTemplate.status}
              </span>
            ) : null}
          </div>

          <form className="space-y-3" onSubmit={handleSave}>
            <label className="block text-sm font-medium text-gray-700" htmlFor="waiver-template-title">
              Title
            </label>
            <input
              id="waiver-template-title"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-ocean focus:outline-none"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              disabled={!isNew && !selectedIsEditable}
              required
            />

            <label className="block text-sm font-medium text-gray-700" htmlFor="waiver-template-content">
              Content
            </label>
            <textarea
              id="waiver-template-content"
              className="min-h-[220px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-ocean focus:outline-none"
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              disabled={!isNew && !selectedIsEditable}
              required
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving || (!isNew && !selectedIsEditable)}
                className="rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isNew ? "Create Draft" : "Save Draft"}
              </button>

              {!isNew && selectedTemplate?.status === "draft" ? (
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={saving}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Activate
                </button>
              ) : null}

              {!isNew && selectedTemplate?.status === "draft" ? (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={saving}
                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Archive Draft
                </button>
              ) : null}
            </div>
          </form>

          {selectedTemplate ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              <p>Supersedes Template ID: {selectedTemplate.supersedes_template_id || "-"}</p>
              <p>Activated At: {formatDateTime(selectedTemplate.activated_at)}</p>
              <p>Archived At: {formatDateTime(selectedTemplate.archived_at)}</p>
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-200 p-3">
            <h4 className="text-sm font-semibold text-gray-900">Preview</h4>
            {preview ? (
              <>
                <p className="mt-2 text-sm text-secondary">
                  v{preview.version} · {preview.title} · {preview.status}
                </p>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-gray-800">
                  {preview.content}
                </pre>
              </>
            ) : (
              <p className="mt-2 text-sm text-secondary">Select a template to preview content.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default WaiverTemplates
