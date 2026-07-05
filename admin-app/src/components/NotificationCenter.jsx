import { useEffect, useMemo, useRef, useState } from "react"

function formatRelativeTime(value) {
  if (!value) return "Recently"

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Recently"

  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 60000) return "Just now"

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return parsed.toLocaleString()
}

function toneForSeverity(severity) {
  const normalized = String(severity || "info").trim().toLowerCase()

  if (normalized === "critical") return "border-rose-200 bg-rose-50 text-rose-900"
  if (normalized === "warning") return "border-amber-200 bg-amber-50 text-amber-900"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

export default function NotificationCenter({
  isOpen,
  loading,
  error,
  notifications,
  unreadCount,
  readIds,
  onToggle,
  onClose,
  onRefresh,
  onSelect,
  onMarkRead,
  onMarkAllRead,
}) {
  const rootRef = useRef(null)
  const toggleButtonRef = useRef(null)
  const previousOpenRef = useRef(false)
  const [activeType, setActiveType] = useState("all")

  const hasNotifications = useMemo(() => Array.isArray(notifications) && notifications.length > 0, [notifications])
  const readIdSet = useMemo(() => new Set(Array.isArray(readIds) ? readIds : []), [readIds])

  const typeOptions = useMemo(() => {
    const counts = (Array.isArray(notifications) ? notifications : []).reduce((accumulator, item) => {
      const type = String(item?.type || "other")
      const typeLabel = item?.typeLabel || "Other"
      if (!accumulator[type]) {
        accumulator[type] = { value: type, label: typeLabel, count: 0 }
      }
      accumulator[type].count += 1
      return accumulator
    }, {})

    const entries = Object.values(counts).sort((left, right) => left.label.localeCompare(right.label))
    return [{ value: "all", label: "All", count: (Array.isArray(notifications) ? notifications.length : 0) }, ...entries]
  }, [notifications])

  const effectiveType = useMemo(() => {
    const exists = typeOptions.some((option) => option.value === activeType)
    return exists ? activeType : "all"
  }, [activeType, typeOptions])

  const visibleNotifications = useMemo(() => {
    const all = Array.isArray(notifications) ? notifications : []
    if (effectiveType === "all") return all
    return all.filter((item) => String(item?.type || "other") === effectiveType)
  }, [notifications, effectiveType])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        onClose?.()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose?.()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    const wasOpen = previousOpenRef.current
    previousOpenRef.current = isOpen

    if (isOpen || !wasOpen) return
    if (!toggleButtonRef.current) return

    toggleButtonRef.current.focus()
  }, [isOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={toggleButtonRef}
        type="button"
        onClick={onToggle}
        className="relative rounded-md border border-white/35 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
        aria-label="Open notification center"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="notification-center-panel"
      >
        Notifications
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full border border-white/60 bg-rose-500 px-1.5 text-[11px] font-bold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          id="notification-center-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Notification center"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Notification Center</h3>
              <p className="text-xs text-slate-500">Operational activity from telemetry and messaging</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onMarkAllRead}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                disabled={!hasNotifications || unreadCount <= 0}
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-3 py-2">
            {typeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveType(option.value)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${effectiveType === option.value ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                aria-pressed={effectiveType === option.value}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>

          {error ? (
            <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="max-h-[min(65vh,460px)] overflow-y-auto p-2">
            {loading ? <p className="px-2 py-3 text-sm text-slate-500">Loading notifications...</p> : null}

            {!loading && visibleNotifications.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">No recent notifications.</p>
            ) : null}

            {!loading && visibleNotifications.length > 0
              ? visibleNotifications.map((item) => {
                const isUnread = !readIdSet.has(item.id)
                return (
                <article
                  key={item.id}
                  className={`mb-2 rounded-lg border px-3 py-2 last:mb-0 ${isUnread ? "border-sky-200 bg-sky-50/40" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelect?.(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isUnread ? <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-hidden="true" /> : null}
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      </div>
                      {item.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.description}</p> : null}
                      <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(item.occurredAt)}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneForSeverity(item.severity)}`}>
                        {item.sourceLabel}
                      </span>
                      {isUnread ? (
                        <button
                          type="button"
                          onClick={() => onMarkRead?.(item.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )})
              : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
