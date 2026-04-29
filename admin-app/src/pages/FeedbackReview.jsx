import { useEffect, useState } from "react"
import { fetchFeedback } from "../api/feedback"
import { FEEDBACK_RELEASE, FEEDBACK_SCENARIO_VERSIONS, getReleaseTag } from "../config/release"

const FEATURES = [FEEDBACK_RELEASE.feature]
const VERSIONS = [FEEDBACK_RELEASE.version, FEEDBACK_RELEASE.retestVersion, ...FEEDBACK_SCENARIO_VERSIONS]
const TASK_KEYS = ["task_1", "task_2", "task_3", "task_4"]

const RATING_EMOJI = { good: "👍", okay: "😐", frustrating: "👎" }
const RATING_LABEL = { good: "Good", okay: "Okay", frustrating: "Frustrating" }
const RATING_COLOR = {
  good: "bg-emerald-50 border-emerald-200 text-emerald-800",
  okay: "bg-amber-50 border-amber-200 text-amber-800",
  frustrating: "bg-red-50 border-red-200 text-red-800",
}

const STATUS_COLS = [
  { key: "worked", label: "Worked", cls: "text-emerald-700" },
  { key: "confusing", label: "Confusing", cls: "text-amber-700" },
  { key: "failed", label: "Didn't Work", cls: "text-red-700" },
  { key: "not_tested", label: "Not Tested", cls: "text-slate-500" },
]

function fmt(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtSeconds(sec) {
  if (sec == null) return "—"
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

function fmtPercent(value) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

/**
 * Per-task status indicator.
 */
function taskStatus(row) {
  if ((row.failed ?? 0) >= 1) return { icon: "🔴", label: "Fix Required", cls: "text-red-600" }
  const answered = (row.worked ?? 0) + (row.confusing ?? 0) + (row.failed ?? 0)
  if (answered > 0 && (row.confusing ?? 0) / answered >= 0.3)
    return { icon: "⚠️", label: "Needs UX", cls: "text-amber-600" }
  if (answered === 0) return { icon: "—", label: "No data", cls: "text-slate-400" }
  return { icon: "🟢", label: "Good", cls: "text-emerald-600" }
}

/**
 * Derive action thresholds from aggregate data.
 * Returns an array of signals, highest severity first.
 */
function computeSignals(data) {
  if (!data || data.total === 0) return []

  const signals = []
  const taskBreakdown = data.task_breakdown || []
  const ratingCounts = data.rating_counts || {}
  const entries = data.entries || []
  const total = data.total

  // 1. BLOCKER — any task with ≥ 1 failure
  const failedTasks = taskBreakdown.filter((t) => (t.failed ?? 0) >= 1)
  if (failedTasks.length > 0) {
    signals.push({
      level: "blocker",
      icon: "🚨",
      title: "Immediate Fix Required",
      detail: `${failedTasks.length} task${failedTasks.length > 1 ? "s" : ""} reported as broken: ${failedTasks.map((t) => t.label).join(", ")}.`,
      action: "Fix before next release. No exceptions.",
      border: "border-red-300",
      bg: "bg-red-50",
      titleColor: "text-red-700",
      badgeColor: "bg-red-100 text-red-700",
    })
  }

  // 2. UX ISSUE — any task where confusing ≥ 30% of answered responses
  const confusingTasks = taskBreakdown.filter((t) => {
    const answered = (t.worked ?? 0) + (t.confusing ?? 0) + (t.failed ?? 0)
    return answered > 0 && (t.confusing ?? 0) / answered >= 0.3
  })
  if (confusingTasks.length > 0) {
    signals.push({
      level: "ux",
      icon: "⚠️",
      title: "UX Issues Detected",
      detail: `${confusingTasks.length} task${confusingTasks.length > 1 ? "s" : ""} flagged as confusing by ≥ 30% of testers: ${confusingTasks.map((t) => t.label).join(", ")}.`,
      action: "Pause new features. Improve clarity and UI first.",
      border: "border-amber-300",
      bg: "bg-amber-50",
      titleColor: "text-amber-700",
      badgeColor: "bg-amber-100 text-amber-700",
    })
  }

  // 3. LOW CONFIDENCE — majority answered "not yet" to comfortable question
  const notYetCount = entries.filter((e) => e.responses?.comfortable === "not_yet").length
  const comfortableAnswered = entries.filter((e) => e.responses?.comfortable).length
  if (comfortableAnswered > 0 && notYetCount / comfortableAnswered > 0.5) {
    signals.push({
      level: "confidence",
      icon: "🟡",
      title: "Low Confidence Signal",
      detail: `${notYetCount} of ${comfortableAnswered} testers said they wouldn't use this for a real event yet.`,
      action: "Something fundamental may be off — not necessarily broken, could be trust or clarity.",
      border: "border-yellow-300",
      bg: "bg-yellow-50",
      titleColor: "text-yellow-700",
      badgeColor: "bg-yellow-100 text-yellow-700",
    })
  }

  // 4. SAFE TO PROCEED — majority positive, 0 failures, minimal confusion
  const totalFailed = taskBreakdown.reduce((s, t) => s + (t.failed ?? 0), 0)
  const totalConfusing = taskBreakdown.reduce((s, t) => s + (t.confusing ?? 0), 0)
  const totalAnswered = taskBreakdown.reduce(
    (s, t) => s + (t.worked ?? 0) + (t.confusing ?? 0) + (t.failed ?? 0),
    0
  )
  const majorityPositive = (ratingCounts.good ?? 0) > (ratingCounts.okay ?? 0) + (ratingCounts.frustrating ?? 0)
  const confusingRate = totalAnswered > 0 ? totalConfusing / totalAnswered : 0

  if (signals.length === 0 && majorityPositive && totalFailed === 0 && confusingRate < 0.15) {
    signals.push({
      level: "proceed",
      icon: "🟢",
      title: "Safe to Move On",
      detail: "Majority positive rating, no failures, minimal confusion.",
      action: "Proceed to the next feature phase.",
      border: "border-emerald-300",
      bg: "bg-emerald-50",
      titleColor: "text-emerald-700",
      badgeColor: "bg-emerald-100 text-emerald-700",
    })
  }

  return signals
}

function computePatterns(data, avgTime) {
  if (!data || data.total === 0) return []

  const patterns = []
  const taskBreakdown = data.task_breakdown || []
  const entries = data.entries || []
  const FAST_SECONDS = 60

  const confusingButWorks = taskBreakdown.filter((row) => (row.worked ?? 0) >= 1 && (row.confusing ?? 0) >= 1 && (row.failed ?? 0) === 0)
  if (confusingButWorks.length > 0) {
    patterns.push({
      icon: "🧩",
      title: "Confusing but works",
      detail: `${confusingButWorks.map((row) => row.label).join(", ")} look like UX issues rather than logic failures.`,
      action: "Clarify labels, flow, and affordances before adding more capability.",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
    })
  }

  const fastButWrong = entries.filter((entry) => entry.time_to_complete != null && entry.time_to_complete <= FAST_SECONDS)
    .filter((entry) => ["task_1", "task_2", "task_3", "task_4"].some((key) => entry.responses?.[key] === "failed"))
  if (fastButWrong.length > 0) {
    patterns.push({
      icon: "🚩",
      title: "Fast but wrong",
      detail: `${fastButWrong.length} fast submission${fastButWrong.length === 1 ? "" : "s"} included failures, which suggests testers are misunderstanding the flow.`,
      action: "Treat this as dangerous misunderstanding, not just slowness.",
      tone: "border-red-200 bg-red-50 text-red-800",
    })
  }

  const notTestedTasks = taskBreakdown.filter((row) => (row.not_tested ?? 0) >= 1)
  if (notTestedTasks.length > 0) {
    patterns.push({
      icon: "👀",
      title: "Not tested",
      detail: `${notTestedTasks.map((row) => row.label).join(", ")} were skipped by at least one tester.`,
      action: "Check whether the feature is hidden, hard to find, or poorly signposted.",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    })
  }

  const hasAnyComments = entries.some((entry) =>
    Boolean(entry.responses?.task_notes || entry.responses?.confusing || entry.responses?.missing || entry.responses?.anything_else)
  )
  if (!hasAnyComments) {
    patterns.push({
      icon: "💬",
      title: "No comments anywhere",
      detail: avgTime != null
        ? `No free-text comments were left. Avg time is ${fmtSeconds(avgTime)}.`
        : "No free-text comments were left.",
      action: avgTime != null && avgTime > 90
        ? "This may indicate disengagement rather than clarity. Check the flow and tester prompts."
        : "This may mean the flow is clear, but verify with time-to-complete before assuming that.",
      tone: "border-blue-200 bg-blue-50 text-blue-800",
    })
  }

  return patterns
}

function computeReleaseGate(data, signals) {
  if (!data || data.total === 0) return null

  const totalFailed = (data.task_breakdown || []).reduce((sum, row) => sum + (row.failed ?? 0), 0)
  const totalConfusing = (data.task_breakdown || []).reduce((sum, row) => sum + (row.confusing ?? 0), 0)
  const totalAnswered = (data.task_breakdown || []).reduce(
    (sum, row) => sum + (row.worked ?? 0) + (row.confusing ?? 0) + (row.failed ?? 0),
    0
  )
  const confusingRate = totalAnswered > 0 ? totalConfusing / totalAnswered : 0
  const comfortableAnswered = (data.entries || []).filter((entry) => entry.responses?.comfortable).length
  const comfortableNotYet = (data.entries || []).filter((entry) => entry.responses?.comfortable === "not_yet").length
  const acceptableConfidence = comfortableAnswered === 0 || comfortableNotYet === 0
  const ready = totalFailed === 0 && confusingRate < 0.15 && acceptableConfidence
  const hasBlocker = signals.some((signal) => signal.level === "blocker")
  const hasUxIssue = signals.some((signal) => signal.level === "ux")
  const hasConfidenceIssue = signals.some((signal) => signal.level === "confidence")

  return ready
    ? {
        icon: "🟢",
        title: "Retest Same Feature, Then Consider Moving On",
        detail: "Current data is within the release gate: no blockers, minimal UX issues, and no confidence issues.",
        action: "Run one more full feedback cycle on v0.1.1 before starting the next feature phase.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      }
    : {
        icon: "⏳",
        title: "Do Not Start New Features Yet",
        detail: `This feature has not cleared the release gate yet.${hasBlocker ? " Blockers remain." : ""}${hasUxIssue ? " UX confusion is still too high." : ""}${hasConfidenceIssue ? " Confidence is still weak." : ""}`,
        action: "Deploy current build, collect one full feedback cycle over 24–48 hours, apply fixes, then retest the same feature as v0.1.1.",
        tone: "border-indigo-200 bg-indigo-50 text-indigo-800",
      }
}

function computeTestCoverage(data) {
  if (!data || data.total === 0) return null
  const testedResponses = (data.task_breakdown || []).reduce(
    (sum, row) => sum + (row.worked ?? 0) + (row.confusing ?? 0) + (row.failed ?? 0),
    0
  )
  const possibleResponses = TASK_KEYS.length * data.total
  return possibleResponses > 0 ? testedResponses / possibleResponses : null
}

function computeStruggleScore(entries) {
  if (!entries || entries.length === 0) return null
  const total = entries.reduce((sum, entry) => {
    const responses = entry.responses || {}
    const hasFailed = TASK_KEYS.some((key) => responses[key] === "failed")
    const hasConfusing = TASK_KEYS.some((key) => responses[key] === "confusing")
    const slow = (entry.time_to_complete ?? 0) > 90
    return sum + (hasFailed ? 2 : 0) + (hasConfusing ? 1 : 0) + (slow ? 1 : 0)
  }, 0)
  return total / entries.length
}

function coverageTone(coverage) {
  if (coverage == null) return "border-slate-200 bg-slate-50 text-slate-700"
  if (coverage < 0.75) return "border-red-200 bg-red-50 text-red-700"
  if (coverage < 0.9) return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function struggleTone(score) {
  if (score == null) return "border-slate-200 bg-slate-50 text-slate-700"
  if (score >= 2) return "border-red-200 bg-red-50 text-red-700"
  if (score >= 1) return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

export default function FeedbackReview() {
  const [feature, setFeature] = useState(FEEDBACK_RELEASE.feature)
  const [version, setVersion] = useState(FEEDBACK_RELEASE.version)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchFeedback({ feature: feature || undefined, version: version || undefined })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [feature, version])

  const signals = data ? computeSignals(data) : []

  const avgTime = (() => {
    if (!data) return null
    const times = (data.entries || []).map((e) => e.time_to_complete).filter((t) => t != null)
    if (times.length === 0) return null
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  })()
  const patterns = data ? computePatterns(data, avgTime) : []
  const coverage = data ? computeTestCoverage(data) : null
  const struggleScore = data ? computeStruggleScore(data.entries || []) : null
  const releaseGate = data ? computeReleaseGate(data, signals) : null

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ocean mb-1">Feedback Review</h1>
      <p className="text-sm text-slate-500">Aggregate view of submitted tester feedback</p>
      <div className="mt-2 mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        <span>Release Tag</span>
        <span>{getReleaseTag(version || FEEDBACK_RELEASE.version)}</span>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-semibold text-slate-700">Release Cycle Ritual</h2>
            <p className="text-sm text-slate-500">Do not deviate from this loop until the release clears the gate.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">No 🔴 blockers</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Minimal ⚠️ UX issues</span>
            <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-yellow-700">No 🟡 confidence issues</span>
          </div>
        </div>
        <ol className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <li className="rounded-lg bg-slate-50 px-3 py-2">1. Deploy feature ({FEEDBACK_RELEASE.version})</li>
          <li className="rounded-lg bg-slate-50 px-3 py-2">2. Send test message</li>
          <li className="rounded-lg bg-slate-50 px-3 py-2">3. Wait 24–48 hours</li>
          <li className="rounded-lg bg-slate-50 px-3 py-2">4. Review /feedback dashboard</li>
          <li className="rounded-lg bg-slate-50 px-3 py-2">5. Apply fixes</li>
          <li className="rounded-lg bg-slate-50 px-3 py-2">6. Re-release ({FEEDBACK_RELEASE.retestVersion})</li>
          <li className="rounded-lg bg-slate-50 px-3 py-2 md:col-span-2">7. Re-test the same feature before moving on</li>
        </ol>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 flex-wrap mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Feature</label>
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
          >
            <option value="">All</option>
            {FEATURES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Version</label>
          <select
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">All</option>
            {VERSIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {data && !loading && (
        <>
          {/* Summary strip */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-700">
                {feature || "All features"} {version && `· ${version}`}
              </span>
              <span className="text-xs text-slate-400">{data.total} response{data.total !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex gap-3 flex-wrap">
              {["good", "okay", "frustrating"].map((r) => (
                <div
                  key={r}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm font-semibold ${RATING_COLOR[r]}`}
                >
                  <span className="text-base">{RATING_EMOJI[r]}</span>
                  {RATING_LABEL[r]}: <span className="ml-1 text-lg leading-none">{data.rating_counts[r]}</span>
                </div>
              ))}
              {avgTime != null && (
                <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold bg-slate-50 text-slate-700">
                  <span>⏱</span> Avg Time: <span className="ml-1">{fmtSeconds(avgTime)}</span>
                </div>
              )}
              {coverage != null && (
                <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm font-semibold ${coverageTone(coverage)}`}>
                  <span>🧪</span> Test Coverage: <span className="ml-1">{fmtPercent(coverage)}</span>
                </div>
              )}
              {struggleScore != null && (
                <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm font-semibold ${struggleTone(struggleScore)}`}>
                  <span>🧠</span> Struggle Score: <span className="ml-1">{struggleScore.toFixed(1)}</span>
                </div>
              )}
              {data.total === 0 && (
                <span className="text-sm text-slate-400 italic">No responses yet</span>
              )}
            </div>
          </div>

          {/* Action thresholds */}
          {signals.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Decision Signals</h2>
              {signals.map((s, i) => (
                <div key={i} className={`border ${s.border} ${s.bg} rounded-xl px-4 py-3 flex gap-3 items-start`}>
                  <span className="text-xl leading-none mt-0.5">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`font-bold text-sm ${s.titleColor}`}>{s.title}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${s.badgeColor}`}>
                        {s.level.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mb-1">{s.detail}</p>
                    <p className={`text-xs font-semibold ${s.titleColor}`}>👉 {s.action}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {patterns.length > 0 && (
            <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold text-slate-700 mb-3">Pattern Watch</h2>
              <div className="flex flex-col gap-2">
                {patterns.map((pattern, index) => (
                  <div key={index} className={`border rounded-lg px-3 py-3 ${pattern.tone}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{pattern.icon}</span>
                      <span className="font-semibold">{pattern.title}</span>
                    </div>
                    <p className="text-sm mb-1">{pattern.detail}</p>
                    <p className="text-xs font-semibold">{pattern.action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {releaseGate && (
            <div className={`mb-4 border rounded-xl px-4 py-4 ${releaseGate.tone}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl leading-none mt-0.5">{releaseGate.icon}</span>
                <div>
                  <h2 className="font-semibold mb-1">{releaseGate.title}</h2>
                  <p className="text-sm mb-2">{releaseGate.detail}</p>
                  <p className="text-sm font-semibold">{releaseGate.action}</p>
                </div>
              </div>
            </div>
          )}

          {/* Task breakdown */}
          {data.task_breakdown && data.task_breakdown.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 overflow-x-auto">
              <h2 className="font-semibold text-slate-700 mb-3">Task Breakdown</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Task</th>
                    {STATUS_COLS.map((c) => (
                      <th key={c.key} className={`text-center py-2 px-3 font-semibold ${c.cls}`}>{c.label}</th>
                    ))}
                    <th className="text-center py-2 px-3 font-semibold text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.task_breakdown.map((row) => {
                    const ts = taskStatus(row)
                    return (
                      <tr key={row.key} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 text-slate-700 font-medium">{row.label}</td>
                        {STATUS_COLS.map((c) => (
                          <td key={c.key} className={`text-center py-2 px-3 font-bold tabular-nums ${c.cls}`}>
                            {row[c.key] ?? 0}
                          </td>
                        ))}
                        <td className={`text-center py-2 px-3 font-semibold text-sm ${ts.cls}`}>
                          {ts.icon} {ts.label}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Raw entries */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="font-semibold text-slate-700 mb-3">Raw Responses</h2>
            {data.entries.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No entries yet</p>
            ) : (
              <div className="flex flex-col gap-3">
                {data.entries.map((entry) => (
                  <div key={entry.id} className="border border-slate-100 rounded-lg p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="text-slate-400">{fmt(entry.submitted_at)}</span>
                      <span className="text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">
                        {entry.version}
                      </span>
                      {entry.overall_rating && (
                        <span className={`text-xs border rounded px-1.5 py-0.5 font-semibold ${RATING_COLOR[entry.overall_rating] || ""}`}>
                          {RATING_EMOJI[entry.overall_rating]} {RATING_LABEL[entry.overall_rating]}
                        </span>
                      )}
                      {entry.time_to_complete != null && (
                        <span className="text-xs text-slate-400">⏱ {fmtSeconds(entry.time_to_complete)}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      {["task_1", "task_2", "task_3", "task_4"].map((k) => {
                        const val = entry.responses?.[k]
                        if (!val) return null
                        const color =
                          val === "worked" ? "text-emerald-700"
                          : val === "confusing" ? "text-amber-700"
                          : val === "failed" ? "text-red-700"
                          : "text-slate-400"
                        return (
                          <div key={k} className="text-xs">
                            <span className="text-slate-400">{k.replace("_", " ")}: </span>
                            <span className={`font-semibold ${color}`}>{val.replace("_", " ")}</span>
                          </div>
                        )
                      })}
                    </div>
                    {(entry.responses?.task_notes || entry.responses?.confusing || entry.responses?.missing || entry.responses?.anything_else) && (
                      <div className="flex flex-col gap-1 border-t border-slate-100 pt-2 mt-1">
                        {entry.responses.task_notes && (
                          <p className="text-slate-600"><span className="text-slate-400">Notes: </span>{entry.responses.task_notes}</p>
                        )}
                        {entry.responses.confusing && (
                          <p className="text-slate-600"><span className="text-slate-400">Confusing: </span>{entry.responses.confusing}</p>
                        )}
                        {entry.responses.missing && (
                          <p className="text-slate-600"><span className="text-slate-400">Missing: </span>{entry.responses.missing}</p>
                        )}
                        {entry.responses.anything_else && (
                          <p className="text-slate-600"><span className="text-slate-400">Other: </span>{entry.responses.anything_else}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
