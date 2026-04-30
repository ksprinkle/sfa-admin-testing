import { useState } from "react"

const DEFAULT_FORM = {
  title: "",
  event_type: "",
  status: "draft",
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  timezone: "America/New_York",
  venue: "",
  city: "",
  state: "",
  latitude: "",
  longitude: "",
  beach_access_notes: "",
  directions: "",
  parking_info: "",
  lodging_info: "",
  map_url: "",
  weather_report_url: "",
  surf_report_url: "",
  participant_capacity: "",
  volunteer_capacity: "",
  featured_image: "",
  internal_notes: "",
  no_show_minutes: 15,
  beach_accessibility: true,
  participant_open: false,
  volunteer_open: false,
  exhibitor_open: false,
  website_schedule_published: false,
}

function normalizeTimeValue(value) {
  if (!value) return ""
  return String(value).slice(0, 5)
}

function normalizeInitialData(initialData) {
  const location = initialData.location || {}
  const capacity = initialData.capacity || {}
  const registration = initialData.registration || {}

  return {
    ...DEFAULT_FORM,
    ...initialData,
    event_type: initialData.event_type ?? DEFAULT_FORM.event_type,
    venue: initialData.venue ?? location.venue ?? DEFAULT_FORM.venue,
    city: initialData.city ?? location.city ?? DEFAULT_FORM.city,
    state: initialData.state ?? location.state ?? DEFAULT_FORM.state,
    latitude: initialData.latitude ?? location.latitude ?? DEFAULT_FORM.latitude,
    longitude: initialData.longitude ?? location.longitude ?? DEFAULT_FORM.longitude,
    beach_access_notes: initialData.beach_access_notes ?? DEFAULT_FORM.beach_access_notes,
    directions: initialData.directions ?? DEFAULT_FORM.directions,
    parking_info: initialData.parking_info ?? DEFAULT_FORM.parking_info,
    lodging_info: initialData.lodging_info ?? DEFAULT_FORM.lodging_info,
    map_url: initialData.map_url ?? DEFAULT_FORM.map_url,
    weather_report_url: initialData.weather_report_url ?? DEFAULT_FORM.weather_report_url,
    surf_report_url: initialData.surf_report_url ?? DEFAULT_FORM.surf_report_url,
    participant_capacity: initialData.participant_capacity ?? capacity.participants ?? DEFAULT_FORM.participant_capacity,
    volunteer_capacity: initialData.volunteer_capacity ?? capacity.volunteers ?? DEFAULT_FORM.volunteer_capacity,
    participant_open: initialData.participant_open ?? registration.participant_open ?? DEFAULT_FORM.participant_open,
    volunteer_open: initialData.volunteer_open ?? registration.volunteer_open ?? DEFAULT_FORM.volunteer_open,
    exhibitor_open: initialData.exhibitor_open ?? registration.exhibitor_open ?? DEFAULT_FORM.exhibitor_open,
    website_schedule_published: initialData.website_schedule_published ?? DEFAULT_FORM.website_schedule_published,
    no_show_minutes: initialData.no_show_minutes ?? DEFAULT_FORM.no_show_minutes,
    beach_accessibility: initialData.beach_accessibility ?? location.beach_accessibility ?? DEFAULT_FORM.beach_accessibility,
    start_time: normalizeTimeValue(initialData.start_time),
    end_time: normalizeTimeValue(initialData.end_time),
    featured_image: initialData.featured_image ?? DEFAULT_FORM.featured_image,
    internal_notes: initialData.internal_notes ?? DEFAULT_FORM.internal_notes,
  }
}

function cleanOptionalNumber(value) {
  return value === "" || value === null ? null : Number(value)
}

function CapacitySpinner({ name, value, onChange }) {
  const isUnlimited = value === "" || value === null

  function stepDown() {
    if (isUnlimited) return
    const n = Number(value)
    onChange(name, n <= 0 ? "" : String(n - 1))
  }

  function stepUp() {
    onChange(name, isUnlimited ? "0" : String(Number(value) + 1))
  }

  return (
    <div className="flex items-stretch rounded border overflow-hidden">
      <button
        type="button"
        onClick={stepDown}
        disabled={isUnlimited}
        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border-r text-gray-600 font-bold select-none disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Decrease"
      >−</button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        name={name}
        value={value ?? ""}
        placeholder="Unlimited"
        onChange={(e) => {
          const raw = e.target.value
          if (raw === "" || /^\d+$/.test(raw)) onChange(name, raw)
        }}
        className={`flex-1 px-3 py-2 text-center border-none outline-none ${isUnlimited ? "placeholder-indigo-500 font-medium" : ""}`}
      />

      <button
        type="button"
        onClick={stepUp}
        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 border-l text-gray-600 font-bold select-none"
        aria-label="Increase"
      >+</button>
    </div>
  )
}

function cleanOptionalText(value) {
  return value && value.trim() ? value.trim() : null
}

function validateForm(form) {
  if (form.end_date && form.start_date && form.end_date < form.start_date) {
    return "End date cannot be earlier than start date."
  }

  const sameDayEvent = form.start_time && form.end_time && (!form.end_date || form.end_date === form.start_date)
  if (sameDayEvent && form.end_time < form.start_time) {
    return "End time cannot be earlier than start time for a same-day event."
  }

  const latitude = cleanOptionalNumber(form.latitude)
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return "Latitude must be between -90 and 90."
  }

  const longitude = cleanOptionalNumber(form.longitude)
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return "Longitude must be between -180 and 180."
  }

  return null
}

function EventForm({ initialData = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => normalizeInitialData(initialData))
  const [formError, setFormError] = useState("")

  // Initialization includes `initialData`; remove synchronous setState-in-effect
  // to satisfy the linter. If the parent needs to update the form after mount,
  // it should either remount this component or pass a different key.

  function handleChange(e) {
    const { name, type, value, checked } = e.target
    setFormError("")
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value
    })
  }

  function handleCapacityChange(name, value) {
    setFormError("")
    setForm({ ...form, [name]: value })
  }

  function handleSubmit(e) {
    e.preventDefault()

    const validationError = validateForm(form)
    if (validationError) {
      setFormError(validationError)
      return
    }

    onSubmit({
      ...form,
      latitude: cleanOptionalNumber(form.latitude),
      longitude: cleanOptionalNumber(form.longitude),
      participant_capacity: cleanOptionalNumber(form.participant_capacity),
      volunteer_capacity: cleanOptionalNumber(form.volunteer_capacity),
      no_show_minutes: cleanOptionalNumber(form.no_show_minutes),
      featured_image: cleanOptionalText(form.featured_image),
      map_url: cleanOptionalText(form.map_url),
      weather_report_url: cleanOptionalText(form.weather_report_url),
      surf_report_url: cleanOptionalText(form.surf_report_url),
      end_date: cleanOptionalText(form.end_date),
      end_time: cleanOptionalText(form.end_time),
      venue: cleanOptionalText(form.venue),
      city: cleanOptionalText(form.city),
      state: cleanOptionalText(form.state),
      beach_access_notes: cleanOptionalText(form.beach_access_notes),
      directions: cleanOptionalText(form.directions),
      parking_info: cleanOptionalText(form.parking_info),
      lodging_info: cleanOptionalText(form.lodging_info),
      internal_notes: cleanOptionalText(form.internal_notes),
    })
  }

  return (

    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">

      {formError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Core Details</h2>
          <p className="text-sm text-secondary">
            Basic event identity, timing, and publishing status.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Event Title</span>
            <input
              name="title"
              placeholder="Event Title"
              value={form.title ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Event Type</span>
            <input
              name="event_type"
              placeholder="beach_day"
              value={form.event_type ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Status</span>
            <select
              name="status"
              value={form.status ?? "draft"}
              onChange={handleChange}
              className="w-full rounded border p-2"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Timezone</span>
            <input
              name="timezone"
              placeholder="America/New_York"
              value={form.timezone ?? "America/New_York"}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Schedule</h2>
          <p className="text-sm text-secondary">
            Use the event schedule to control visibility, check-in timing, and session planning.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Start Date</span>
            <input
              type="date"
              name="start_date"
              value={form.start_date ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">End Date</span>
            <input
              type="date"
              name="end_date"
              value={form.end_date ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Start Time</span>
            <input
              type="time"
              name="start_time"
              value={form.start_time ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">End Time</span>
            <input
              type="time"
              name="end_time"
              value={form.end_time ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Location</h2>
          <p className="text-sm text-secondary">
            Capture where the event happens and whether the beach setup is accessible.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-secondary">Venue</span>
            <input
              name="venue"
              placeholder="Event venue or beach access point"
              value={form.venue ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">City</span>
            <input
              name="city"
              placeholder="City"
              value={form.city ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">State</span>
            <input
              name="state"
              placeholder="State"
              value={form.state ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Latitude</span>
            <input
              type="number"
              name="latitude"
              placeholder="27.9975"
              value={form.latitude ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              step="any"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Longitude</span>
            <input
              type="number"
              name="longitude"
              placeholder="-82.8269"
              value={form.longitude ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              step="any"
            />
          </label>
        </div>

        <label className="flex items-start gap-2 rounded border p-3 text-sm">
          <input
            type="checkbox"
            name="beach_accessibility"
            checked={!!form.beach_accessibility}
            onChange={handleChange}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Beach accessibility confirmed
            <span className="block text-xs text-secondary">
              Mark this on when the location setup supports accessible beach operations.
            </span>
          </span>
        </label>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-secondary">Beach Access Notes</span>
          <textarea
            name="beach_access_notes"
            placeholder="Wheelchair access, boardwalk details, matting, ramp access, volunteer load-in notes"
            value={form.beach_access_notes ?? ""}
            onChange={handleChange}
            className="w-full rounded border p-2"
            rows={3}
          />
        </label>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Travel and Logistics</h2>
          <p className="text-sm text-secondary">
            Store the operational details needed for maps, directions, parking, lodging, and external conditions.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-secondary">Directions</span>
            <textarea
              name="directions"
              placeholder="Gate instructions, landmark-based directions, or arrival notes"
              value={form.directions ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              rows={3}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Parking Information</span>
            <textarea
              name="parking_info"
              placeholder="Parking lots, fees, shuttle details, ADA parking guidance"
              value={form.parking_info ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              rows={3}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Lodging Information</span>
            <textarea
              name="lodging_info"
              placeholder="Recommended hotels, room block details, nearby lodging notes"
              value={form.lodging_info ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
              rows={3}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Map URL</span>
            <input
              type="url"
              name="map_url"
              placeholder="https://www.google.com/maps/place/..."
              value={form.map_url ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Weather Report URL</span>
            <input
              type="url"
              name="weather_report_url"
              placeholder="https://weather.example.com/report"
              value={form.weather_report_url ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Surf Report URL</span>
            <input
              type="url"
              name="surf_report_url"
              placeholder="https://surf.example.com/report"
              value={form.surf_report_url ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Capacity and Operations</h2>
          <p className="text-sm text-secondary">
            Set event limits and operational settings used by check-in and registration.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Participant Capacity</span>
            <CapacitySpinner
              name="participant_capacity"
              value={form.participant_capacity ?? ""}
              onChange={handleCapacityChange}
            />
            <p className="text-xs text-secondary">Use − below 0 to set Unlimited</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Volunteer Capacity</span>
            <CapacitySpinner
              name="volunteer_capacity"
              value={form.volunteer_capacity ?? ""}
              onChange={handleCapacityChange}
            />
            <p className="text-xs text-secondary">Use − below 0 to set Unlimited</p>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">No-Show Timeout (minutes)</span>
            <input
              type="number"
              name="no_show_minutes"
              placeholder="No-Show Timeout (minutes)"
              value={form.no_show_minutes ?? 15}
              min={1}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-secondary">Featured Image URL</span>
            <input
              name="featured_image"
              placeholder="https://..."
              value={form.featured_image ?? ""}
              onChange={handleChange}
              className="w-full rounded border p-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Registration Controls</h2>
          <p className="text-sm text-secondary">
            These settings control which signup paths are visible immediately. Automatic publish rules still apply later.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-2 rounded border p-3 text-sm">
            <input
              type="checkbox"
              name="participant_open"
              checked={!!form.participant_open}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4"
            />
            <span>Participant registration open</span>
          </label>

          <label className="flex items-start gap-2 rounded border p-3 text-sm">
            <input
              type="checkbox"
              name="volunteer_open"
              checked={!!form.volunteer_open}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4"
            />
            <span>Volunteer registration open</span>
          </label>

          <label className="flex items-start gap-2 rounded border p-3 text-sm">
            <input
              type="checkbox"
              name="exhibitor_open"
              checked={!!form.exhibitor_open}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4"
            />
            <span>Exhibitor registration open</span>
          </label>

          <label className="flex items-start gap-2 rounded border p-3 text-sm">
            <input
              type="checkbox"
              name="website_schedule_published"
              checked={!!form.website_schedule_published}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Website schedule published
              <span className="block text-xs text-secondary">
                When enabled, volunteer and exhibitor registration automatically open.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Internal Notes</h2>
          <p className="text-sm text-secondary">
            Admin-only notes for setup planning, contingency details, vendor coordination, or weather backup plans.
          </p>
        </div>

        <label className="space-y-1 block">
          <span className="text-sm font-medium text-secondary">Internal Admin Notes</span>
          <textarea
            name="internal_notes"
            placeholder="Weather contingency, volunteer briefing notes, parking staff contact, surf conditions plan"
            value={form.internal_notes ?? ""}
            onChange={handleChange}
            className="w-full rounded border p-2"
            rows={5}
          />
        </label>
      </section>

      <div className="flex gap-3">

        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded"
        >
          Cancel
        </button>

        <button
          type="submit"
          className="bg-ocean text-white px-4 py-2 rounded"
        >
          Save Event
        </button>

      </div>

    </form>
  )
}

export default EventForm