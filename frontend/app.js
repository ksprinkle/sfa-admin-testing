document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = getApiBase()
  const STAFF_PIN = "1234"

  const loginSection = document.getElementById("login-section")
  const eventSection = document.getElementById("event-section")

  const loginButton = document.getElementById("loginButton")
  const logoutButton = document.getElementById("logoutButton")
  const staffPinInput = document.getElementById("staffPin")
  const loginStatus = document.getElementById("login-status")

  const eventSelect = document.getElementById("eventSelect")
  const eventSummary = document.getElementById("event-summary")
  const eventDetails = document.getElementById("event-details")
  const attendeeInput = document.getElementById("attendeeName")
  const checkinButton = document.getElementById("checkinButton")

  const statusDiv = document.getElementById("status")
  const countDiv = document.getElementById("checkin-count")

  if (!loginButton || !logoutButton || !eventSelect || !eventDetails || !checkinButton) {
    console.error("Required DOM elements missing")
    return
  }

  let events = []
  let selectedEvent = null

  function getApiBase() {
    if (window.location.protocol.startsWith("http")) {
      return `${window.location.protocol}//${window.location.hostname}:8000/api`
    }

    return "http://localhost:8000/api"
  }

  function isLoggedInToday() {
    const loggedIn = localStorage.getItem("sfa_logged_in")
    const loginDate = localStorage.getItem("sfa_login_date")
    return loggedIn === "true" && loginDate === new Date().toDateString()
  }

  function setLoggedIn() {
    localStorage.setItem("sfa_logged_in", "true")
    localStorage.setItem("sfa_login_date", new Date().toDateString())
  }

  function logout() {
    localStorage.removeItem("sfa_logged_in")
    localStorage.removeItem("sfa_login_date")
    window.location.reload()
  }

  function formatEventType(eventType) {
    if (!eventType) return "Unspecified"

    return eventType
      .split(/[_-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  function formatDateRange(startDate, endDate) {
    if (!startDate) return "Date not set"
    const start = new Date(`${startDate}T00:00:00`)
    const end = endDate ? new Date(`${endDate}T00:00:00`) : null
    const options = { month: "short", day: "numeric", year: "numeric" }
    const startLabel = start.toLocaleDateString([], options)
    const endLabel = end ? end.toLocaleDateString([], options) : null
    return endLabel && endDate !== startDate ? `${startLabel} to ${endLabel}` : startLabel
  }

  function formatTimeRange(startTime, endTime) {
    if (!startTime) return "Time not set"
    const startLabel = toTimeLabel(startTime)
    const endLabel = endTime ? toTimeLabel(endTime) : null
    return endLabel ? `${startLabel} to ${endLabel}` : startLabel
  }

  function toTimeLabel(value) {
    const normalized = String(value).slice(0, 5)
    const [hours, minutes] = normalized.split(":")
    const date = new Date()
    date.setHours(Number(hours), Number(minutes), 0, 0)
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  function buildLocationText(event) {
    const venue = event.location?.venue
    const city = event.location?.city
    const state = event.location?.state
    return [venue, city, state].filter(Boolean).join(", ") || "Location details not set"
  }

  function buildMapUrl(event) {
    const latitude = event.location?.latitude
    const longitude = event.location?.longitude
    if (latitude != null && longitude != null) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
    }

    const fallbackQuery = buildLocationText(event)
    if (fallbackQuery && fallbackQuery !== "Location details not set") {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`
    }

    return null
  }

  function buildDetailCacheKey(slug) {
    return `event_detail_${slug}`
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
  }

  function renderEmptyEventDetails(message) {
    eventDetails.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`
  }

  function renderSelectedEvent(event, offlineDetail = false) {
    if (!event) {
      eventSummary.textContent = ""
      renderEmptyEventDetails("Select an event to view logistics, reports, and travel details.")
      return
    }

    const mapUrl = buildMapUrl(event)
    const weatherUrl = event.weather_report_url
    const surfUrl = event.surf_report_url
    const participantOpen = event.registration?.participant_open || event.participant_available
    const availabilityLabel = event.availability?.participant_available || event.participant_available
      ? "Participant spots available"
      : "Participant spots full or closed"

    eventSummary.textContent = `${formatEventType(event.event_type)} • ${formatDateRange(event.start_date, event.end_date)}${offlineDetail ? " • offline details" : ""}`

    const actionLinks = [
      mapUrl ? `<a class="action-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">Open Map</a>` : "",
      weatherUrl ? `<a class="action-link" href="${escapeHtml(weatherUrl)}" target="_blank" rel="noreferrer">Weather Report</a>` : "",
      surfUrl ? `<a class="action-link" href="${escapeHtml(surfUrl)}" target="_blank" rel="noreferrer">Surf Report</a>` : "",
    ].filter(Boolean).join("")

    const infoBlocks = [
      createInfoBlock("Directions", event.directions),
      createInfoBlock("Parking", event.parking_info),
      createInfoBlock("Lodging", event.lodging_info),
      createInfoBlock("Beach Access", event.beach_access_notes || (event.location?.beach_accessibility ? "Beach accessibility is marked as available for this event." : null)),
    ].filter(Boolean).join("")

    eventDetails.innerHTML = `
      <div class="stack-gap">
        <div class="section-heading">
          <div class="stack-gap">
            <span class="label-chip">${escapeHtml(formatEventType(event.event_type))}</span>
            <div>
              <h2>${escapeHtml(event.title)}</h2>
              <p class="detail-copy">${escapeHtml(buildLocationText(event))}</p>
            </div>
          </div>
        </div>

        <div class="pill-row">
          <div class="pill">${escapeHtml(formatDateRange(event.start_date, event.end_date))}</div>
          <div class="pill">${escapeHtml(formatTimeRange(event.start_time, event.end_time))}</div>
          <div class="pill ${participantOpen ? "success" : "warning"}">${escapeHtml(availabilityLabel)}</div>
        </div>

        ${actionLinks ? `<div class="action-grid">${actionLinks}</div>` : ""}

        <div class="detail-grid">
          <div class="detail-block">
            <h3>Travel</h3>
            <p>${escapeHtml(buildLocationText(event))}</p>
          </div>
          <div class="detail-block">
            <h3>Registration</h3>
            <p>${escapeHtml(event.registration?.participant_open ? "Participant signup is currently open." : "Participant signup is currently closed.")}</p>
          </div>
          <div class="detail-block">
            <h3>Capacity</h3>
            <p>${escapeHtml(event.capacity?.participants != null ? `${event.capacity.participants} participant spots configured` : "No participant cap configured")}</p>
          </div>
        </div>

        ${infoBlocks ? `<div class="info-grid">${infoBlocks}</div>` : ""}
      </div>
    `
  }

  function createInfoBlock(title, content) {
    if (!content) return ""
    return `
      <div class="info-block">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(content)}</p>
      </div>
    `
  }

  async function loadEvents() {
    eventSelect.innerHTML = '<option value="">Loading events...</option>'

    try {
      const response = await fetch(`${API_BASE}/events`)
      if (!response.ok) throw new Error("Failed to load events")

      events = await response.json()
      localStorage.setItem("events_cache", JSON.stringify(events))
      populateEvents(events, false)
    } catch (error) {
      const cached = localStorage.getItem("events_cache")
      if (!cached) {
        eventSelect.innerHTML = '<option value="">No events available</option>'
        renderEmptyEventDetails("Event data is unavailable offline because nothing has been cached on this device yet.")
        return
      }

      events = JSON.parse(cached)
      populateEvents(events, true)
    }
  }

  function populateEvents(eventList, offline) {
    eventSelect.innerHTML = `<option value="">Select an event${offline ? " (offline)" : ""}</option>`

    eventList.forEach((event) => {
      const option = document.createElement("option")
      option.value = String(event.id)
      option.dataset.slug = event.slug
      option.textContent = `${event.title} (${buildLocationText(event)})`
      eventSelect.appendChild(option)
    })

    if (eventSelect.options.length > 1) {
      eventSelect.selectedIndex = 1
      handleEventSelection()
      updateCount()
    } else {
      renderEmptyEventDetails("No published events are currently available.")
    }
  }

  async function fetchEventDetails(slug) {
    if (!slug) return null

    try {
      const response = await fetch(`${API_BASE}/events/${slug}`)
      if (!response.ok) throw new Error("Failed to load event details")
      const data = await response.json()
      localStorage.setItem(buildDetailCacheKey(slug), JSON.stringify(data))
      return { data, offline: false }
    } catch (error) {
      const cached = localStorage.getItem(buildDetailCacheKey(slug))
      if (!cached) return null
      return { data: JSON.parse(cached), offline: true }
    }
  }

  async function handleEventSelection() {
    const selectedOption = eventSelect.selectedOptions[0]
    const eventId = eventSelect.value

    if (!eventId || !selectedOption) {
      selectedEvent = null
      renderSelectedEvent(null)
      updateCount()
      return
    }

    const baseEvent = events.find((event) => String(event.id) === eventId) || null
    selectedEvent = baseEvent
    renderSelectedEvent(baseEvent)
    updateCount()

    const detailResult = await fetchEventDetails(selectedOption.dataset.slug)
    if (!detailResult) return

    selectedEvent = {
      ...baseEvent,
      ...detailResult.data,
    }
    renderSelectedEvent(selectedEvent, detailResult.offline)
  }

  function updateCount() {
    const eventId = eventSelect.value
    if (!eventId) {
      countDiv.textContent = ""
      return
    }

    const list = JSON.parse(localStorage.getItem(`checkins_${eventId}`) || "[]")
    countDiv.textContent = `Checked in on this device: ${list.length}`
  }

  async function handleCheckIn() {
    const eventId = eventSelect.value
    const name = attendeeInput.value.trim()

    if (!eventId || !name) {
      statusDiv.textContent = "Select an event and enter an attendee name."
      return
    }

    const key = `checkins_${eventId}`
    const existing = JSON.parse(localStorage.getItem(key) || "[]")

    if (existing.includes(name.toLowerCase())) {
      statusDiv.textContent = "This attendee has already been checked in on this device."
      return
    }

    existing.push(name.toLowerCase())
    localStorage.setItem(key, JSON.stringify(existing))

    statusDiv.textContent = navigator.onLine
      ? "Checked in and stored on this device."
      : "Checked in offline and stored locally."

    attendeeInput.value = ""
    updateCount()

    if (navigator.onLine) {
      try {
        await fetch(`${API_BASE}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            user_name: name,
            check_in_time: new Date().toISOString(),
            synced: true,
          }),
        })
      } catch (_error) {
        console.warn("Backend sync failed; keeping local check-in only.")
      }
    }
  }

  function showApp() {
    loginSection.style.display = "none"
    eventSection.style.display = "grid"
  }

  loginButton.addEventListener("click", () => {
    const entered = staffPinInput.value.trim()
    if (entered === STAFF_PIN) {
      setLoggedIn()
      loginStatus.textContent = "Logged in"
      showApp()
      loadEvents()
      return
    }

    loginStatus.textContent = "Incorrect PIN"
  })

  logoutButton.addEventListener("click", logout)
  eventSelect.addEventListener("change", handleEventSelection)
  checkinButton.addEventListener("click", handleCheckIn)

  if (isLoggedInToday()) {
    showApp()
    loadEvents()
  } else {
    renderEmptyEventDetails("Log in to view event logistics, map access, and event-day setup details.")
  }
})