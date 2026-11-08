// WashLink service worker. It makes the site installable and shows a small offline page when there is no connection.
// It never caches the app or any data, so a new release and live booking status always come from the network.
const OFFLINE_CACHE = 'washlink-offline-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return
  }
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')))
})
