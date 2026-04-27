import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import BackButton from "../components/BackButton"
import {
  createEventFromTemplate,
  createEventTemplate,
  deleteEventTemplate,
  fetchEventTemplates,
  generateAnnualEventsFromTemplate,
} from "../api/events"


function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}


function getCurrentYear() {
  return new Date().getFullYear()
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
  schedule_rule_type: "nth_weekday",
  schedule_months: "5,6,7,8,9",
  schedule_weekday: "5",
  schedule_week_numbers: "2,3",
}


function parseIntegerCsv(value) {
  return String(value || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n))
}


function EventTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [templateDates, setTemplateDates] = useState({})
  const [templateYears, setTemplateYears] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingTemplateEventId, setCreatingTemplateEventId] = useState("")
  const [generatingTemplateId, setGeneratingTemplateId] = useState("")
  const [deletingTemplateId, setDeletingTemplateId] = useState("")
  const [message, setMessage] = useState("")
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
    setMessage("")
    setError("")

    try {
      const created = await createEventTemplate({
        ...form,
        capacity: Number(form.capacity),
        session_count: Number(form.session_count),
        session_capacity: Number(form.session_capacity),
        schedule_weekday: Number(form.schedule_weekday),
        schedule_months: parseIntegerCsv(form.schedule_months),
        schedule_week_numbers: parseIntegerCsv(form.schedule_week_numbers),
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
    setMessage("")
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
    setMessage("")
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

  const handleGenerateSeason = async (template) => {
    const templateId = String(template.id)
    const year = Number(templateYears[templateId] || getCurrentYear())
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("Year must be between 2000 and 2100")
      return
    }

    setGeneratingTemplateId(templateId)
    setMessage("")
    setError("")
    try {
      const result = await generateAnnualEventsFromTemplate(template.id, year)
      setMessage(`Created ${result.created} event(s), skipped ${result.skipped} existing.`)
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to generate annual events")
    } finally {
      setGeneratingTemplateId("")
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

      {message && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
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
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-800">Schedule Rule</p>
              <p className="mt-1 text-xs text-gray-600">Use comma-separated values for months and week numbers.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={form.schedule_rule_type}
                  onChange={(e) => handleFieldChange("schedule_rule_type", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Rule type (nth_weekday)"
                  required
                />
                <input
                  value={form.schedule_weekday}
                  onChange={(e) => handleFieldChange("schedule_weekday", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  type="number"
                  min="0"
                  max="6"
                  placeholder="Weekday (0-6)"
                  required
                />
                <input
                  value={form.schedule_months}
                  onChange={(e) => handleFieldChange("schedule_months", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Months (e.g. 5,6,7,8,9)"
                  required
                />
                <input
                  value={form.schedule_week_numbers}
                  onChange={(e) => handleFieldChange("schedule_week_numbers", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Week numbers (e.g. 2,3)"
                  required
                />
              </div>
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
                const selectedYear = templateYears[templateId] || String(getCurrentYear())
                const creating = creatingTemplateEventId === templateId
                const generating = generatingTemplateId === templateId
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
                          <span className="rounded-full bg-white px-2 py-1">Rule: {template.schedule_rule_type}</span>
                          <span className="rounded-full bg-white px-2 py-1">Months: {(template.schedule_months || []).join(",")}</span>
                          <span className="rounded-full bg-white px-2 py-1">Weekday: {template.schedule_weekday}</span>
                          <span className="rounded-full bg-white px-2 py-1">Weeks: {(template.schedule_week_numbers || []).join(",")}</span>
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

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        step="1"
                        value={selectedYear}
                        onChange={(e) => setTemplateYears((prev) => ({ ...prev, [templateId]: e.target.value }))}
                        className="rounded border border-gray-300 px-3 py-2"
                      />
                      <button
                        type="button"
                        onClick={() => handleGenerateSeason(template)}
                        disabled={generating}
                        className={`rounded px-4 py-2 font-medium ${generating ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-slate-700 text-white hover:bg-slate-800"}`}
                      >
                        {generating ? "Generating..." : "Generate Season"}
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