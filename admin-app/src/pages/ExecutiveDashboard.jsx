import { useEffect, useMemo, useState } from "react"

import { fetchExecutiveDashboard } from "../api/events"

function formatCardValue(metricKey, value) {
  if (typeof value === "number") {
    if (metricKey.endsWith("_percentage")) {
      return `${value.toFixed(2)}%`
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  return String(value)
}

function formatCalculatedAt(value) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "-"
  return parsed.toLocaleString()
}

function cardTone(metricKey, notTracked) {
  if (notTracked) return "border-slate-300 bg-slate-50"
  if (metricKey.includes("action_required") || metricKey.includes("pending")) return "border-red-200 bg-red-50"
  if (metricKey.includes("checked_in") || metricKey.includes("ready") || metricKey.includes("verified")) return "border-green-200 bg-green-50"
  if (metricKey.includes("incomplete") || metricKey.includes("not_checked_in")) return "border-amber-200 bg-amber-50"
  return "border-blue-200 bg-blue-50"
}

function ExecutiveDashboard() {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    let isCancelled = false

    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const data = await fetchExecutiveDashboard()
        if (!isCancelled) {
          setPayload(data)
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError?.message || "Failed to load executive dashboard")
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [])

  const cards = payload?.cards || []
  const filteredCards = useMemo(() => {
    const term = String(search || "").trim().toLowerCase()
    if (!term) return cards

    return cards.filter((card) => {
      return [card.metric_key, card.label, card.data_source, String(card.value)]
        .join(" ")
        .toLowerCase()
        .includes(term)
    })
  }, [cards, search])

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-gray-900">Executive Analytics Dashboard</h2>
        <p className="mt-1 text-sm text-secondary">
          Read-only analytics projection computed from canonical domain data. Metrics are eventually consistent and non-transactional.
        </p>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Metrics</h3>
            <p className="text-xs text-secondary">Calculated at: {formatCalculatedAt(payload?.generated_at)}</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter metrics"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-64"
          />
        </div>

        {loading ? <p className="mt-3 text-sm text-secondary">Loading analytics projection...</p> : null}

        {!loading && filteredCards.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">No metrics match the current filter.</p>
        ) : null}

        {!loading && filteredCards.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((card) => (
              <article key={card.metric_key} className={`rounded-xl border p-4 ${cardTone(card.metric_key, card.not_tracked)}`}>
                <p className="text-xs uppercase tracking-wide text-slate-600">{card.metric_key}</p>
                <h4 className="mt-1 text-sm font-semibold text-gray-900">{card.label}</h4>
                <p className="mt-2 text-2xl font-bold text-gray-900">{formatCardValue(card.metric_key, card.value)}</p>
                <p className="mt-2 text-xs text-slate-600">Calculated: {formatCalculatedAt(card.calculated_at)}</p>
                <p className="mt-1 text-xs text-slate-600">Source: {card.data_source}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default ExecutiveDashboard
