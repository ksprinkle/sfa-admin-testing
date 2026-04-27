import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import BackButton from "../components/BackButton"
import {
  createEventFromTemplate,
  createEventTemplate,
  deleteEventTemplate,
  fetchEventTemplates,
} from "../api/events"


function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}


const DEFAULT_FORM = {
  name: "",
  location: "",
  capacity: "",
  event_type: "",
  default_start_time: "09:00",
  default_end_time: "12:00",
  session_count: "1",
  session_capacity: "15",
}


function EventTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [templateDates, setTemplateDates] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingTemplateEventId, setCreatingTemplateEventId] = useState("")
  const [deletingTemplateId, setDeletingTemplateId] = useState("")
  const [error, setError] = useState("")

  async function loadTemplates() {
    try {
      const data = await fetchEventTemplates()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to load event templates")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateTemplate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError("")

    try {
      const created = await createEventTemplate({
        ...form,
        capacity: Number(form.capacity),
        session_count: Number(form.session_count),
        session_capacity: Number(form.session_capacity),
      })
      setTemplates((prev) => [...prev, created].sort((left, right) => String(left.name).localeCompare(String(right.name))))
      setForm(DEFAULT_FORM)
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to create event template")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (template) => {
    const confirmed = window.confirm(`Delete template \"${template.name}\"?`)
    if (!confirmed) return

    setDeletingTemplateId(String(template.id))
    setError("")
    try {
      await deleteEventTemplate(template.id)
      setTemplates((prev) => prev.filter((item) => String(item.id) !== String(template.id)))
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to delete event template")
    } finally {
      setDeletingTemplateId("")
    }
  }

  const handleCreateEvent = async (template) => {
    const templateId = String(template.id)
    const selectedDate = templateDates[templateId] || getTodayIsoDate()
    if (!selectedDate) {
      setError("Choose a date before creating an event from a template")
      return
    }

    setCreatingTemplateEventId(templateId)
    setError("")
    try {
      const event = await createEventFromTemplate(template.id, selectedDate)
      navigate(`/events/${event.id}`)
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to create event from template")
    } finally {
      setCreatingTemplateEventId("")
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Event Templates</h1>
          <p className="text-sm text-gray-600">Reusable blueprints for quickly creating draft events.</p>
        </div>
        <BackButton fallbackTo="/events" className="px-3 py-2" />
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create Template</h2>
          <form onSubmit={handleCreateTemplate} className="mt-4 space-y-3">
            <input
              value={form.name}
              onChange={(e) => handleFieldChange("name", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Template name"
              required
            />
            <input
              value={form.location}
              onChange={(e) => handleFieldChange("location", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Location"
              required
            />
            <input
              value={form.event_type}
              onChange={(e) => handleFieldChange("event_type", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Event type"
              required
            />
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => handleFieldChange("capacity", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Participant capacity"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-gray-700">
                <span className="mb-1 block">Default start</span>
                <input
                  type="time"
                  value={form.default_start_time}
                  onChange={(e) => handleFieldChange("default_start_time", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm text-gray-700">
                <span className="mb-1 block">Default end</span>
                <input
                  type="time"
                  value={form.default_end_time}
                  onChange={(e) => handleFieldChange("default_end_time", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="1"
                value={form.session_count}
                onChange={(e) => handleFieldChange("session_count", e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Session count"
                required
              />
              <input
                type="number"
                min="1"
                value={form.session_capacity}
                onChange={(e) => handleFieldChange("session_capacity", e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Session capacity"
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className={`w-full rounded px-4 py-2 font-medium ${saving ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-ocean text-white hover:opacity-95"}`}
            >
              {saving ? "Saving..." : "Create Template"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Templates</h2>
            <span className="text-sm text-gray-500">{templates.length} total</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-gray-600">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
              No templates yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {templates.map((template) => {
                const templateId = String(template.id)
                const selectedDate = templateDates[templateId] || getTodayIsoDate()
                const creating = creatingTemplateEventId === templateId
                const deleting = deletingTemplateId === templateId

                return (
                  <article key={templateId} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-gray-900">{template.name}</h3>
                        <p className="text-sm text-gray-600">{template.location}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                          <span className="rounded-full bg-white px-2 py-1">Type: {template.event_type}</span>
                          <span className="rounded-full bg-white px-2 py-1">Capacity: {template.capacity}</span>
                          <span className="rounded-full bg-white px-2 py-1">Time: {template.default_start_time.slice(0, 5)} - {template.default_end_time.slice(0, 5)}</span>
                          <span className="rounded-full bg-white px-2 py-1">Sessions: {template.session_count} x {template.session_capacity}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template)}
                        disabled={deleting}
                        className={`rounded border px-3 py-2 text-sm ${deleting ? "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500" : "border-red-300 bg-white text-red-700 hover:bg-red-50"}`}
                      >
                        {deleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setTemplateDates((prev) => ({ ...prev, [templateId]: e.target.value }))}
                        className="rounded border border-gray-300 px-3 py-2"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateEvent(template)}
                        disabled={creating || !selectedDate}
                        className={`rounded px-4 py-2 font-medium ${creating || !selectedDate ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-ocean text-white hover:opacity-95"}`}
                      >
                        {creating ? "Creating Event..." : "Create Event"}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default EventTemplates