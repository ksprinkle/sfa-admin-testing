import { useState } from "react"
import { useNavigate } from "react-router-dom"
import EventForm from "../components/EventForm"
import { createEvent } from "../api/events"

function CreateEvent() {

  const navigate = useNavigate()

  async function handleSubmit(data) {

    try {

      const event = await createEvent({
        ...data,
        status: "draft"
      })

      navigate(`/events/${event.id}`)

    } catch (err) {

      console.error("Create event failed", err)

    }

  }

  return (

    <div className="p-6">

      <h1 className="text-2xl font-semibold mb-6">
        Create Event
      </h1>

      <EventForm onSubmit={handleSubmit} onCancel={() => navigate("/events")}/>

    </div>

  )
}

export default CreateEvent