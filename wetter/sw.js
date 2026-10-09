/* Service Worker – Wetter-App
 * App-Dateien: zuerst Netz, sonst Cache (Updates sofort sichtbar, offline lauffähig)
 * Wetterdaten (Bright Sky, Open-Meteo): zuerst Netz, offline letzte Antwort (markiert mit x-sw-cache)
 * Karten, Radar, Satellit, Windy, Anbieter mit API-Key: nur Netz
 */
const VERSION = 'wetter-v3.0.0';
const SHELL = ['./', './index.html', './style.css', './app.js', './icons.js', './manifest.webmanifest',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-icon-2x.png', './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/badge-96.png'];
const DATA_HOSTS = ['api.brightsky.dev', 'api.open-meteo.com', 'geocoding-api.open-meteo.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION && x !== 'wetter-data').map(x => caches.delete(x)))).then(() => self.clients.claim()));
});

async function markCached(res) {
  const h = new Headers(res.headers); h.set('x-sw-cache', '1');
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (DATA_HOSTS.includes(u.hostname) && !u.pathname.startsWith('/radar')) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open('wetter-data').then(x => x.put(req, c)); } return r; })
      .catch(async () => { const r = await caches.match(req); if (r) return markCached(r); throw new Error('offline'); }));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { for (const c of l) if ('focus' in c) return c.focus(); return self.clients.openWindow('./'); }));
});
