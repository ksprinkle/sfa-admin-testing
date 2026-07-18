// Shared display formatting for the public participant/family portal
// (PortalEvents.jsx, PortalRegister.jsx) — both render the same EventOut /
// EventListOut shape from the public event endpoints.

export function formatEventDateRange(startDate, endDate) {
  if (!startDate) return "Date to be announced"

  const options = { month: "short", day: "numeric", year: "numeric" }
  const startLabel = new Date(`${startDate}T00:00:00`).toLocaleDateString(undefined, options)
  if (!endDate || endDate === startDate) return startLabel

  const endLabel = new Date(`${endDate}T00:00:00`).toLocaleDateString(undefined, options)
  return `${startLabel} – ${endLabel}`
}

export function formatEventLocation(location) {
  if (!location) return "Location to be announced"
  return [location.venue, location.city, location.state].filter(Boolean).join(", ") || "Location to be announced"
}
