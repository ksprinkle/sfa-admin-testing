const DEFAULT_LOCAL_API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`
const DEFAULT_PROD_API_BASE = window.location.origin

function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase()
  if (!host) return true
  if (host === "localhost" || host === "127.0.0.1") return true
  if (host === "::1") return true

  // RFC1918/private ranges + link-local
  if (host.startsWith("10.")) return true
  if (host.startsWith("192.168.")) return true
  if (host.startsWith("169.254.")) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true

  return false
}

function parseHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

export function getApiBase() {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_URL || DEFAULT_LOCAL_API_BASE
  }

  const configured = import.meta.env.VITE_API_URL || ""
  const configuredHost = parseHostname(configured)

  // Prevent production builds from using local/LAN URLs.
  if (!configured || isPrivateOrLoopbackHost(configuredHost)) {
    return DEFAULT_PROD_API_BASE
  }

  return configured
}

export function getWsBase() {
  return getApiBase().replace(/^http/i, "ws")
}
