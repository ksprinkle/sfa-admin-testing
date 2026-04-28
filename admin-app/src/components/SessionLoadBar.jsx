function getFillWidth(current, capacity) {
  const safeCapacity = Number(capacity) > 0 ? Number(capacity) : 0
  const safeCurrent = Math.max(Number(current) || 0, 0)

  if (!safeCapacity) return 0

  return Math.max(0, Math.min((safeCurrent / safeCapacity) * 100, 100))
}

function getFillClass(fillPercent) {
  if (fillPercent > 90) return "bg-red-500"
  if (fillPercent >= 70) return "bg-amber-400"
  return "bg-emerald-500"
}

export default function SessionLoadBar({ current = 0, capacity = 0 }) {
  const safeCurrent = Math.max(Number(current) || 0, 0)
  const safeCapacity = Math.max(Number(capacity) || 0, 0)
  const fillPercent = getFillWidth(safeCurrent, safeCapacity)
  const fillClass = getFillClass(fillPercent)
  const label = `${safeCurrent} / ${safeCapacity}`

  return (
    <div className="w-full">
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeCapacity}
        aria-valuenow={Math.min(safeCurrent, safeCapacity)}
        aria-label={`Session load ${label}`}
      >
        <div
          className={`h-full rounded-full transition-all ${fillClass}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div className="mt-1 text-xs font-medium text-slate-700">{label}</div>
    </div>
  )
}
