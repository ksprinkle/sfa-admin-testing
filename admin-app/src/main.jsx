import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css"

function renderStartupError(message) {
  const root = document.getElementById("root")
  if (!root) return
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
      <div style="max-width:520px;width:100%;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="color:#991b1b;font-weight:700;margin-bottom:8px;">App failed to start</div>
        <div style="color:#7f1d1d;font-size:14px;line-height:1.4;">${message}</div>
        <div style="margin-top:10px;color:#7f1d1d;font-size:13px;">Try refreshing. If this is an installed app, close it fully and reopen.</div>
      </div>
    </div>
  `
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: "" }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unexpected error" }
  }

  componentDidCatch(error) {
    console.error("Root render error:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-4 shadow-sm">
            <p className="text-red-800 font-semibold">App failed to start</p>
            <p className="mt-2 text-sm text-red-700">{this.state.message || "Unexpected error"}</p>
            <p className="mt-2 text-xs text-red-700">Try refreshing. If this is an installed app, close it fully and reopen.</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

window.addEventListener("error", (event) => {
  if (!event?.error) return
  renderStartupError(event.error.message || "Unexpected startup error")
})

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason
  const message = typeof reason === "string" ? reason : reason?.message || "Unhandled startup error"
  renderStartupError(message)
})

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err)
      })
      return
    }

    // In development, stale service-worker caches can make mobile testing
    // appear inconsistent. Keep dev sessions uncached.
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  })
}