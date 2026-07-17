import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import Button from "../components/Button"
import Card from "../components/Card"
import MessageComposerModal from "../components/communications/MessageComposerModal"
import MessageDetailModal from "../components/communications/MessageDetailModal"
import { fetchCommunicationDeliveries, fetchCommunicationMessages } from "../api/communications"

const templateUsage = [
  { name: "Event reminder", usage: "34 sends", lastUsed: "2 hours ago", tone: "bg-sky-100 text-sky-900" },
  { name: "Volunteer follow-up", usage: "19 sends", lastUsed: "Yesterday", tone: "bg-emerald-100 text-emerald-900" },
  { name: "Weather notice", usage: "11 sends", lastUsed: "3 days ago", tone: "bg-amber-100 text-amber-900" },
]

function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase()

  if (normalized === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-900"
  if (normalized === "queued" || normalized === "pending") return "border-amber-200 bg-amber-50 text-amber-900"
  if (normalized === "draft") return "border-slate-200 bg-slate-100 text-slate-700"
  if (normalized === "failed") return "border-rose-200 bg-rose-50 text-rose-900"

  return "border-gray-200 bg-gray-100 text-secondary"
}

function formatDateTime(value) {
  if (!value) return "Recently"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Recently"
  return parsed.toLocaleString()
}

function summarizeDeliveries(messages, deliveries) {
  const messageStatusCounts = messages.reduce(
    (counts, message) => {
      const key = String(message?.status || "").trim().toLowerCase()
      if (key in counts) {
        counts[key] += 1
      }
      return counts
    },
    { draft: 0, ready: 0, dispatched: 0 }
  )

  const deliveryStatusCounts = deliveries.reduce(
    (counts, delivery) => {
      const key = String(delivery?.status || "").trim().toLowerCase()
      if (key in counts) {
        counts[key] += 1
      }
      return counts
    },
    { queued: 0, delivered: 0, failed: 0 }
  )

  return [
    { label: "Queued", value: String(messageStatusCounts.ready || deliveryStatusCounts.queued || 0), tone: "border-sky-200 bg-sky-50", valueClass: "text-sky-900" },
    { label: "Delivered", value: String(deliveryStatusCounts.delivered || 0), tone: "border-emerald-200 bg-emerald-50", valueClass: "text-emerald-900" },
    { label: "Opened", value: String(messageStatusCounts.dispatched || 0), tone: "border-indigo-200 bg-indigo-50", valueClass: "text-indigo-900" },
    { label: "Failed", value: String(deliveryStatusCounts.failed || 0), tone: "border-rose-200 bg-rose-50", valueClass: "text-rose-900" },
  ]
}

function Communications() {
  const location = useLocation()
  const navigate = useNavigate()
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerDraft, setComposerDraft] = useState(null)
  const [messages, setMessages] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [selectedMessage, setSelectedMessage] = useState(null)

  useEffect(() => {
    const draft = location.state?.composerDraft
    if (!draft || typeof draft !== "object") return

    setComposerDraft({
      recipientGroup: draft.recipientGroup,
      subject: draft.subject,
      messageBody: draft.messageBody,
      recipientEstimate: draft.recipientEstimate,
    })
    setComposerOpen(true)

    const count = Number(draft.recipientEstimate || 0)
    if (count > 0) {
      setStatusMessage(`Loaded message draft for ${count} selected participant(s).`)
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const loadCommunicationsData = async () => {
    setLoading(true)
    setError("")

    try {
      const [nextMessages, nextDeliveries] = await Promise.all([
        fetchCommunicationMessages(),
        fetchCommunicationDeliveries(),
      ])

      setMessages(Array.isArray(nextMessages) ? nextMessages : [])
      setDeliveries(Array.isArray(nextDeliveries) ? nextDeliveries : [])
    } catch (loadError) {
      setError(loadError?.message || "Failed to load communications data")
      setMessages([])
      setDeliveries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCommunicationsData()
  }, [])

  const handleMessageSent = async () => {
    await loadCommunicationsData()
    setStatusMessage("Message sent successfully and dashboard refreshed.")
    setComposerOpen(false)
  }

  const deliverySummary = summarizeDeliveries(messages, deliveries)
  const recentMessages = messages.slice(0, 3).map((message) => ({
    raw: message,
    subject: message.subject || "Untitled message",
    channel: String(message.channel || "email").toUpperCase(),
    status: String(message.status || "draft").replace(/_/g, " "),
    audience: message.audience_filter?.recipient_group || message.audience_type || "Manual audience",
    sentAt: formatDateTime(message.created_at),
  }))

  return (
    <div className="space-y-4 pb-20">
      <MessageComposerModal
        isOpen={composerOpen}
        initialDraft={composerDraft}
        onClose={() => {
          setComposerOpen(false)
          setComposerDraft(null)
        }}
        onNext={handleMessageSent}
      />

      <MessageDetailModal
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
      />

      {statusMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {statusMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Communications</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 sm:text-2xl">Message operations workspace</h2>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              Track outbound delivery activity, review recent broadcasts, and inspect template usage before any backend workflow is connected.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" className="shadow-sm" onClick={() => setComposerOpen(true)}>
              New Message
            </Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Delivery Summary</h3>
            <p className="text-xs text-secondary">Mock delivery metrics for the current reporting window.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            <Card className="border border-slate-200 bg-slate-50" bodyClassName="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-secondary">Loading</p>
              <p className="text-3xl font-bold text-slate-400">...</p>
              <p className="text-xs text-secondary">Refreshing dashboard data.</p>
            </Card>
          ) : null}
          {deliverySummary.map((item) => (
            <Card key={item.label} className={`border ${item.tone}`} bodyClassName="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-secondary">{item.label}</p>
              <p className={`text-3xl font-bold ${item.valueClass}`}>{item.value}</p>
              <p className="text-xs text-secondary">Placeholder metric for communications reporting.</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
        <Card header={<Card.Header>Recent Messages</Card.Header>}>
          <div className="space-y-3">
            {loading ? <p className="text-sm text-secondary">Loading recent messages...</p> : null}
            {!loading && recentMessages.length === 0 ? <p className="text-sm text-secondary">No messages yet.</p> : null}
            {recentMessages.map((message) => (
              <button
                type="button"
                key={message.raw.id}
                onClick={() => setSelectedMessage(message.raw)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h4 className="truncate text-sm font-semibold text-gray-900">{message.subject}</h4>
                    <p className="text-sm text-secondary">
                      {message.channel} to {message.audience}
                    </p>
                    <p className="text-xs text-secondary">Sent: {message.sentAt}</p>
                  </div>

                  <span className={`inline-flex items-center self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(message.status)}`}>
                    {message.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card header={<Card.Header>Template Usage</Card.Header>}>
          <div className="space-y-3">
            {templateUsage.map((template) => (
              <div key={template.name} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{template.name}</h4>
                    <p className="text-xs text-secondary">Last used {template.lastUsed}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${template.tone}`}>{template.usage}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card header={<Card.Header>Message History</Card.Header>}>
        <div className="space-y-3">
          {loading ? <p className="text-sm text-secondary">Loading message history...</p> : null}
          {!loading && messages.length === 0 ? <p className="text-sm text-secondary">No messages yet.</p> : null}
          {messages.map((message) => (
            <button
              type="button"
              key={message.id}
              onClick={() => setSelectedMessage(message)}
              className="flex w-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{formatDateTime(message.created_at)}</p>
                <h4 className="truncate text-sm font-semibold text-gray-900">{message.subject || "Untitled message"}</h4>
                <p className="text-sm text-secondary">
                  {String(message.channel || "email").toUpperCase()} to {message.audience_filter?.recipient_group || message.audience_type || "Manual audience"}
                </p>
              </div>

              <span className={`inline-flex items-center self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(message.status)}`}>
                {message.status}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default Communications