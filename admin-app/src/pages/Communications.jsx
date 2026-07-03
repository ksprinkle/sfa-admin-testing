import { useState } from "react"
import Button from "../components/Button"
import Card from "../components/Card"
import MessageComposerModal from "../components/communications/MessageComposerModal"

const deliverySummary = [
  { label: "Queued", value: "128", tone: "border-sky-200 bg-sky-50", valueClass: "text-sky-900" },
  { label: "Delivered", value: "1,482", tone: "border-emerald-200 bg-emerald-50", valueClass: "text-emerald-900" },
  { label: "Opened", value: "1,041", tone: "border-indigo-200 bg-indigo-50", valueClass: "text-indigo-900" },
  { label: "Failed", value: "9", tone: "border-rose-200 bg-rose-50", valueClass: "text-rose-900" },
]

const recentMessages = [
  {
    subject: "Volunteer schedule reminder",
    channel: "Email",
    status: "Delivered",
    audience: "178 volunteers",
    sentAt: "Today, 8:30 AM",
  },
  {
    subject: "Weather update for Saturday event",
    channel: "SMS",
    status: "Queued",
    audience: "94 participants",
    sentAt: "Today, 7:10 AM",
  },
  {
    subject: "Template preview request",
    channel: "Email",
    status: "Draft",
    audience: "Internal review",
    sentAt: "Yesterday, 4:25 PM",
  },
]

const templateUsage = [
  { name: "Event reminder", usage: "34 sends", lastUsed: "2 hours ago", tone: "bg-sky-100 text-sky-900" },
  { name: "Volunteer follow-up", usage: "19 sends", lastUsed: "Yesterday", tone: "bg-emerald-100 text-emerald-900" },
  { name: "Weather notice", usage: "11 sends", lastUsed: "3 days ago", tone: "bg-amber-100 text-amber-900" },
]

const messageHistory = [
  {
    time: "09:12 AM",
    title: "Participant arrival reminder",
    detail: "Sent to 214 participants with an 86% delivery rate.",
    status: "Delivered",
  },
  {
    time: "Yesterday",
    title: "Template approval request",
    detail: "Shared with operations for final review before scheduling.",
    status: "Pending",
  },
  {
    time: "Mon",
    title: "Post-event thank you note",
    detail: "Broadcast to event attendees and volunteer leads.",
    status: "Archived",
  },
]

function getStatusTone(status) {
  const normalized = String(status || "").toLowerCase()

  if (normalized === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-900"
  if (normalized === "queued" || normalized === "pending") return "border-amber-200 bg-amber-50 text-amber-900"
  if (normalized === "draft") return "border-slate-200 bg-slate-100 text-slate-700"
  if (normalized === "failed") return "border-rose-200 bg-rose-50 text-rose-900"

  return "border-gray-200 bg-gray-100 text-secondary"
}

function Communications() {
  const [composerOpen, setComposerOpen] = useState(false)

  return (
    <div className="space-y-4 pb-20">
      <MessageComposerModal isOpen={composerOpen} onClose={() => setComposerOpen(false)} />

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
            {recentMessages.map((message) => (
              <article key={`${message.subject}-${message.sentAt}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
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
              </article>
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
          {messageHistory.map((entry) => (
            <div key={`${entry.title}-${entry.time}`} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{entry.time}</p>
                <h4 className="text-sm font-semibold text-gray-900">{entry.title}</h4>
                <p className="text-sm text-secondary">{entry.detail}</p>
              </div>

              <span className={`inline-flex items-center self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(entry.status)}`}>
                {entry.status}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default Communications