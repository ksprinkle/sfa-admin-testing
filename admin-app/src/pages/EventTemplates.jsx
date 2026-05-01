import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import BackButton from "../components/BackButton"
import {
  createEventFromTemplate,
  createEventTemplate,
  deleteEventTemplate,
  fetchEventTemplates,
  fetchEvents,
  generateAnnualEventsFromTemplate,
  updateEventTemplate,
} from "../api/events"
import { getApiBase } from "../api/baseUrl"


function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}


function getCurrentYear() {
  return new Date().getFullYear()
}

function getDaysInMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 31
  return new Date(y, m, 0).getDate()
}

function parseIsoDateParts(value) {
  const raw = String(value || "")
  const [yearPart, monthPart, dayPart] = raw.split("-")
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12
  ) {
    const maxDay = getDaysInMonth(year, month)
    return { year, month, day: Math.min(Math.max(day, 1), maxDay) }
  }

  const today = new Date()
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  }
}

function toIsoDate(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const maxDay = getDaysInMonth(y, m)
  const d = Math.min(Math.max(Number(day), 1), maxDay)
  const yyyy = String(y).padStart(4, "0")
  const mm = String(m).padStart(2, "0")
  const dd = String(d).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}


const DEFAULT_FORM = {
  name: "",
  location: "",
  capacity: "",
  volunteer_capacity: "",
  event_type: "",
  default_start_time: "09:00",
  default_end_time: "12:00",
  session_count: "1",
  session_capacity: "15",
  schedule_rule_type: "nth_weekday",
  schedule_months: "5,6,7,8,9",
  schedule_weekday: "5",
  schedule_week_numbers: "2,3",
  city: "",
  state: "",
  latitude: "",
  longitude: "",
  beach_accessibility: true,
  featured_image: "",
  beach_access_notes: "",
  directions: "",
  parking_info: "",
  lodging_info: "",
  map_url: "",
  weather_report_url: "",
  surf_report_url: "",
  internal_notes: "",
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTH_SHORT_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]
const CALENDAR_WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function normalizeEventTypeKey(eventType) {
  return String(eventType || "").trim().toLowerCase().replace(/[_-]/g, " ")
}

function isTourTemplate(template) {
  const normalizedEventType = normalizeEventTypeKey(template?.event_type)
  return normalizedEventType === "tour" || normalizedEventType.includes("tour")
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Derives the most recent matching event date for a Tour template (mirrors CalendarPreview logic)
function derivePreviewDate(template, allEvents) {
  if (!isTourTemplate(template) || !allEvents || allEvents.length === 0) return null
  const norm = normalizeSearchText
  const baseName = norm(template.name).replace(/-?template\s*$/, "").trim()
  const keywords = baseName
    .split(" ")
    .filter((word) => word.length >= 3)

  // 1. template_id match
  let matches = allEvents.filter(
    (e) => String(e?.template_id) === String(template.id) && e?.start_date
  )
  // 2. title containment
  if (matches.length === 0 && baseName.length >= 4) {
    matches = allEvents.filter((e) => {
      if (!e?.start_date) return false
      const t = norm(e?.title || e?.name || "")
      return t.includes(baseName) || baseName.includes(t)
    })
  }
  // 3. keyword-based fallback (handles names like "St Pete")
  if (matches.length === 0 && keywords.length > 0) {
    matches = allEvents.filter((e) => {
      if (!e?.start_date) return false
      const title = norm(e?.title || e?.name || "")
      const city = norm(e?.location?.city || e?.city || "")
      const venue = norm(e?.location?.venue || (typeof e?.location === "string" ? e.location : "") || "")
      return keywords.some((word) => title.includes(word) || city.includes(word) || venue.includes(word))
    })
  }
  if (matches.length === 0) return null
  matches.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
  return safeNormalizeDate(matches[0].start_date)
}

function getTemplateSeedDate(template, allEvents) {
  return safeNormalizeDate(template?.date) || (isTourTemplate(template) ? derivePreviewDate(template, allEvents) : null)
}

function toOrdinal(value) {
  const n = Number(value)
  if (!Number.isInteger(n)) return String(value)
  const abs = Math.abs(n)
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = abs % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function formatMonthRange(months) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(months) ? months : [])
        .map((month) => Number(month))
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  ).sort((left, right) => left - right)

  if (!normalized.length) return "Unknown months"

  if (normalized.length === 1) {
    return MONTH_SHORT_LABELS[normalized[0] - 1]
  }

  const startLabel = MONTH_SHORT_LABELS[normalized[0] - 1]
  const endLabel = MONTH_SHORT_LABELS[normalized[normalized.length - 1] - 1]
  return `${startLabel}-${endLabel}`
}

function formatWeekNumbers(weekNumbers) {
  const normalized = (Array.isArray(weekNumbers) ? weekNumbers : [])
    .map((week) => Number(week))
    .filter((week) => Number.isInteger(week) && week >= 1)

  if (!normalized.length) return "Unknown week"
  if (normalized.length === 1) return toOrdinal(normalized[0])
  if (normalized.length === 2) return `${toOrdinal(normalized[0])} & ${toOrdinal(normalized[1])}`

  const allButLast = normalized.slice(0, -1).map((week) => toOrdinal(week)).join(", ")
  return `${allButLast}, & ${toOrdinal(normalized[normalized.length - 1])}`
}

function formatScheduleRuleLabel(template) {
  if (isTourTemplate(template)) return "Varies TBD"

  const weekdayNumber = Number(template?.schedule_weekday)
  const weekdayLabel = Number.isInteger(weekdayNumber) && weekdayNumber >= 0 && weekdayNumber <= 6
    ? WEEKDAY_LABELS[weekdayNumber]
    : "Day"

  const weekNumbersText = formatWeekNumbers(template?.schedule_week_numbers)
  const monthRangeText = formatMonthRange(template?.schedule_months)
  return `${weekNumbersText} ${weekdayLabel} (${monthRangeText})`
}

function formatSessionLabel(template) {
  if (isTourTemplate(template)) return "24 sessions (10 each)"
  return `${template.session_count} sessions (${template.session_capacity} each)`
}


function parseIntegerCsv(value) {
  return String(value || "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n))
}


function toTimeInputValue(value) {
  return String(value || "").slice(0, 5)
}


function templateToForm(template) {
  return {
    name: String(template?.name || ""),
    location: String(template?.location || ""),
    capacity: String(template?.capacity || ""),
    volunteer_capacity: String(template?.volunteer_capacity || ""),
    event_type: String(template?.event_type || ""),
    default_start_time: toTimeInputValue(template?.default_start_time || "09:00"),
    default_end_time: toTimeInputValue(template?.default_end_time || "12:00"),
    session_count: String(template?.session_count || "1"),
    session_capacity: String(template?.session_capacity || "15"),
    schedule_rule_type: String(template?.schedule_rule_type || "nth_weekday"),
    schedule_months: Array.isArray(template?.schedule_months) ? template.schedule_months.join(",") : "5,6,7,8,9",
    schedule_weekday: String(template?.schedule_weekday ?? "5"),
    schedule_week_numbers: Array.isArray(template?.schedule_week_numbers) ? template.schedule_week_numbers.join(",") : "2,3",
    city: String(template?.city || ""),
    state: String(template?.state || ""),
    latitude: String(template?.latitude || ""),
    longitude: String(template?.longitude || ""),
    beach_accessibility: Boolean(template?.beach_accessibility ?? true),
    featured_image: String(template?.featured_image || ""),
    beach_access_notes: String(template?.beach_access_notes || ""),
    directions: String(template?.directions || ""),
    parking_info: String(template?.parking_info || ""),
    lodging_info: String(template?.lodging_info || ""),
    map_url: String(template?.map_url || ""),
    weather_report_url: String(template?.weather_report_url || ""),
    surf_report_url: String(template?.surf_report_url || ""),
    internal_notes: String(template?.internal_notes || ""),
  }
}

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function safeNormalizeDate(input) {
  if (!input) return null

  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null

  return d.toISOString().split("T")[0]
}

function getDayStatus(statusMap, dateKey) {
  return statusMap[dateKey] || null
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ""
  const parsed = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function getMonthGrid(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const cells = []

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(day)
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return weeks
}

function getClosestWeekdayInMonth(year, month, weekday, referenceDay) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let closest = null
  let minDiff = Infinity

  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(year, month, d)
    if (date.getDay() === weekday) {
      const diff = Math.abs(d - referenceDay)
      if (diff < minDiff) {
        closest = date
        minDiff = diff
      }
    }
  }

  return closest
}

function getDayCellClass(status, eventType) {
  const normalizedType = normalizeEventTypeKey(eventType)
  const isTour = normalizedType.includes("tour")
  const typeAccent = isTour ? "ring-1 ring-violet-200" : "ring-1 ring-sky-200"

  if (status === "new") {
    return `bg-green-500 text-white hover:bg-green-600 hover:scale-105 ${typeAccent}`
  }
  if (status === "existing") {
    return `bg-gray-400 text-white hover:bg-gray-500 hover:scale-105 ${typeAccent}`
  }
  return "bg-gray-100 text-secondary"
}

function EventDetailsPanel({ selectedDate, status, onClose, eventType, sessionInfo }) {
  const isOpen = Boolean(selectedDate)
  const normalizedType = normalizeEventTypeKey(eventType)
  const isTour = normalizedType.includes("tour")
  const statusLabel = status === "existing" ? "Already Exists" : "New Event (Not Created Yet)"
  const sessionLabel = sessionInfo
    ? sessionInfo
    : isTour
      ? "Variable Schedule"
      : "Session 1 / Session 2 (Auto-Assigned)"

  return (
    <div className={`pointer-events-none fixed inset-0 z-40 ${isOpen ? "" : ""}`} aria-hidden={!isOpen}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0"}`}
        onClick={onClose}
      />

      <aside
        className={`pointer-events-auto absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl transition-transform duration-300 md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[24rem] md:rounded-none ${isOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Event details"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-secondary">Event Date</p>
            <h5 className="mt-1 text-base font-semibold text-gray-900">{formatDisplayDate(selectedDate)}</h5>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-secondary">Status</p>
            <p className="mt-1 text-sm font-medium text-secondary">{statusLabel}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-secondary">Event Type</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isTour ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
              {isTour ? "Tour" : "Chapter"}
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-secondary">Session Info</p>
            <p className="mt-1 text-sm text-secondary">{sessionLabel}</p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function MonthGrid({ year, month, statusMap, onDateClick, selectedDate, eventType, allDaysClickable = false, referenceDate = null, suggestedDate = null }) {
  const monthLabel = useMemo(
    () => new Date(year, month, 1).toLocaleString("en-US", { month: "long" }),
    [year, month],
  )
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month])
  const [hoveredDate, setHoveredDate] = useState("")
  const todayDateKey = useMemo(() => getTodayIsoDate(), [])
  const typeBadge = normalizeEventTypeKey(eventType).includes("tour") ? "T" : "C"

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h5 className="text-base font-bold text-gray-900">{monthLabel}</h5>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-secondary">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">{label}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((day, index) => {
          if (!day) {
            return <div key={`empty-${month}-${index}`} className="aspect-square rounded-lg bg-gray-100" />
          }

          const dateKey = toDateKey(year, month, day)
          const status = getDayStatus(statusMap, dateKey)
          const isNew = status === "new"
          const isExisting = status === "existing"
          const isActive = Boolean(status)
          const isClickable = isActive || allDaysClickable
          const isSelected = selectedDate === dateKey
          const isToday = todayDateKey === dateKey
          const isReference = referenceDate ? referenceDate.slice(5) === dateKey.slice(5) : false
          const isSuggested = suggestedDate === dateKey
          const tooltip = isNew ? "New Event" : isExisting ? "Already Exists" : isReference ? "Last event date" : isSuggested ? "Suggested date" : ""

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => isClickable && onDateClick(dateKey, status || "any")}
              onMouseEnter={() => setHoveredDate(dateKey)}
              onMouseLeave={() => setHoveredDate("")}
              onFocus={() => setHoveredDate(dateKey)}
              onBlur={() => setHoveredDate("")}
              disabled={!isClickable}
              className={`relative aspect-square rounded-lg p-1 text-sm font-medium transition-all duration-150 ${isActive ? getDayCellClass(status, eventType) : isReference ? "bg-amber-100 text-amber-900 ring-1 ring-amber-400" : "bg-white text-gray-700 hover:bg-blue-50"} ${isSelected ? "ring-2 ring-blue-500" : ""} ${isSuggested ? "border border-blue-400" : ""} ${isToday ? "border border-blue-400" : ""} ${isClickable ? "cursor-pointer shadow-sm hover:shadow-md" : "cursor-default"}`}
              aria-label={`${dateKey}${tooltip ? ` - ${tooltip}` : ""}`}
            >
              <span className={`flex h-full items-center justify-center ${isNew ? "animate-pulse" : ""}`}>{day}</span>

              {isActive && (
                <span className="absolute right-1 top-1 rounded bg-white/90 px-1 text-[9px] font-bold text-gray-700">
                  {typeBadge}
                </span>
              )}

              {isNew && <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-green-200" />}
              {isExisting && <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-gray-700" />}

              {tooltip && hoveredDate === dateKey && (
                <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white shadow">
                  {tooltip}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CalendarPreview({ previewDates, year, eventType, sessionInfo, templateDate, templateId, events, templateName, templateLocation, onDatePick, hideDetailsPanel = false, allDaysClickable = false, suggestedDate = null, fallbackMonthDate = null }) {
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedStatus, setSelectedStatus] = useState(null)

  const isTour = String(eventType || "") === "Tour" || normalizeEventTypeKey(eventType) === "tour"

  const derivedTemplateDate = useMemo(() => {
    if (templateDate) return templateDate

    if (!isTour) return null
    if (!events || events.length === 0) return null

    const normalize = normalizeSearchText

    const templateNameNorm = normalize(templateName)
    const templateLocationNorm = normalize(templateLocation)

    // STEP 1: Strict match by template_id
    let matches = events.filter(
      (e) => String(e?.template_id) === String(templateId) && (e?.start_date || e?.date)
    )

    // STEP 2: Fallback match using title + structured location
    if (matches.length === 0) {
      matches = events.filter((e) => {
        const eventName = normalize(e?.title || e?.name)

        const eventLocation = normalize(
          e?.location?.city ||
          e?.location?.venue ||
          (typeof e?.location === "string" ? e.location : "")
        )

        if (!eventName || !eventLocation) return false

        return (
          (eventName.includes(templateNameNorm) ||
            templateNameNorm.includes(eventName)) &&
          (eventLocation.includes(templateLocationNorm) ||
            templateLocationNorm.includes(eventLocation)) &&
          (e?.start_date || e?.date)
        )
      })
    }

    if (matches.length === 0) return null

    // STEP 3: Sort by most recent date
    matches.sort((a, b) => {
      const dateA = new Date(a?.start_date || a?.date)
      const dateB = new Date(b?.start_date || b?.date)
      return dateB - dateA
    })

    // STEP 4: Return most recent date (normalized)
    const result = matches[0]?.start_date || matches[0]?.date

    if (!result) return null

    const d = new Date(result)
    if (Number.isNaN(d.getTime())) return null

    return d.toISOString().split("T")[0]
  }, [templateDate, isTour, events, templateId, templateName, templateLocation])

  const lastEventDate = useMemo(() => {
    if (!events || !templateId) return null
    const matches = events
      .filter((e) => String(e?.template_id) === String(templateId) && e?.start_date)
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))

    return matches.length > 0 ? new Date(matches[0].start_date) : null
  }, [events, templateId])

  const derivedSuggestedDate = useMemo(() => {
    if (!lastEventDate || normalizeEventTypeKey(eventType) !== "tour") return null

    const selectedYear = Number(year)
    if (!Number.isInteger(selectedYear)) return null

    const month = lastEventDate.getMonth()
    const weekday = lastEventDate.getDay()
    const day = lastEventDate.getDate()

    const suggested = getClosestWeekdayInMonth(
      selectedYear,
      month,
      weekday,
      day,
    )

    return suggested ? suggested.toISOString().split("T")[0] : null
  }, [lastEventDate, year, eventType])

  const effectiveSuggestedDate = suggestedDate || derivedSuggestedDate

  const normalizedDates = useMemo(() => {
    if (previewDates && previewDates.length > 0) {
      return previewDates
    }

    if (isTour && events && events.length > 0) {
      if (templateDate) {
        return [{ date: templateDate, exists: true }]
      }

      const norm = normalizeSearchText

      // Derive a short base name from template name for title matching
      // e.g. "Jacksonville Beach Surf Festival-Template" → "jacksonville beach surf festival"
      const baseName = norm(templateName).replace(/-?template\s*$/, "").trim()
      const keywords = baseName
        .split(" ")
        .filter((word) => word.length >= 3)

      // 1. Try template_id match first (most reliable)
      let matches = events.filter(
        (e) => String(e?.template_id) === String(templateId) && e?.start_date
      )

      // 2. Fall back to title-based match using template base name
      if (matches.length === 0 && baseName.length >= 4) {
        matches = events.filter((e) => {
          if (!e?.start_date) return false
          const eventTitle = norm(e?.title || e?.name || "")
          return eventTitle.includes(baseName) || baseName.includes(eventTitle)
        })
      }

      // 3. Final fallback: keyword match against title/city/venue
      if (matches.length === 0 && keywords.length > 0) {
        matches = events.filter((e) => {
          if (!e?.start_date) return false
          const eventTitle = norm(e?.title || e?.name || "")
          const eventCity = norm(e?.location?.city || e?.city || "")
          const eventVenue = norm(
            e?.location?.venue ||
            (typeof e?.location === "string" ? e.location : "") ||
            ""
          )
          return keywords.some((word) => eventTitle.includes(word) || eventCity.includes(word) || eventVenue.includes(word))
        })
      }

      if (matches.length === 0) return []

      matches.sort((a, b) => {
        return new Date(b?.start_date || b?.date) - new Date(a?.start_date || a?.date)
      })

      const mostRecent = safeNormalizeDate(matches[0]?.start_date || matches[0]?.date)
      if (!mostRecent) return []

      return [{ date: mostRecent, exists: true }]
    }

    return []
  }, [previewDates, isTour, events, templateName, templateLocation, templateDate, templateId])

  const dateStatusMap = useMemo(() => {
    return (Array.isArray(normalizedDates) ? normalizedDates : []).reduce((acc, item) => {
      const dateKey = String(item?.date || "")
      if (!dateKey) return acc
      acc[dateKey] = item?.exists ? "existing" : "new"
      return acc
    }, {})
  }, [normalizedDates])

  const months = useMemo(() => {
    if (isTour && normalizedDates.length > 0) {
      const d = new Date(normalizedDates[0]?.date)
      if (!Number.isNaN(d.getTime())) return [d.getMonth()]
      return []
    }

    if (isTour && normalizedDates.length === 0 && allDaysClickable) {
      const fallback = fallbackMonthDate || derivedTemplateDate
      if (fallback) {
        const d = new Date(`${fallback}T00:00:00`)
        if (!Number.isNaN(d.getTime())) return [d.getMonth()]
      }
    }

    if (normalizedDates.length > 0) {
      const monthSet = new Set()
      normalizedDates.forEach((d) => {
        const date = new Date(d?.date)
        if (!Number.isNaN(date.getTime())) monthSet.add(date.getMonth())
      })
      return Array.from(monthSet).sort((a, b) => a - b)
    }

    return []
  }, [normalizedDates, isTour, allDaysClickable, fallbackMonthDate, derivedTemplateDate])

  function handleDateClick(date, status) {
    if (!status) return
    if (date === selectedDate) {
      setSelectedDate(null)
      setSelectedStatus(null)
      return
    }
    setSelectedDate(date)
    setSelectedStatus(status)
    if (typeof onDatePick === "function") {
      onDatePick(date)
    }
  }

  function handleClosePanel() {
    setSelectedDate(null)
    setSelectedStatus(null)
  }

  useEffect(() => {
    setSelectedDate((prev) => {
      if (!prev || prev.length < 10) return prev
      return `${year}-${prev.slice(5)}`
    })
  }, [year])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        handleClosePanel()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="space-y-3">
      <div className="text-xs text-secondary">
        {months.length === 0
          ? "No dates generated"
          : months.length === 1
            ? "Previewing 1 event date"
            : `Previewing ${normalizedDates.length} generated dates across ${months.length} months`}
      </div>

      {derivedTemplateDate && (
        <div className="text-sm text-secondary">
          Last event:{" "}
          {new Date(derivedTemplateDate + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      )}

      {effectiveSuggestedDate && (
        <div className="text-xs text-blue-500">Suggested: same weekday pattern</div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-secondary">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-green-500" />
          <span>New</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-gray-400" />
          <span>Existing</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {months.map((month) => (
          <MonthGrid
            key={`${year}-${month}`}
            year={year}
            month={month}
            statusMap={dateStatusMap}
            onDateClick={handleDateClick}
            selectedDate={selectedDate}
            eventType={eventType}
            allDaysClickable={allDaysClickable}
            referenceDate={derivedTemplateDate}
            suggestedDate={effectiveSuggestedDate}
          />
        ))}
      </div>

      {!hideDetailsPanel && (
        <EventDetailsPanel
          selectedDate={selectedDate}
          status={selectedStatus}
          onClose={handleClosePanel}
          eventType={eventType}
          sessionInfo={sessionInfo}
        />
      )}
    </div>
  )
}


function EventTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [events, setEvents] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [templateDates, setTemplateDates] = useState({})
  const [templateYears, setTemplateYears] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingTemplateEventId, setCreatingTemplateEventId] = useState("")
  const [previewingTemplateId, setPreviewingTemplateId] = useState("")
  const [generatingTemplateId, setGeneratingTemplateId] = useState("")
  const [previewByTemplate, setPreviewByTemplate] = useState({})
  const [datePickerPreviewByTemplate, setDatePickerPreviewByTemplate] = useState({})
  const [openDatePickerTemplateId, setOpenDatePickerTemplateId] = useState("")
  const [datePickerLoadingTemplateId, setDatePickerLoadingTemplateId] = useState("")
  const [previewDates, setPreviewDates] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [previewTemplateId, setPreviewTemplateId] = useState(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState("")
  const [editingTemplateId, setEditingTemplateId] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleTemplateDatePartChange = (template, currentDate, part, nextValue) => {
    const templateId = String(template.id)
    const parts = parseIsoDateParts(currentDate)
    const nextYear = part === "year" ? Number(nextValue) : parts.year
    const nextMonth = part === "month" ? Number(nextValue) : parts.month
    const nextDay = part === "day" ? Number(nextValue) : parts.day
    const nextIsoDate = toIsoDate(nextYear, nextMonth, nextDay)

    setTemplateDates((prev) => ({
      ...prev,
      [templateId]: nextIsoDate,
    }))

    if (part === "year" && openDatePickerTemplateId === templateId && !isTourTemplate(template)) {
      loadDatePickerPreview(template, nextYear)
    }
  }

  async function loadDatePickerPreview(template, year) {
    const templateId = String(template.id)
    const numericYear = Number(year)
    if (!Number.isInteger(numericYear)) return

    setDatePickerLoadingTemplateId(templateId)
    try {
      const result = await generateAnnualEventsFromTemplate(template.id, numericYear, true)
      const dates = Array.isArray(result?.dates) ? result.dates : []
      setDatePickerPreviewByTemplate((prev) => ({
        ...prev,
        [templateId]: {
          year: numericYear,
          dates,
        },
      }))
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to load calendar dates")
    } finally {
      setDatePickerLoadingTemplateId("")
    }
  }

  function handleToggleDatePickerCalendar(template, year) {
    const templateId = String(template.id)
    if (openDatePickerTemplateId === templateId) {
      setOpenDatePickerTemplateId("")
      return
    }

    setOpenDatePickerTemplateId(templateId)

    if (isTourTemplate(template)) {
      return
    }

    const cached = datePickerPreviewByTemplate[templateId]
    const numericYear = Number(year)
    if (!cached || cached.year !== numericYear) {
      loadDatePickerPreview(template, numericYear)
    }
  }

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

  async function loadEvents() {
    try {
      const data = await fetchEvents()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Failed to load events for Tour date derivation", err)
    }
  }

  useEffect(() => {
    loadTemplates()
    loadEvents()
  }, [])

  useEffect(() => {
    async function fetchAllEvents() {
      try {
        const res = await fetch(`${getApiBase()}/api/events?include_all=true`)
        const data = await res.json()
        setAllEvents(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error("Failed to fetch all events", err)
      }
    }

    fetchAllEvents()
  }, [])

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateOrUpdateTemplate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage("")
    setError("")

    const payload = {
      ...form,
      capacity: Number(form.capacity),
      volunteer_capacity: form.volunteer_capacity ? Number(form.volunteer_capacity) : null,
      session_count: Number(form.session_count),
      session_capacity: Number(form.session_capacity),
      schedule_weekday: Number(form.schedule_weekday),
      schedule_months: parseIntegerCsv(form.schedule_months),
      schedule_week_numbers: parseIntegerCsv(form.schedule_week_numbers),
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      // Convert empty strings to null for optional string fields
      featured_image: form.featured_image || null,
      city: form.city || null,
      state: form.state || null,
      beach_access_notes: form.beach_access_notes || null,
      directions: form.directions || null,
      parking_info: form.parking_info || null,
      lodging_info: form.lodging_info || null,
      map_url: form.map_url || null,
      weather_report_url: form.weather_report_url || null,
      surf_report_url: form.surf_report_url || null,
      internal_notes: form.internal_notes || null,
    }

    try {
      if (editingTemplateId) {
        const updated = await updateEventTemplate(editingTemplateId, payload)
        setTemplates((prev) => prev.map((item) => (String(item.id) === String(editingTemplateId) ? updated : item)))
        setMessage("Template updated successfully")
        setEditingTemplateId("")
      } else {
        const created = await createEventTemplate(payload)
        setTemplates((prev) => [...prev, created].sort((left, right) => String(left.name).localeCompare(String(right.name))))
        setMessage("Template created successfully")
      }
      setForm(DEFAULT_FORM)
    } catch (err) {
      console.error(err)
      setError(err?.message || (editingTemplateId ? "Failed to update event template" : "Failed to create event template"))
    } finally {
      setSaving(false)
    }
  }

  const handleStartEditTemplate = (template) => {
    const templateId = String(template.id)
    const isCurrentlyEditing = editingTemplateId === templateId

    if (isCurrentlyEditing) {
      setEditingTemplateId("")
      setForm(DEFAULT_FORM)
    } else {
      setEditingTemplateId(templateId)
      setForm(templateToForm(template))
    }

    setMessage("")
    setError("")
  }

  const handleCancelEdit = () => {
    setEditingTemplateId("")
    setForm(DEFAULT_FORM)
    setMessage("")
    setError("")
  }

  const handleDeleteTemplate = async (template) => {
    const confirmed = window.confirm(`Delete template \"${template.name}\"?`)
    if (!confirmed) return

    const numericCode = String(Math.floor(1000 + Math.random() * 9000))
    const enteredCode = window.prompt(
      [
        `To permanently delete \"${template.name}\", type either:`,
        "- delete",
        `- ${numericCode}`,
      ].join("\n"),
      ""
    )
    if (enteredCode === null) return

    const normalizedInput = (enteredCode || "").trim().toLowerCase()
    if (normalizedInput !== "delete" && normalizedInput !== numericCode) {
      setError("Template deletion canceled: confirmation code did not match.")
      return
    }

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
    const seedDate = getTemplateSeedDate(template, allEvents)
    const selectedDate = templateDates[templateId]
      || seedDate
      || getTodayIsoDate()
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
    const seedDate = getTemplateSeedDate(template, allEvents)
    const fallbackYear = parseIsoDateParts(seedDate || getTodayIsoDate()).year
    const year = Number(templateYears[templateId] || fallbackYear)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("Year must be between 2000 and 2100")
      return
    }

    setGeneratingTemplateId(templateId)
    setMessage("")
    setError("")
    try {
      const result = await generateAnnualEventsFromTemplate(template.id, year, false)
      setMessage(`Created ${result.created} event(s), skipped ${result.skipped} existing.`)
      await loadEvents()
    } catch (err) {
      console.error(err)
      setError(err?.message || "Failed to generate annual events")
    } finally {
      setGeneratingTemplateId("")
    }
  }

  const handlePreview = async (templateId, selectedYear) => {
    if (showPreview && previewTemplateId === String(templateId)) {
      setShowPreview(false)
      return
    }

    try {
      const result = await generateAnnualEventsFromTemplate(templateId, Number(selectedYear), true)
      const data = Array.isArray(result?.dates) ? result.dates : []

      setPreviewDates(data)
      setPreviewTemplateId(String(templateId))
      setShowPreview(true)
    } catch (err) {
      console.error("Preview failed", err)
    }
  }

  const handleConfirmGenerate = async (template) => {
    const templateId = String(template.id)
    const preview = previewByTemplate[templateId]
    if (!preview?.year) {
      setError("Run preview before confirming generation")
      return
    }

    setGeneratingTemplateId(templateId)
    setMessage("")
    setError("")
    try {
      const result = await generateAnnualEventsFromTemplate(template.id, preview.year, false)
      setMessage(`Created ${result.created} event(s), skipped ${result.skipped} existing.`)
      setPreviewByTemplate((prev) => {
        const next = { ...prev }
        delete next[templateId]
        return next
      })
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
          <p className="text-sm text-secondary">Reusable blueprints for quickly creating draft events.</p>
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{editingTemplateId ? "Edit Template" : "Create Template"}</h2>
            {editingTemplateId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            )}
          </div>
          <form onSubmit={handleCreateOrUpdateTemplate} className="mt-4 space-y-3">
            <input
                                value={form.map_url}
                                onChange={(e) => handleFieldChange("map_url", e.target.value)}
                                className="w-full rounded border border-gray-300 px-3 py-2"
                                placeholder="Map URL"
                              />
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
              <label className="text-sm text-secondary">
                <span className="mb-1 block">Default start</span>
                <input
                  type="time"
                  value={form.default_start_time}
                  onChange={(e) => handleFieldChange("default_start_time", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  required
                />
              </label>
              <label className="text-sm text-secondary">
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
              <p className="text-sm font-medium text-secondary">Schedule Rule</p>
              <p className="mt-1 text-xs text-secondary">Use comma-separated values for months and week numbers.</p>
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

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-secondary">Location Details</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={form.city}
                  onChange={(e) => handleFieldChange("city", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="City"
                />
                <input
                  value={form.state}
                  onChange={(e) => handleFieldChange("state", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="State"
                />
                <input
                  value={form.latitude}
                  onChange={(e) => handleFieldChange("latitude", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  type="number"
                  step="0.0001"
                  placeholder="Latitude"
                />
                <input
                  value={form.longitude}
                  onChange={(e) => handleFieldChange("longitude", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  type="number"
                  step="0.0001"
                  placeholder="Longitude"
                />
              </div>
              <textarea
                value={form.directions}
                onChange={(e) => handleFieldChange("directions", e.target.value)}
                className="mt-3 w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Directions"
                rows="2"
              />
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-secondary">Beach & Event Details</p>
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.beach_accessibility}
                    onChange={(e) => handleFieldChange("beach_accessibility", e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-secondary">Beach Accessible</span>
                </label>
                <textarea
                  value={form.beach_access_notes}
                  onChange={(e) => handleFieldChange("beach_access_notes", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Beach access notes"
                  rows="2"
                />
                <textarea
                  value={form.parking_info}
                  onChange={(e) => handleFieldChange("parking_info", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Parking info"
                  rows="2"
                />
                <textarea
                  value={form.lodging_info}
                  onChange={(e) => handleFieldChange("lodging_info", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Lodging info"
                  rows="2"
                />
              </div>
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-secondary">Resources & Media</p>
              <div className="mt-3 space-y-3">
                <input
                  value={form.featured_image}
                  onChange={(e) => handleFieldChange("featured_image", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Featured image URL"
                />
                <input
                  value={form.weather_report_url}
                  onChange={(e) => handleFieldChange("weather_report_url", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Weather report URL"
                />
                <input
                  value={form.surf_report_url}
                  onChange={(e) => handleFieldChange("surf_report_url", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Surf report URL"
                />
                <input
                  value={form.volunteer_capacity}
                  onChange={(e) => handleFieldChange("volunteer_capacity", e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  type="number"
                  min="0"
                  placeholder="Volunteer capacity (optional)"
                />
              </div>
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-secondary">Internal Notes</p>
              <textarea
                value={form.internal_notes}
                onChange={(e) => handleFieldChange("internal_notes", e.target.value)}
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Internal notes for staff"
                rows="3"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`w-full rounded px-4 py-2 font-medium ${saving ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-ocean text-white hover:opacity-95"}`}
            >
              {saving ? (editingTemplateId ? "Updating..." : "Saving...") : (editingTemplateId ? "Update Template" : "Create Template")}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Templates</h2>
            <span className="text-sm text-secondary">{templates.length} total</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-secondary">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-secondary">
              No templates yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {templates.map((template) => {
                const templateId = String(template.id)
                const seedDate = getTemplateSeedDate(template, allEvents)
                const selectedDate = templateDates[templateId]
                  || seedDate
                  || getTodayIsoDate()
                const selectedDateParts = parseIsoDateParts(selectedDate)
                const matches = allEvents
                  .filter((e) => String(e?.template_id) === String(template.id) && e?.start_date)
                  .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
                const lastEventDate = matches.length > 0 ? new Date(matches[0].start_date) : null
                const suggestedDate = (() => {
                  if (!lastEventDate || !isTourTemplate(template)) return null

                  const month = lastEventDate.getMonth()
                  const weekday = lastEventDate.getDay()
                  const day = lastEventDate.getDate()

                  const suggested = getClosestWeekdayInMonth(
                    selectedDateParts.year,
                    month,
                    weekday,
                    day,
                  )

                  return suggested ? suggested.toISOString().split("T")[0] : null
                })()
                const selectedDayCount = getDaysInMonth(selectedDateParts.year, selectedDateParts.month)
                const yearOptions = Array.from({ length: 11 }, (_, index) => selectedDateParts.year - 5 + index)
                const isDatePickerOpen = openDatePickerTemplateId === templateId
                const isDatePickerLoading = datePickerLoadingTemplateId === templateId
                const datePickerPreview = datePickerPreviewByTemplate[templateId]
                const datePickerPreviewDates = Array.isArray(datePickerPreview?.dates) ? datePickerPreview.dates : []
                const selectedYear = templateYears[templateId] || String(selectedDateParts.year)
                const creating = creatingTemplateEventId === templateId
                const previewing = previewingTemplateId === templateId
                const generating = generatingTemplateId === templateId
                const deleting = deletingTemplateId === templateId
                const editing = editingTemplateId === templateId
                const preview = previewByTemplate[templateId]
                const templatePreviewDates = Array.isArray(preview?.dates) ? preview.dates : []
                const previewNewCount = templatePreviewDates.filter((item) => !item?.exists).length
                const previewExistingCount = templatePreviewDates.filter((item) => item?.exists).length
                

                return (
                  <article
                    key={templateId}
                    className={`rounded-xl border p-4 transition-colors ${editing ? "border-sky-300 bg-sky-50" : "border-gray-200 bg-gray-50"}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-gray-900">{template.name}</h3>
                        <p className="text-sm text-secondary">{template.location}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-secondary">
                          <span className="rounded-full bg-white px-2 py-1">Type: {template.event_type}</span>
                          <span className="rounded-full bg-white px-2 py-1">Capacity: {template.capacity}</span>
                          <span className="rounded-full bg-white px-2 py-1">Time: {template.default_start_time.slice(0, 5)} - {template.default_end_time.slice(0, 5)}</span>
                          <span className="rounded-full bg-white px-2 py-1">{formatSessionLabel(template)}</span>
                          <span className="rounded-full bg-white px-2 py-1">{formatScheduleRuleLabel(template)}</span>
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

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => handleStartEditTemplate(template)}
                        aria-pressed={editing}
                        className={`rounded border px-3 py-2 text-sm ${editing ? "border-sky-700 bg-sky-700 text-white hover:bg-sky-700" : "border-sky-300 bg-white text-sky-700 hover:bg-sky-50"}`}
                      >
                        {editing ? "Editing Template" : "Edit"}
                      </button>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                        <p className="mb-1.5 text-xs font-medium text-secondary">
                          Event Date
                          {(() => {
                            const refDate = seedDate
                            if (!refDate) return null
                            const d = new Date(refDate + "T00:00:00")
                            if (Number.isNaN(d.getTime())) return null
                            const weekday = d.toLocaleString("en-US", { weekday: "long" })
                            const label = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            return (
                              <span className="ml-1 font-normal text-secondary">— last event: {weekday}, {label}</span>
                            )
                          })()}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={selectedDateParts.month}
                            onChange={(e) => handleTemplateDatePartChange(template, selectedDate, "month", e.target.value)}
                            className="rounded border border-gray-300 bg-white px-2 py-2 text-sm"
                            aria-label="Event month"
                          >
                            {MONTH_SHORT_LABELS.map((label, index) => (
                              <option key={label} value={index + 1}>{label}</option>
                            ))}
                          </select>

                          <select
                            value={selectedDateParts.day}
                            onChange={(e) => handleTemplateDatePartChange(template, selectedDate, "day", e.target.value)}
                            className="rounded border border-gray-300 bg-white px-2 py-2 text-sm"
                            aria-label="Event day"
                          >
                            {Array.from({ length: selectedDayCount }, (_, index) => index + 1).map((dayValue) => (
                              <option key={dayValue} value={dayValue}>{dayValue}</option>
                            ))}
                          </select>

                          <select
                            value={selectedDateParts.year}
                            onChange={(e) => handleTemplateDatePartChange(template, selectedDate, "year", e.target.value)}
                            className="rounded border border-gray-300 bg-white px-2 py-2 text-sm"
                            aria-label="Event year"
                          >
                            {yearOptions.map((yearValue) => (
                              <option key={yearValue} value={yearValue}>{yearValue}</option>
                            ))}
                          </select>
                        </div>
                        <p className="mt-1.5 text-xs text-secondary">
                          {(() => {
                            const d = new Date(selectedDate + "T00:00:00")
                            if (Number.isNaN(d.getTime())) return null
                            return d.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                          })()}
                        </p>
                        {suggestedDate && (
                          <div className="mt-1 text-xs text-blue-500">Suggested: same weekday pattern</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCreateEvent(template)}
                        disabled={creating || !selectedDate}
                        className={`rounded px-4 py-2 font-medium ${creating || !selectedDate ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-ocean text-white hover:opacity-95"}`}
                      >
                        {creating ? "Creating Event..." : "Create Event"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleDatePickerCalendar(template, selectedDateParts.year)}
                        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {isDatePickerOpen ? "Hide Date Calendar" : "Show Date Calendar"}
                      </button>
                    </div>

                    {isDatePickerOpen && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-secondary">
                            Available dates for {selectedDateParts.year}
                          </p>
                          <p className="text-xs text-secondary">Click a highlighted day to set Create Event date</p>
                        </div>

                        {isDatePickerLoading ? (
                          <div className="text-sm text-secondary">Loading calendar dates...</div>
                        ) : (
                          <CalendarPreview
                            previewDates={datePickerPreviewDates}
                            year={selectedDateParts.year}
                            eventType={template.event_type}
                            sessionInfo={isTourTemplate(template) ? "Variable Schedule" : "Session 1 / Session 2 (Auto-Assigned)"}
                            templateDate={seedDate}
                            templateId={template.id}
                            templateName={template.name}
                            templateLocation={template.location}
                            events={allEvents}
                            hideDetailsPanel={true}
                            allDaysClickable={true}
                            fallbackMonthDate={selectedDate}
                            suggestedDate={suggestedDate}
                            onDatePick={(date) => {
                              setTemplateDates((prev) => ({
                                ...prev,
                                [templateId]: date,
                              }))
                            }}
                          />
                        )}
                      </div>
                    )}

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
                        disabled={previewing || generating}
                        className={`rounded px-4 py-2 font-medium ${previewing || generating ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-slate-700 text-white hover:bg-slate-800"}`}
                      >
                        {generating ? "Generating..." : "Generate Annual Events"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePreview(template.id, selectedYear)}
                        className="rounded bg-gray-200 px-3 py-2 hover:bg-gray-300"
                      >
                        {showPreview && previewTemplateId === templateId ? "Close Preview" : "Preview"}
                      </button>
                    </div>

                    {showPreview && previewTemplateId === templateId && (
                      <div className="mt-4 rounded border bg-white p-4">
                        <button
                          type="button"
                          onClick={() => setShowPreview(false)}
                          className="mb-2 text-sm text-gray-500"
                        >
                          Close Preview
                        </button>
                        <CalendarPreview
                          previewDates={previewDates}
                          year={Number(selectedYear)}
                          eventType={template.event_type}
                          sessionInfo={isTourTemplate(template) ? "Variable Schedule" : "Session 1 / Session 2 (Auto-Assigned)"}
                          templateDate={seedDate}
                          templateId={template.id}
                          templateName={template.name}
                          templateLocation={template.location}
                          events={allEvents}
                        />
                      </div>
                    )}

                    {preview && (
                      <div className="mt-4 rounded-lg border border-slate-300 bg-white p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h4 className="text-sm font-semibold text-slate-900">{preview.year} Events Preview</h4>
                          <div className="text-xs text-secondary">New: {previewNewCount} | Existing: {previewExistingCount}</div>
                        </div>

                        <div className="mt-3 max-h-[34rem] overflow-auto rounded border border-slate-200 p-2">
                          <CalendarPreview
                            previewDates={templatePreviewDates}
                            year={Number(preview.year)}
                            eventType={template.event_type}
                            sessionInfo={isTourTemplate(template) ? "Variable Schedule" : "Session 1 / Session 2 (Auto-Assigned)"}
                            templateDate={seedDate}
                            templateId={template.id}
                            templateName={template.name}
                            templateLocation={template.location}
                            events={allEvents}
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            onClick={() => setPreviewByTemplate((prev) => {
                              const next = { ...prev }
                              delete next[templateId]
                              return next
                            })}
                            disabled={generating}
                            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          >
                            Close Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmGenerate(template)}
                            disabled={generating}
                            className={`rounded px-4 py-2 text-sm font-medium ${generating ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}
                          >
                            {generating ? "Generating..." : "Confirm & Generate"}
                          </button>
                        </div>
                      </div>
                    )}
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