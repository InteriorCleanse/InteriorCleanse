// Mr. Cash service worker: makes the app installable and lets the shell
// open even when the server is briefly unreachable. Market data is NEVER
// cached — every /api call goes to the network, so nothing stale is ever
// shown as fresh.
const CACHE = 'mr-cash-shell-v7'
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-180.png', '/icon.svg', '/css/app.css', '/js/api.js', '/js/state.js', '/js/replay.js', '/fonts/instrument-sans-400.woff2', '/fonts/instrument-sans-700.woff2', '/fonts/geist-mono-400.woff2', '/fonts/geist-mono-700.woff2']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Only this app's own files. Never the API, never the login page, never
  // anything from another site (the TradingView widget loads from theirs).
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/login') return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) caches.open(CACHE).then((c) => c.put(event.request, res.clone()))
        return res
      })
      .catch(() => caches.match(event.request).then((hit) => hit || new Response('Mr. Cash is not running. Start it on your computer, then reload.', { status: 503, headers: { 'content-type': 'text/plain' } }))),
  )
})
