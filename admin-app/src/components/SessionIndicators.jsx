function getIndicatorTone(currentValue, targetValue) {
  const current = Math.max(Number(currentValue) || 0, 0)
  const target = Math.max(Number(targetValue) || 0, 0)

  if (current > target) {
    return {
      containerClass: "border-amber-200 bg-amber-50 text-amber-700",
      dotClass: "bg-amber-400",
    }
  }

  if (current === target && target > 0) {
    return {
      containerClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dotClass: "bg-emerald-500",
    }
  }

  return {
    containerClass: "border-slate-200 bg-slate-50 text-slate-600",
    dotClass: "bg-slate-400",
  }
}

function IndicatorRow({ label, current, target }) {
  const safeCurrent = Math.max(Number(current) || 0, 0)
  const safeTarget = Math.max(Number(target) || 0, 0)
  const tone = getIndicatorTone(safeCurrent, safeTarget)

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${tone.containerClass}`}>
      <span className={`h-2 w-2 rounded-full ${tone.dotClass}`} aria-hidden="true" />
      <span>{safeCurrent} / {safeTarget} {label}</span>
    </div>
  )
}

export default function SessionIndicators({
  assistance_count = 0,
  target_assistance = 0,
  minor_count = 0,
  target_minors = 0,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <IndicatorRow
        label="assistance"
        current={assistance_count}
        target={target_assistance}
      />
      <IndicatorRow
        label="minors"
        current={minor_count}
        target={target_minors}
      />
    </div>
  )
}
