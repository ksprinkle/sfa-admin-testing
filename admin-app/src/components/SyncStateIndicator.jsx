const STATE_STYLES = {
  pending: {
    dotClass: "bg-amber-500",
    ringClass: "ring-amber-200",
    label: "Sync pending",
  },
  retrying: {
    dotClass: "bg-sky-500",
    ringClass: "ring-sky-200",
    label: "Sync retrying",
  },
  failed: {
    dotClass: "bg-red-500",
    ringClass: "ring-red-200",
    label: "Sync failed",
  },
}

export default function SyncStateIndicator({ state, className = "" }) {
  const config = STATE_STYLES[state]
  if (!config) return null

  return (
    <span
      className={`inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ${config.dotClass} ${config.ringClass} ${className}`.trim()}
      title={config.label}
      aria-label={config.label}
    />
  )
}
