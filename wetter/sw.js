/* Service Worker – Wetter-App
 * App-Dateien + Leaflet (unpkg): zuerst Netz, sonst Cache (offline lauffähig)
 * Wetter- und Pollendaten: zuerst Netz, offline letzte Antwort
 *   x-sw-time  = Zeitpunkt des ursprünglichen Abrufs, x-sw-cache = Antwort aus dem Offline-Speicher
 * Karten, Radar, Satellit, Windy: nur Netz
 */
const VERSION = 'wetter-v3.9.0';
const SHELL = ['./', './index.html', './style.css', './app.js', './icons.js', './scene.js', './manifest.webmanifest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/badge-96.png'];
const DATA_HOSTS = ['api.brightsky.dev', 'api.open-meteo.com', 'geocoding-api.open-meteo.com', 'air-quality-api.open-meteo.com', 'opendata.dwd.de'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { mode: u.startsWith('http') ? 'cors' : 'same-origin' }))))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION && x !== 'wetter-data').map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
async function withHeaders(res, extra) {
  const h = new Headers(res.headers); for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin || u.hostname === 'unpkg.com') {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (u.origin === location.origin ? caches.match('./index.html') : Response.error()))));
    return;
  }
  if (DATA_HOSTS.includes(u.hostname) && !u.pathname.startsWith('/radar')) {
    e.respondWith(fetch(req).then(async r => {
      if (r.ok) { const stored = await withHeaders(r.clone(), { 'x-sw-time': String(Date.now()) }); caches.open('wetter-data').then(x => x.put(req, stored)); }
      return r;
    }).catch(async () => { const r = await caches.match(req); if (r) return withHeaders(r, { 'x-sw-cache': '1' }); throw new Error('offline'); }));
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { for (const c of l) if ('focus' in c) return c.focus(); return self.clients.openWindow('./'); }));
});
