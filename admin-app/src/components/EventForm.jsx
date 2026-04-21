import { useState } from "react"

function EventForm({ initialData = {}, onSubmit, onCancel }) {

  const [form, setForm] = useState({
    title: "",
    start_date: "",
    city: "",
    state: "",
    participant_capacity: "",
    no_show_minutes: initialData.no_show_minutes ?? 15,
    ...initialData
  })

  // Initialization includes `initialData`; remove synchronous setState-in-effect
  // to satisfy the linter. If the parent needs to update the form after mount,
  // it should either remount this component or pass a different key.

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(form)
  }

  return (

    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">

      <input
        name="title"
        placeholder="Event Title"
        value={form.title ?? ""}
        onChange={handleChange}
        className="w-full border rounded p-2"
        required
      />

      <input
        type="date"
        name="start_date"
        value={form.start_date ?? ""}
        onChange={handleChange}
        className="w-full border rounded p-2"
        required
      />

      <input
        name="city"
        placeholder="City"
        value={form.city ?? ""}
        onChange={handleChange}
        className="w-full border rounded p-2"
      />

      <input
        name="state"
        placeholder="State"
        value={form.state ?? ""}
        onChange={handleChange}
        className="w-full border rounded p-2"
      />


      <input
        type="number"
        name="participant_capacity"
        placeholder="Participant Capacity"
        value={form.participant_capacity ?? ""}
        onChange={handleChange}
        className="w-full border rounded p-2"
      />

      <input
        type="number"
        name="no_show_minutes"
        placeholder="No-Show Timeout (minutes)"
        value={form.no_show_minutes ?? 15}
        min={1}
        onChange={handleChange}
        className="w-full border rounded p-2"
      />

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