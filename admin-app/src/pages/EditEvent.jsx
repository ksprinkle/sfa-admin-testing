import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import EventForm from "../components/EventForm"
import { apiFetch } from "../api/api"

function EditEvent() {

  const { eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [submitError, setSubmitError] = useState("")

  useEffect(() => {

    async function loadEvent() {

      const res = await apiFetch(`/api/admin/events/${eventId}`)
      if (!res?.ok) {
        setSubmitError("Failed to load event details.")
        return
      }

      const data = await res.json()
      setEvent(data)

    }

    loadEvent()

  }, [eventId])

  async function handleSubmit(data) {

    setSubmitError("")

    const res = await apiFetch(`/api/admin/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    })

    if (!res?.ok) {
      let detail = "Failed to update event"
      try {
        const errorBody = await res.json()
        if (Array.isArray(errorBody?.detail)) {
          detail = errorBody.detail.map((item) => item?.msg || JSON.stringify(item)).join("; ")
        } else if (typeof errorBody?.detail === "string") {
          detail = errorBody.detail
        }
      } catch {
        // Keep fallback detail
      }
      setSubmitError(detail)
      return
    }

    navigate(`/events/${eventId}`)

  }

  if (!event) return <div className="p-6">Loading...</div>

  return (

    <div className="p-6">

      <h1 className="text-2xl font-semibold mb-6">
        Edit Event
      </h1>

      {submitError && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <EventForm
        initialData={event}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/events/${eventId}`)}
      />

    </div>

  )

}

export default EditEvent