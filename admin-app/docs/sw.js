const CACHE_NAME = "sfa-admin-shell-v2"
const APP_SHELL = ["/", "/manifest.json", "/vite.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return

  const requestUrl = new URL(event.request.url)
  const isNavigationRequest = event.request.mode === "navigate"
  const isCriticalAsset =
    requestUrl.pathname.startsWith("/assets/") ||
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "worker" ||
    event.request.destination === "font"

  // Leave API calls alone; network behavior is handled in app code.
  if (requestUrl.pathname.startsWith("/api/")) return

  // Keep app code fresh: try network first for navigations and core assets,
  // then fall back to cache when offline.
  if (isNavigationRequest || isCriticalAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(event.request)
          if (cached) return cached
          return caches.match("/")
        })
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response
          }

          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return response
        })
        .catch(() => caches.match("/"))
    })
  )
})
