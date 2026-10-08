/* Regenradar PWA
 * Hintergrund:  basemap.de Web Raster (BKG, amtlich, CC BY 4.0) – Fallback OpenStreetMap
 * Deutschland:  DWD-Radar RV (Bright Sky /radar, 1 km, 5 min, inkl. 2 h Vorhersage)
 *               Karte: DWD-GeoServer WMS dwd:Niederschlagsradar
 *               Wetter: Bright Sky /current_weather + /weather, Warnungen: Bright Sky /alerts
 * Ausland:      RainViewer (Radar) und Open-Meteo (Wetter), Karte automatisch OSM
 */
'use strict';

// ---------- Konfiguration ----------
const BS = 'https://api.brightsky.dev';
const DWD_WMS = 'https://maps.dwd.de/geoserver/dwd/wms';
const DWD_LAYER = 'dwd:Niederschlagsradar';
const BKG_WMS = 'https://sgx.geodatenzentrum.de/wms_basemapde';
const BKG_YEAR = new Date().getFullYear();
const BKG_ATTR = `© GeoBasis-DE / <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">BKG</a> (${BKG_YEAR}) `
  + '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const LS_SETTINGS = 'regenradar.settings.v2';
const LS_NOTIFIED = 'regenradar.lastNotified';
const LS_ALERTS = 'regenradar.notifiedAlerts';
const RENOTIFY_MIN = 60;

const DEFAULTS = {
  radiusKm: 25, leadMin: 60, sensitivity: 2, intervalMin: 5, basemap: 'bm_grau',
  notify: false, alertNotify: true, autoLocate: true, opacity: 0.75, loc: null
};
// Schwellen: Rohwert in 0,01 mm / 5 min  (mm/h = Wert * 0,12)
const SENS = {
  1: { raw: 1,  mmh: 0.1, minKm2: 2 },
  2: { raw: 5,  mmh: 0.5, minKm2: 4 },
  3: { raw: 17, mmh: 2,   minKm2: 8 }
};
const LOC_RADIUS_KM = 1.5;

let S = loadSettings();
function loadSettings() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')); }
  catch { return Object.assign({}, DEFAULTS); }
}
function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(S)); }

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d });
const hhmm = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const dirName = (deg) => deg == null ? '' : DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const rad = (d) => d * Math.PI / 180;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function distKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Karte & Hintergrundkarten ----------
let map, marker, circle, layerControl;
let mode = null;            // 'dwd' | 'rv'
let frames = [], frameIdx = 0, nowFrameIdx = 0, playTimer = null;
const radarLayers = new Map();
let rvHost = '';

const BASEMAPS = {
  bm_grau: { name: 'basemap.de Grau', make: () => bkgLayer('de_basemapde_web_raster_grau') },
  bm_farbe: { name: 'basemap.de Farbe', make: () => bkgLayer('de_basemapde_web_raster_farbe') },
  osm: { name: 'OpenStreetMap', make: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTR }) }
};
const baseLayers = {};      // key -> L.Layer
let activeBase = null;      // aktuell sichtbarer Key
let autoOsm = false;        // true, wenn wegen Ausland automatisch auf OSM gewechselt

function bkgLayer(layer) {
  const l = L.tileLayer.wms(BKG_WMS, {
    layers: layer, format: 'image/png', transparent: false, version: '1.3.0',
    tileSize: 512, maxZoom: 19, attribution: BKG_ATTR
  });
  // Fällt der BKG-Dienst aus, automatisch auf OSM wechseln
  let errors = 0;
  l.on('tileerror', () => {
    if (++errors === 6 && activeBase !== 'osm') {
      toast('basemap.de nicht erreichbar – wechsle auf OpenStreetMap.', 5000);
      switchBase('osm', false);
    }
  });
  l.on('tileload', () => { errors = 0; });
  return l;
}
function getBase(key) {
  if (!baseLayers[key]) baseLayers[key] = BASEMAPS[key].make();
  return baseLayers[key];
}
function switchBase(key, persist = true) {
  if (!BASEMAPS[key]) key = 'bm_grau';
  if (activeBase === key) return;
  if (activeBase && baseLayers[activeBase]) map.removeLayer(baseLayers[activeBase]);
  getBase(key).addTo(map);
  activeBase = key;
  if (persist) { S.basemap = key; saveSettings(); autoOsm = false; $('#setBasemap').value = key; }
}

function initMap() {
  map = L.map('map', { maxZoom: 18 }).setView([49.6, 11.0], 8);
  for (const k of Object.keys(BASEMAPS)) getBase(k);
  switchBase(S.basemap, false);
  const ctrl = {};
  for (const [k, v] of Object.entries(BASEMAPS)) ctrl[v.name] = baseLayers[k];
  layerControl = L.control.layers(ctrl, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (e) => {
    const key = Object.keys(baseLayers).find(k => baseLayers[k] === e.layer);
    if (key) { activeBase = key; S.basemap = key; autoOsm = false; saveSettings(); $('#setBasemap').value = key; }
  });

  map.on('contextmenu', (e) => {
    const { lat, lng } = e.latlng;
    const div = document.createElement('div');
    div.innerHTML = `<div style="margin-bottom:.4rem">${fmt(lat, 4)}, ${fmt(lng, 4)}</div>`;
    const b = document.createElement('button');
    b.textContent = 'Als Standort setzen';
    b.onclick = async () => { map.closePopup(); setLocation(lat, lng, await reverseGeocode(lat, lng)); };
    div.appendChild(b);
    L.popup().setLatLng(e.latlng).setContent(div).openOn(map);
  });
}
function drawLocation() {
  if (!S.loc) return;
  const ll = [S.loc.lat, S.loc.lon];
  if (!marker) marker = L.marker(ll).addTo(map); else marker.setLatLng(ll);
  const r = S.radiusKm * 1000;
  if (!circle) circle = L.circle(ll, { radius: r, color: '#0b5cab', weight: 2, fillOpacity: 0.03, dashArray: '6 6' }).addTo(map);
  else { circle.setLatLng(ll); circle.setRadius(r); }
}
function fitToCircle() { if (circle) map.fitBounds(circle.getBounds(), { padding: [20, 20] }); }

function clearRadarLayers() {
  for (const l of radarLayers.values()) map.removeLayer(l);
  radarLayers.clear();
}
function setMode(m) {
  if (mode === m) return;
  mode = m; clearRadarLayers();
  const attr = map.attributionControl;
  const DWD_A = 'Radar: <a href="https://www.dwd.de/" target="_blank" rel="noopener">DWD</a>';
  const RV_A = 'Radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>';
  attr.removeAttribution(DWD_A); attr.removeAttribution(RV_A);
  attr.addAttribution(m === 'dwd' ? DWD_A : RV_A);
  $('#srcBadge').textContent = m === 'dwd' ? 'Quelle: DWD-Radar' : 'Quelle: RainViewer (außerhalb DWD-Gebiet)';
  // basemap.de deckt nur Deutschland ab
  if (m === 'rv' && activeBase !== 'osm') { autoOsm = true; switchBase('osm', false); toast('Außerhalb Deutschlands: Karte auf OpenStreetMap umgestellt.'); }
  if (m === 'dwd' && autoOsm) { autoOsm = false; switchBase(S.basemap, false); }
}

function makeLayer(f) {
  if (mode === 'dwd') {
    return L.tileLayer.wms(DWD_WMS, {
      layers: DWD_LAYER, format: 'image/png', transparent: true, version: '1.3.0',
      tileSize: 512, opacity: 0, zIndex: 10, time: new Date(f.t).toISOString()
    });
  }
  return L.tileLayer(`${rvHost}${f.key}/512/{z}/{x}/{y}/2/1_0.png`, {
    tileSize: 256, maxNativeZoom: 7, maxZoom: 19, opacity: 0, zIndex: 10
  });
}
function layerFor(i) {
  const f = frames[i];
  if (!radarLayers.has(f.key)) { const l = makeLayer(f); l.addTo(map); radarLayers.set(f.key, l); }
  return radarLayers.get(f.key);
}
function setFrames(list, nowIdx) {
  const keep = new Set(list.map(f => f.key));
  for (const [k, l] of radarLayers) if (!keep.has(k)) { map.removeLayer(l); radarLayers.delete(k); }
  frames = list; nowFrameIdx = nowIdx;
  $('#frameSlider').max = Math.max(0, frames.length - 1);
  if (!playTimer) showFrame(nowIdx);
}
function showFrame(i) {
  if (!frames.length) return;
  frameIdx = (i + frames.length) % frames.length;
  const cur = layerFor(frameIdx);
  layerFor((frameIdx + 1) % frames.length);
  for (const l of radarLayers.values()) l.setOpacity(l === cur ? S.opacity : 0);
  $('#frameSlider').value = frameIdx;
  const f = frames[frameIdx], ft = $('#frameTime');
  const diff = Math.round((f.t - frames[nowFrameIdx].t) / 60000);
  ft.textContent = diff > 0 ? `${hhmm(f.t)} · Prognose +${diff} min` : diff < 0 ? `${hhmm(f.t)} · ${diff} min` : `${hhmm(f.t)} · aktuell`;
  ft.classList.toggle('fc', diff > 0);
}
function togglePlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; $('#btnPlay').textContent = '▶'; showFrame(nowFrameIdx); return; }
  $('#btnPlay').textContent = '⏸';
  playTimer = setInterval(() => showFrame(frameIdx + 1), 600);
}

// ---------- DWD-Radar über Bright Sky ----------
async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function toUint16(bytes, littleEndian) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint16Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(i * 2, littleEndian);
  return out;
}
function plausibility(arr) { let bad = 0; for (let i = 0; i < arr.length; i++) if (arr[i] > 2500 && arr[i] < 65000) bad++; return bad; }

async function loadDwdRadar(lat, lon, radiusKm) {
  const now = Date.now();
  const params = new URLSearchParams({
    lat: lat.toFixed(4), lon: lon.toFixed(4),
    distance: String(Math.round(Math.max(radiusKm, 10) * 1000 + 2000)),
    date: new Date(now - 40 * 60000).toISOString(),
    last_date: new Date(now + 150 * 60000).toISOString(),
    format: 'DecompressionStream' in window ? 'compressed' : 'plain'
  });
  const d = await getJSON(`${BS}/radar?${params}`);
  const recs = (d.radar || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!recs.length) throw new Error('keine DWD-Radardaten für diesen Ort');

  let w, h, little = null;
  const out = [];
  for (const r of recs) {
    let data;
    const p = r.precipitation_5;
    if (Array.isArray(p)) {
      h = p.length; w = p[0].length; data = new Uint16Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = p[y][x] ?? 0;
    } else {
      const bytes = await inflate(p);
      if (little === null) little = plausibility(toUint16(bytes, true)) <= plausibility(toUint16(bytes, false));
      data = toUint16(bytes, little);
      if (d.bbox) { h = d.bbox[2] - d.bbox[0] + 1; w = d.bbox[3] - d.bbox[1] + 1; }
      else { w = h = Math.round(Math.sqrt(data.length)); }
    }
    if (data.length !== w * h) throw new Error('unerwartetes Radar-Gitter');
    out.push({ t: new Date(r.timestamp).getTime(), data });
  }
  let px = (w - 1) / 2, py = (h - 1) / 2;
  const lp = d.latlon_position;
  if (lp && typeof lp.x === 'number') {
    px = lp.x; py = lp.y;
    if (d.bbox && (px >= w || py >= h)) { px -= d.bbox[1]; py -= d.bbox[0]; }
  }
  if (px < 0 || py < 0 || px >= w || py >= h) throw new Error('Standort außerhalb des DWD-Radargebiets');
  return { frames: out, w, h, px, py };
}

function analyzeDwd(R, lat, lon) {
  const s = SENS[S.sensitivity] || SENS[2];
  const rKm = S.radiusKm, { w, h, px, py } = R;
  const cx = Math.round(px), cy = Math.round(py);
  const rot = lon - 10; // Gitternord vs. geogr. Nord (polarstereografisch, Zentralmeridian 10° O)
  const valid = (v) => v < 2500;

  const stats = R.frames.map(f => {
    let count = 0, minD = Infinity, minB = null, maxV = 0, locMax = 0;
    const y0 = Math.max(0, Math.floor(py - rKm)), y1 = Math.min(h - 1, Math.ceil(py + rKm));
    const x0 = Math.max(0, Math.floor(px - rKm)), x1 = Math.min(w - 1, Math.ceil(px + rKm));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - px, dy = py - y, dist = Math.hypot(dx, dy);
        if (dist > rKm) continue;
        const v = f.data[y * w + x];
        if (!valid(v)) continue;
        if (dist <= LOC_RADIUS_KM && v > locMax) locMax = v;
        if (v >= s.raw) {
          count++;
          if (v > maxV) maxV = v;
          if (dist < minD) { minD = dist; minB = (Math.atan2(dx, dy) * 180 / Math.PI + rot + 360) % 360; }
        }
      }
    }
    const c = f.data[cy * w + cx];
    return { t: f.t, count, minD: isFinite(minD) ? minD : null, minB, maxV, locMax, center: valid(c) ? c : 0 };
  });

  const now = Date.now();
  let nowIdx = 0;
  stats.forEach((st, i) => { if (st.t <= now + 60000) nowIdx = i; });
  const cur = stats[nowIdx];
  const hasRain = cur.count >= s.minKm2;
  const atLoc = cur.locMax >= s.raw;

  let eta = null;
  if (!atLoc) {
    for (let i = nowIdx + 1; i < stats.length; i++) {
      if (stats[i].locMax >= s.raw) { eta = Math.max(0, Math.round((stats[i].t - now) / 60000)); break; }
    }
  }
  const findAt = (target) => stats.reduce((b, st) => Math.abs(st.t - target) < Math.abs(b.t - target) ? st : b, stats[0]);
  const past = findAt(cur.t - 30 * 60000);
  const fut = findAt(cur.t + 30 * 60000);

  let trend = 'kein Regen', approaching = false;
  if (atLoc) { trend = 'Regen am Standort'; approaching = true; }
  else if (hasRain && cur.minD != null) {
    const dPast = past !== cur && past.minD != null ? past.minD - cur.minD : null;
    const dFut = fut !== cur && fut.minD != null ? cur.minD - fut.minD : null;
    if (eta != null) { trend = 'zieht heran'; approaching = true; }
    else if ((dFut ?? 0) > 2 || (dPast ?? 0) > 2) { trend = 'nähert sich'; approaching = true; }
    else if ((dFut ?? 0) < -2 || (dPast ?? 0) < -2) trend = 'entfernt sich';
    else trend = 'kaum Bewegung';
    if (dPast != null && dPast > 2) trend += ` (~${fmt(dPast * 2, 0)} km/h)`;
  } else if (eta != null) { trend = 'Regen entsteht / zieht heran'; approaching = true; }
  else if (past.count >= s.minKm2) trend = 'abgezogen';

  const bars = [];
  for (let i = nowIdx; i < stats.length && bars.length < 8; i += 3) {
    let sum = 0; for (let k = i; k < Math.min(i + 3, stats.length); k++) sum += stats[k].center;
    bars.push({ t: stats[i].t, mm: sum / 100 });
  }
  const total2h = bars.reduce((a, b) => a + b.mm, 0);

  return {
    stats, nowIdx, cur, hasRain, atLoc, eta, trend, approaching, bars, total2h,
    areaKm2: cur.count, coverage: cur.count / (Math.PI * rKm * rKm),
    maxMmh: cur.maxV * 0.12, minD: cur.minD, minB: cur.minB, sens: s
  };
}

// ---------- RainViewer-Fallback ----------
async function loadRvFrames() {
  const d = await getJSON('https://api.rainviewer.com/public/weather-maps.json');
  rvHost = d.host;
  return (d.radar?.past || []).map(f => ({ t: f.time * 1000, key: f.path }));
}
function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Radar-Kachel nicht ladbar')); i.src = url; });
}
async function analyzeRv(frame, lat, lon) {
  const rKm = S.radiusKm, z = 7, n = 128;
  const tx = (lo) => (lo + 180) / 360 * n;
  const ty = (la) => { const r = rad(la); return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
  const dLat = rKm / 111.32, dLon = rKm / (111.32 * Math.cos(rad(lat)));
  const gx0 = tx(lon - dLon), gx1 = tx(lon + dLon), gy0 = ty(lat + dLat), gy1 = ty(lat - dLat);
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  let rain = 0, total = 0, minD = Infinity, minB = null, locRain = false;
  for (let x = Math.floor(gx0); x <= Math.floor(gx1); x++) for (let y = Math.floor(gy0); y <= Math.floor(gy1); y++) {
    const img = await loadImage(`${rvHost}${frame.key}/512/${z}/${((x % n) + n) % n}/${y}/2/0_0.png`);
    const W = img.naturalWidth, H = img.naturalHeight; cv.width = W; cv.height = H; ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let py = Math.max(0, Math.floor((gy0 - y) * H)); py <= Math.min(H - 1, Math.ceil((gy1 - y) * H)); py++) {
      const plat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + (py + .5) / H) / n))) * 180 / Math.PI;
      for (let px = Math.max(0, Math.floor((gx0 - x) * W)); px <= Math.min(W - 1, Math.ceil((gx1 - x) * W)); px++) {
        const plon = (x + (px + .5) / W) / n * 360 - 180, d = distKm(lat, lon, plat, plon);
        if (d > rKm) continue; total++;
        if (data[(py * W + px) * 4 + 3] > 20) { rain++; if (d <= LOC_RADIUS_KM) locRain = true; if (d < minD) { minD = d; minB = bearing(lat, lon, plat, plon); } }
      }
    }
  }
  const area = total ? rain * Math.PI * rKm * rKm / total : 0;
  return { t: frame.t, areaKm2: area, minD: isFinite(minD) ? minD : null, minB, locRain };
}
async function rvAnalysis(list, lat, lon) {
  const s = SENS[S.sensitivity] || SENS[2];
  const cur = await analyzeRv(list[list.length - 1], lat, lon);
  const pf = [...list].reverse().find(f => cur.t - f.t >= 30 * 60000);
  const past = pf ? await analyzeRv(pf, lat, lon) : null;
  const hasRain = cur.areaKm2 >= s.minKm2;
  let trend = hasRain ? 'kaum Bewegung' : 'kein Regen', approaching = false;
  if (cur.locRain) { trend = 'Regen am Standort'; approaching = true; }
  else if (hasRain && past?.minD != null && cur.minD != null) {
    const dd = past.minD - cur.minD;
    if (dd > 2) { trend = `nähert sich (~${fmt(dd * 2, 0)} km/h)`; approaching = true; } else if (dd < -2) trend = 'entfernt sich';
  }
  return {
    hasRain, atLoc: cur.locRain, eta: null, trend, approaching, bars: null,
    areaKm2: cur.areaKm2, coverage: cur.areaKm2 / (Math.PI * S.radiusKm ** 2), maxMmh: null,
    minD: cur.minD, minB: cur.minB, cur: { t: cur.t }, sens: s
  };
}

// ---------- Wetter ----------
const BS_ICON = {
  'clear-day': '☀️', 'clear-night': '🌙', 'partly-cloudy-day': '⛅', 'partly-cloudy-night': '☁️',
  cloudy: '☁️', fog: '🌫️', wind: '💨', rain: '🌧️', sleet: '🌨️', snow: '❄️', hail: '🌨️', thunderstorm: '⛈️'
};
const BS_COND = { fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
const BS_ICON_TXT = {
  'clear-day': 'Klar', 'clear-night': 'Klar', 'partly-cloudy-day': 'Teilweise bewölkt', 'partly-cloudy-night': 'Teilweise bewölkt',
  cloudy: 'Bewölkt', fog: 'Nebel', wind: 'Windig', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter'
};

async function loadWeatherBrightSky(lat, lon) {
  const q = `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`;
  const today = localDate(), tomorrow = localDate(new Date(Date.now() + 86400000));
  const [cw, hw] = await Promise.all([
    getJSON(`${BS}/current_weather?${q}`),
    getJSON(`${BS}/weather?${q}&date=${today}&last_date=${tomorrow}`).catch(() => null)
  ]);
  const c = cw.weather, src = cw.sources?.[0];
  const w = {
    temp: c.temperature, icon: BS_ICON[c.icon] || '❔',
    desc: BS_COND[c.condition] || BS_ICON_TXT[c.icon] || 'trocken',
    precip: c.precipitation_60 ?? c.precipitation_30 ?? c.precipitation_10,
    hum: c.relative_humidity, wind: c.wind_speed_10 ?? c.wind_speed_30 ?? c.wind_speed_60,
    windDir: c.wind_direction_10 ?? c.wind_direction_30 ?? c.wind_direction_60,
    gust: c.wind_gust_speed_10 ?? c.wind_gust_speed_30 ?? c.wind_gust_speed_60,
    cloud: c.cloud_cover, press: c.pressure_msl, time: new Date(c.timestamp).getTime(),
    station: src ? `DWD-Station ${src.station_name}${src.distance != null ? ` (${fmt(src.distance / 1000, 0)} km)` : ''}` : 'DWD'
  };
  if (hw?.weather?.length) {
    const nowMs = Date.now();
    const todays = hw.weather.filter(x => x.timestamp.startsWith(today));
    const temps = todays.map(x => x.temperature).filter(v => v != null);
    if (temps.length) { w.tmin = Math.min(...temps); w.tmax = Math.max(...temps); }
    const pops = todays.filter(x => new Date(x.timestamp).getTime() >= nowMs - 3600000).map(x => x.precipitation_probability).filter(v => v != null);
    if (pops.length) w.pop = Math.max(...pops);
  }
  return w;
}

const WMO = { 0: ['Klar', '☀️'], 1: ['Überwiegend klar', '🌤️'], 2: ['Teilweise bewölkt', '⛅'], 3: ['Bedeckt', '☁️'], 45: ['Nebel', '🌫️'], 48: ['Nebel', '🌫️'],
  51: ['Nieselregen', '🌦️'], 53: ['Nieselregen', '🌦️'], 55: ['Nieselregen', '🌧️'], 61: ['Leichter Regen', '🌦️'], 63: ['Regen', '🌧️'], 65: ['Starker Regen', '🌧️'],
  71: ['Schnee', '🌨️'], 73: ['Schnee', '🌨️'], 75: ['Starker Schnee', '❄️'], 80: ['Regenschauer', '🌦️'], 81: ['Regenschauer', '🌧️'], 82: ['Heftige Schauer', '⛈️'],
  95: ['Gewitter', '⛈️'], 96: ['Gewitter mit Hagel', '⛈️'], 99: ['Gewitter mit Hagel', '⛈️'] };
async function loadWeatherOpenMeteo(lat, lon) {
  const d = await getJSON('https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&timeformat=unixtime&forecast_days=1');
  const c = d.current, [desc, icon] = WMO[c.weather_code] || ['–', '❔'];
  return {
    temp: c.temperature_2m, icon, desc, precip: c.precipitation, hum: c.relative_humidity_2m,
    wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m, cloud: c.cloud_cover,
    press: c.pressure_msl, time: c.time * 1000, station: 'Open-Meteo (Modell)',
    tmin: d.daily?.temperature_2m_min?.[0], tmax: d.daily?.temperature_2m_max?.[0], pop: d.daily?.precipitation_probability_max?.[0]
  };
}
async function loadWeather(lat, lon) {
  try { return await loadWeatherBrightSky(lat, lon); }
  catch { return loadWeatherOpenMeteo(lat, lon); }
}
function renderWeather(w) {
  $('#wxIcon').textContent = w.icon;
  $('#wxTemp').textContent = `${fmt(w.temp)} °C`;
  $('#wxDesc').textContent = w.desc;
  $('#wxStation').textContent = `${w.station} · Stand ${hhmm(w.time)}`;
  $('#wxPrecip').textContent = w.precip == null ? '–' : `${fmt(w.precip)} mm`;
  $('#wxHum').textContent = w.hum == null ? '–' : `${fmt(w.hum, 0)} %`;
  $('#wxWind').textContent = w.wind == null ? '–' : `${fmt(w.wind, 0)} km/h ${dirName(w.windDir)}`;
  $('#wxGust').textContent = w.gust == null ? '–' : `${fmt(w.gust, 0)} km/h`;
  $('#wxCloud').textContent = w.cloud == null ? '–' : `${fmt(w.cloud, 0)} %`;
  $('#wxPress').textContent = w.press == null ? '–' : `${fmt(w.press, 0)} hPa`;
  $('#wxMinMax').textContent = w.tmin == null ? '–' : `${fmt(w.tmin)} / ${fmt(w.tmax)} °C`;
  $('#wxPop').textContent = w.pop == null ? '–' : `${fmt(w.pop, 0)} %`;
}

// ---------- Amtliche DWD-Warnungen ----------
async function loadAlerts(lat, lon) {
  const d = await getJSON(`${BS}/alerts?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`);
  return d.alerts || [];
}
function renderAlerts(list) {
  const box = $('#dwdAlerts'); box.innerHTML = '';
  const fmtDT = (s) => s ? new Date(s).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  for (const a of list) {
    const div = document.createElement('div');
    div.className = `dwd-alert ${a.severity || 'minor'}`;
    div.innerHTML = `<b>⚠️ ${esc(a.headline_de || a.event_de)}</b>`
      + `<span class="small">${esc(fmtDT(a.onset))}${a.expires ? ' – ' + esc(fmtDT(a.expires)) : ''} · antippen für Details</span>`
      + `<div class="details small">${esc(a.description_de)}${a.instruction_de ? '\n\n' + esc(a.instruction_de) : ''}</div>`;
    div.onclick = () => div.classList.toggle('open');
    box.appendChild(div);
  }
}
async function notifyAlerts(list) {
  if (!S.alertNotify) return;
  let seen; try { seen = JSON.parse(localStorage.getItem(LS_ALERTS) || '[]'); } catch { seen = []; }
  for (const a of list) {
    const id = a.alert_id || a.id;
    if (!id || seen.includes(id)) continue;
    if (await notify(`⚠️ ${a.headline_de || a.event_de}`, a.description_de || '', `dwd-${id}`)) seen.push(id);
  }
  localStorage.setItem(LS_ALERTS, JSON.stringify(seen.slice(-50)));
}

// ---------- Geocoding ----------
async function reverseGeocode(lat, lon) {
  try {
    const d = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=de`);
    const a = d.address || {};
    const name = a.city || a.town || a.village || a.municipality || a.suburb || a.county || d.name;
    return { name: name || `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: [a.state, a.country].filter(Boolean).join(', ') };
  } catch { return { name: `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: '' }; }
}
function parseCoords(q) {
  let m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) m = q.match(/^\s*(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  return (Math.abs(lat) > 90 || Math.abs(lon) > 180) ? null : { lat, lon };
}
async function doSearch() {
  const q = $('#searchInput').value.trim(), ul = $('#searchResults'); ul.innerHTML = '';
  if (!q) return;
  const c = parseCoords(q);
  if (c) { $('#dlgSearch').close(); setLocation(c.lat, c.lon, await reverseGeocode(c.lat, c.lon)); return; }
  try {
    const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=de&format=json`);
    if (!d.results?.length) { ul.innerHTML = '<li class="muted small">Nichts gefunden.</li>'; return; }
    for (const r of d.results) {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<b>${esc(r.name)}</b><br><span class="small muted">${esc([r.postcodes?.[0], r.admin1, r.country].filter(Boolean).join(', '))}</span>`;
      b.onclick = () => { $('#dlgSearch').close(); setLocation(r.latitude, r.longitude, { name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', ') }); };
      li.appendChild(b); ul.appendChild(li);
    }
  } catch (e) { ul.innerHTML = `<li class="muted small">Suche fehlgeschlagen: ${esc(e.message)}</li>`; }
}
function openSearch() { $('#searchResults').innerHTML = ''; $('#dlgSearch').showModal(); $('#searchInput').focus(); }

function locate() {
  if (!('geolocation' in navigator)) { toast('Standortermittlung nicht verfügbar – bitte Ort suchen.'); openSearch(); return; }
  if (!S.loc) setAlert('neutral', '📡', 'Ermittle Standort …', '');
  navigator.geolocation.getCurrentPosition(async (p) => {
    const { latitude: lat, longitude: lon } = p.coords;
    setLocation(lat, lon, await reverseGeocode(lat, lon));
  }, (err) => {
    if (S.loc) { toast(`Standort nicht ermittelbar (${err.message}) – verwende „${S.loc.name}“.`, 5000); return; }
    toast(`Standort nicht ermittelbar (${err.message}). Bitte Ort manuell eingeben.`, 5000);
    setAlert('neutral', '📍', 'Kein Standort', 'Bitte Standort ermitteln oder Ort suchen.');
    openSearch();
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60000 });
}
function setLocation(lat, lon, info) {
  S.loc = { lat, lon, name: info?.name || `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: info?.sub || '' };
  saveSettings(); renderLocation(); drawLocation(); fitToCircle(); runCheck();
}
function renderLocation() {
  $('#locName').textContent = S.loc ? S.loc.name : 'Kein Standort';
  $('#locSub').textContent = S.loc ? (S.loc.sub || `${fmt(S.loc.lat, 3)}, ${fmt(S.loc.lon, 3)}`) : 'Standort ermitteln oder suchen';
}

// ---------- Prüfung & Warnung ----------
function setAlert(cls, icon, title, text) {
  $('#alert').className = `alert ${cls}`;
  $('#alertIcon').textContent = icon; $('#alertTitle').textContent = title; $('#alertText').textContent = text;
}

let checking = false, pending = false, lastAlert = false;
async function runCheck() {
  if (!S.loc) return;
  if (checking) { pending = true; return; }
  checking = true; $('#btnRefresh').textContent = '⏳';
  const { lat, lon } = S.loc;
  let an = null, radarErr = null;
  try {
    const wxP = loadWeather(lat, lon).then(renderWeather).catch(e => toast('Wetterdaten nicht abrufbar: ' + e.message));
    const alP = loadAlerts(lat, lon).then(a => { renderAlerts(a); notifyAlerts(a); }).catch(() => renderAlerts([]));
    try {
      const R = await loadDwdRadar(lat, lon, S.radiusKm);
      setMode('dwd');
      an = analyzeDwd(R, lat, lon);
      setFrames(R.frames.map(f => ({ t: f.t, key: String(f.t) })), an.nowIdx);
    } catch (dwdErr) {
      console.warn('DWD-Radar nicht verfügbar:', dwdErr);
      try {
        const list = await loadRvFrames();
        setMode('rv');
        setFrames(list, list.length - 1);
        an = await rvAnalysis(list, lat, lon);
        an.note = `DWD-Radar nicht verfügbar (${dwdErr.message}) – RainViewer ohne Vorhersage.`;
      } catch (e) { radarErr = e; }
    }
    await Promise.allSettled([wxP, alP]);
  } finally {
    checking = false; $('#btnRefresh').textContent = '↻';
  }
  evaluate(an, radarErr);
  if (pending) { pending = false; runCheck(); }
}

function renderBars(an) {
  const box = $('#nowcast'); box.innerHTML = '';
  if (!an?.bars) { $('#nowcastInfo').textContent = 'Keine Vorhersage verfügbar (nur mit DWD-Radar).'; return; }
  const max = Math.max(0.5, ...an.bars.map(b => b.mm));
  for (const b of an.bars) {
    const el = document.createElement('div'); el.className = 'bar';
    el.innerHTML = `<div class="val">${b.mm > 0 ? fmt(b.mm) : ''}</div>`
      + `<div class="fill ${b.mm > 0 ? '' : 'zero'}" style="height:${Math.max(2, b.mm / max * 70)}px"></div>`
      + `<div class="lbl">${hhmm(b.t)}</div>`;
    box.appendChild(el);
  }
  $('#nowcastInfo').textContent = `DWD-Radar inkl. Vorhersage · 15-Minuten-Summen · gesamt ${fmt(an.total2h)} mm`;
}

function evaluate(an, radarErr) {
  $('#anRadius').textContent = `${fmt(S.radiusKm, 0)} km`;
  renderBars(an);
  const checked = `Geprüft ${hhmm(Date.now())} · nächste Prüfung in ${S.intervalMin} min`;
  if (!an) {
    ['#anCover', '#anDist', '#anTrend', '#anMax', '#anEta'].forEach(s => ($(s).textContent = '–'));
    $('#anInfo').textContent = radarErr ? `Radar nicht abrufbar: ${radarErr.message}` : '';
    setAlert('neutral', '⚠️', 'Radar derzeit nicht verfügbar', checked);
    return;
  }
  $('#anCover').textContent = `${fmt(an.coverage * 100)} % (${fmt(an.areaKm2, 0)} km²)`;
  $('#anDist').textContent = an.minD != null ? `${fmt(an.minD)} km ${dirName(an.minB)}` : '–';
  $('#anTrend').textContent = an.trend;
  $('#anMax').textContent = an.maxMmh ? `${fmt(an.maxMmh)} mm/h` : '–';
  $('#anEta').textContent = an.atLoc ? 'jetzt' : an.eta != null ? `in ~${an.eta} min (${hhmm(Date.now() + an.eta * 60000)})` : (an.bars ? 'nicht in 2 h' : '–');
  $('#anInfo').textContent = an.note || `Radarbild ${hhmm(an.cur.t)} · Schwelle ${fmt(an.sens.mmh)} mm/h, min. ${an.sens.minKm2} km² Regenfläche.`;

  const etaRelevant = an.eta != null && S.leadMin > 0 && an.eta <= S.leadMin;
  const alert = an.atLoc || an.hasRain || etaRelevant;
  if (!alert) {
    const hint = an.eta != null ? ` · Regen laut Vorhersage in ~${an.eta} min` : '';
    setAlert('ok', '✅', `Kein Regen im Umkreis von ${fmt(S.radiusKm, 0)} km`, checked + hint);
    lastAlert = false; return;
  }
  let title, cls = 'warn';
  const parts = [];
  if (an.atLoc) { title = 'Es regnet am Standort'; cls = 'danger'; }
  else if (etaRelevant) { title = `Regen erreicht dich in ca. ${an.eta} min`; cls = 'danger'; }
  else { title = `Regen im Umkreis von ${fmt(S.radiusKm, 0)} km`; if (an.approaching) cls = 'danger'; }
  if (an.minD != null && !an.atLoc) parts.push(`nächster Regen ${fmt(an.minD)} km ${dirName(an.minB)}`);
  if (an.trend && !an.atLoc) parts.push(an.trend);
  if (an.maxMmh) parts.push(`bis ${fmt(an.maxMmh)} mm/h`);
  if (an.bars && an.total2h > 0) parts.push(`${fmt(an.total2h)} mm in 2 h am Standort`);
  setAlert(cls, '🌧️', title, parts.join(' · ') + ' — ' + checked);
  maybeNotify(title, parts.join('\n'));
  lastAlert = true;
}

async function maybeNotify(title, body) {
  const last = Number(localStorage.getItem(LS_NOTIFIED) || 0);
  if (lastAlert && Date.now() - last < RENOTIFY_MIN * 60000) return;
  if (await notify(`🌧️ ${title}`, body, 'regenradar')) localStorage.setItem(LS_NOTIFIED, String(Date.now()));
  navigator.vibrate?.([200, 100, 200]);
}
async function notify(title, body, tag) {
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag, renotify: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch { /* Fallback */ }
  try { new Notification(title, opts); return true; } catch { return false; }
}

// ---------- Timer ----------
let checkTimer = null;
function schedule() { clearInterval(checkTimer); checkTimer = setInterval(runCheck, S.intervalMin * 60000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runCheck(); });

// ---------- Einstellungen ----------
function initSettings() {
  const r = $('#setRadius'), ro = $('#radiusOut');
  r.value = S.radiusKm; ro.textContent = S.radiusKm;
  r.oninput = () => { ro.textContent = r.value; S.radiusKm = Number(r.value); drawLocation(); };
  r.onchange = () => { saveSettings(); fitToCircle(); runCheck(); };
  const bind = (sel, key, conv, after) => {
    const el = $(sel);
    if (el.type === 'checkbox') el.checked = S[key]; else el.value = String(S[key]);
    el.onchange = () => { S[key] = el.type === 'checkbox' ? el.checked : conv(el.value); saveSettings(); after?.(); };
  };
  bind('#setLead', 'leadMin', Number, runCheck);
  bind('#setSensitivity', 'sensitivity', Number, runCheck);
  bind('#setInterval', 'intervalMin', Number, schedule);
  bind('#setAuto', 'autoLocate');
  bind('#setAlertNotify', 'alertNotify');
  $('#setBasemap').value = S.basemap;
  $('#setBasemap').onchange = (e) => switchBase(e.target.value, true);
  $('#setOpacity').value = S.opacity;
  $('#setOpacity').oninput = (e) => { S.opacity = Number(e.target.value); saveSettings(); showFrame(frameIdx); };
  $('#setNotify').checked = S.notify;
  $('#setNotify').onchange = async (e) => {
    if (e.target.checked) {
      if (!('Notification' in window)) { toast('Benachrichtigungen werden nicht unterstützt.'); e.target.checked = false; return; }
      if (await Notification.requestPermission() !== 'granted') { toast('Benachrichtigungen wurden nicht erlaubt.'); e.target.checked = false; return; }
    }
    S.notify = e.target.checked; saveSettings();
  };
  $('#btnTestNotify').onclick = async () => {
    if (!(await notify('🌧️ Test: Regen erreicht dich in ca. 20 min', 'So sieht eine Regenwarnung aus.', 'test')))
      toast('Benachrichtigungen erst oben aktivieren und erlauben.');
  };
}

// ---------- Start ----------
function init() {
  $('#bkgYear').textContent = `(${BKG_YEAR})`;
  initSettings(); initMap(); renderLocation();
  $('#btnLocate').onclick = locate;
  $('#btnSearch').onclick = openSearch;
  $('#btnRefresh').onclick = runCheck;
  $('#btnSettings').onclick = () => $('#dlgSettings').showModal();
  $('#btnCloseSearch').onclick = () => $('#dlgSearch').close();
  $('#searchForm').onsubmit = (e) => { e.preventDefault(); doSearch(); };
  $('#btnPlay').onclick = togglePlay;
  $('#btnPrev').onclick = () => showFrame(frameIdx - 1);
  $('#btnNext').onclick = () => showFrame(frameIdx + 1);
  $('#btnNow').onclick = () => { if (playTimer) togglePlay(); else showFrame(nowFrameIdx); };
  $('#frameSlider').oninput = (e) => showFrame(Number(e.target.value));

  if (S.loc) { drawLocation(); fitToCircle(); runCheck(); }
  if (S.autoLocate || !S.loc) locate();
  schedule();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
