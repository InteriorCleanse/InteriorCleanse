// Gavel's service worker. It makes Gavel installable and shows a plain notice
// when the phone is offline. It never serves an old copy of the app while the
// network works, and never touches /api/: every price is fetched live.
const CACHE = 'gavel-offline-v2'
const OFFLINE = ['/offline.html', '/css/app.css', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')))
})
