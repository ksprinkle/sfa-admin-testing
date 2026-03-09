import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import EventForm from "../components/EventForm"
import { apiFetch } from "../api/api"

function EditEvent() {

  const { eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)

  useEffect(() => {

    async function loadEvent() {

      const res = await apiFetch(`/admin/events/${eventId}`)

      const data = await res.json()

      setEvent(data)

    }

    loadEvent()

  }, [eventId])

  async function handleSubmit(data) {

    await apiFetch(`/admin/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    })

    navigate(`/events/${eventId}`)

  }

  if (!event) return <div className="p-6">Loading...</div>

  return (

    <div className="p-6">

      <h1 className="text-2xl font-semibold mb-6">
        Edit Event
      </h1>

      <EventForm
        initialData={event}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/events/${eventId}`)}
      />

    </div>

  )

}

export default EditEvent