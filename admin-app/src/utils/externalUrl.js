const FB_CDN_HOST_RE = /(^|\.)fbcdn\.net$/i

function parseFacebookExpiryMs(urlObj) {
  const expiryHex = String(urlObj.searchParams.get("oe") || "").trim()
  if (!/^[0-9a-f]{8}$/i.test(expiryHex)) return null

  const unixSeconds = Number.parseInt(expiryHex, 16)
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null

  return unixSeconds * 1000
}

function normalizeExternalUrlInternal(rawUrl, depth = 0) {
  const value = String(rawUrl || "").trim()
  if (!value) return null

  let candidate = value
  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`
  }

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  if (FB_CDN_HOST_RE.test(parsed.hostname)) {
    // Some fbcdn links are wrappers around another image URL.
    const wrapped = parsed.searchParams.get("url")
    if (wrapped && depth < 3) {
      const decoded = decodeURIComponent(wrapped)
      const normalizedWrapped = normalizeExternalUrlInternal(decoded, depth + 1)
      if (normalizedWrapped) return normalizedWrapped
    }

    // fbcdn signed links expire (the `oe` param is a hex unix timestamp).
    const expiresAtMs = parseFacebookExpiryMs(parsed)
    if (expiresAtMs && Date.now() > expiresAtMs) {
      return null
    }
  }

  return parsed.toString()
}

export function normalizeExternalUrl(rawUrl) {
  return normalizeExternalUrlInternal(rawUrl, 0)
}
