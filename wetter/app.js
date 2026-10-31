/* Wetter-App (PWA) – Version 3.4
 * Startseite:  Abschnitte ein-/ausblenden und sortieren (Assistent beim Erststart bzw. nach Update, Einstellungen)
 * Warnungen:   Bright Sky /alerts – nur sichtbar, wenn es Warnungen gibt
 * Aktuell:     Bright Sky /current_weather – nächste oder gewählte DWD-Station
 * Nowcast:     Bright Sky /radar (DWD RV inkl. 2-h-Vorhersage) – Regenhinweis + 5-Minuten-Diagramm
 * Text:        Tagesprognose in Worten + Winterhinweise (Schneefallgrenze, Glätte) aus DWD ICON-D2
 * Verlauf:     12 h … 10 Tage; Modelle DWD (ICON-D2, ICON-EU, ICON, MOSMIX) und ECMWF (IFS, AIFS)
 *              Temperatur, gefühlte Temperatur, Taupunkt, Niederschlag, Regenwahrscheinlichkeit, Wind, Sonne
 * Tage:        10-Tage-Übersicht aus DWD MOSMIX
 * Karte:       DWD-Radar als Animation (−1 h bis +2 h), EUMETSAT-Satellit, Windy
 * Pollen:      DWD Pollenflug-Gefahrenindex, außerhalb DE Open-Meteo/CAMS
 */
'use strict';
const APP_VERSION = '3.17.0';
const WIZARD_VERSION = '3.11';

// ---------- Endpunkte ----------
const BS = 'https://api.brightsky.dev';
const OM = 'https://api.open-meteo.com/v1/forecast';
const OM_META = 'https://api.open-meteo.com/data';
const OM_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const DWD_POLLEN = 'https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json';
const DWD_WMS = 'https://maps.dwd.de/geoserver/dwd/wms';
const DWD_RADAR = 'dwd:Niederschlagsradar';
const DWD_RADAR_CAPS = 'https://maps.dwd.de/geoserver/dwd/Niederschlagsradar/ows?service=WMS&version=1.3.0&request=GetCapabilities';
const SAT_WMS = 'https://view.eumetsat.int/geoserver/wms';
const SAT_DEFAULT = { day: 'mtg_fd:rgb_truecolour', night: 'mtg_fd:ir105_hrfi' };
const BKG_WMS = 'https://sgx.geodatenzentrum.de/wms_basemapde';
const YEAR = new Date().getFullYear();
const BKG_ATTR = `© GeoBasis-DE / <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">BKG</a> (${YEAR}) <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>`;
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const LS = 'wetterapp.settings.v3', LS_RAIN = 'wetterapp.rainNotified', LS_WARN = 'wetterapp.warnNotified', LS_SAT = 'wetterapp.satLayers';

// ---------- Abschnitte der Startseite ----------
const SECTIONS = [
  { id: 'warnings', name: 'Wetterwarnungen', sub: 'nur sichtbar, wenn der DWD warnt', icon: 'warn' },
  { id: 'now', name: 'Aktuelle Werte', sub: 'Station, Sonnenauf-/-untergang', icon: 'thermo' },
  { id: 'nowcast', name: 'Regen in 2 Stunden', sub: '5-Minuten-Vorhersage aus dem DWD-Radar', icon: 'bars' },
  { id: 'daytext', name: 'Textprognose', sub: 'Tagesvorhersage in Worten, im Winter Glätte', icon: 'text' },
  { id: 'chart', name: 'Vorhersagediagramm', sub: '12 h bis 10 Tage, Modell wählbar', icon: 'chart' },
  { id: 'days', name: '10-Tage-Übersicht', sub: 'Tageswerte als Liste', icon: 'calendar' },
  { id: 'map', name: 'Karte', sub: 'Radar-Animation, Satellit, Wind', icon: 'map' },
  { id: 'pollen', name: 'Pollenflug', sub: 'DWD-Gefahrenindex', icon: 'flower' }
];
const NEW_IN_VERSION = ['nowcast', 'days'];

// ---------- Zeiträume ----------
const RANGES = [
  { h: 12, label: '12 h', title: 'Die nächsten 12 Stunden' },
  { h: 48, label: '2 Tage', title: 'Die nächsten 2 Tage' },
  { h: 72, label: '3 Tage', title: 'Die nächsten 3 Tage' },
  { h: 120, label: '5 Tage', title: 'Die nächsten 5 Tage' },
  { h: 168, label: '7 Tage', title: 'Die nächsten 7 Tage' },
  { h: 240, label: '10 Tage', title: 'Die nächsten 10 Tage' }
];

// ---------- Modelle (nur DWD und ECMWF) ----------
const MODELS = [
  { key: 'icon_d2', src: 'om', group: 'DWD', name: 'DWD ICON-D2 (2 km)', maxH: 48, meta: 'dwd_icon_d2', info: 'DWD-Regionalmodell, 2,2 km · alle 3 h neu · bis +48 h' },
  { key: 'icon_eu', src: 'om', group: 'DWD', name: 'DWD ICON-EU (7 km)', maxH: 120, meta: 'dwd_icon_eu', info: 'DWD-Europamodell, ca. 7 km · alle 3 h neu · bis +5 Tage' },
  { key: 'icon_seamless', src: 'om', group: 'DWD', name: 'DWD ICON kombiniert', maxH: 180, meta: 'dwd_icon_d2', info: 'DWD · ICON-D2 → ICON-EU → ICON global · bis ca. 7 Tage' },
  { key: 'mosmix', src: 'bs', group: 'DWD', name: 'DWD MOSMIX', maxH: 240, info: 'DWD · an Messstationen statistisch korrigierte Punktvorhersage · bis 10 Tage' },
  { key: 'ecmwf_ifs025', src: 'om', group: 'ECMWF', name: 'ECMWF IFS', maxH: 360, meta: 'ecmwf_ifs025', info: 'ECMWF · globales Referenzmodell · bis 15 Tage' },
  { key: 'ecmwf_aifs025', src: 'om', group: 'ECMWF', name: 'ECMWF AIFS (KI-Modell)', maxH: 360, meta: 'ecmwf_aifs025_single', info: 'ECMWF · KI-basiertes Modell · bis 15 Tage' }
];
const MOSMIX = MODELS.find(m => m.key === 'mosmix');

// ---------- Pollen ----------
const POLLEN = [
  { k: 'Hasel', name: 'Hasel' }, { k: 'Erle', name: 'Erle', om: 'alder_pollen' }, { k: 'Esche', name: 'Esche' },
  { k: 'Birke', name: 'Birke', om: 'birch_pollen' }, { k: 'Graeser', name: 'Gräser', om: 'grass_pollen' },
  { k: 'Roggen', name: 'Roggen' }, { k: 'Beifuss', name: 'Beifuß', om: 'mugwort_pollen' }, { k: 'Ambrosia', name: 'Ambrosia', om: 'ragweed_pollen' }
];
const POLLEN_REGIONS = [
  [11, 'Inseln und Marschen', 54.4, 8.8], [12, 'Geest, Schleswig-Holstein und Hamburg', 54.1, 9.8], [20, 'Mecklenburg-Vorpommern', 53.8, 12.6],
  [31, 'Westl. Niedersachsen/Bremen', 52.8, 7.8], [32, 'Östl. Niedersachsen', 52.6, 10.3], [41, 'Rhein.-Westfäl. Tiefland', 51.6, 7.0],
  [42, 'Ostwestfalen', 51.9, 8.8], [43, 'Mittelgebirge NRW', 51.0, 7.9], [50, 'Brandenburg und Berlin', 52.4, 13.4],
  [61, 'Tiefland Sachsen-Anhalt', 52.2, 11.8], [62, 'Harz', 51.7, 10.8], [71, 'Tiefland Thüringen', 51.2, 11.0],
  [72, 'Mittelgebirge Thüringen', 50.6, 10.9], [81, 'Tiefland Sachsen', 51.3, 13.3], [82, 'Mittelgebirge Sachsen', 50.6, 13.0],
  [91, 'Nordhessen und hess. Mittelgebirge', 50.9, 9.4], [92, 'Rhein-Main', 50.0, 8.6], [101, 'Rhein, Pfalz, Nahe und Mosel', 49.8, 7.6],
  [102, 'Mittelgebirgsbereich Rheinland-Pfalz', 50.4, 7.4], [103, 'Saarland', 49.4, 6.95], [111, 'Oberrhein und unteres Neckartal', 48.7, 8.1],
  [112, 'Hohenlohe/mittlerer Neckar/Oberschwaben', 48.6, 9.6], [113, 'Mittelgebirge Baden-Württemberg', 48.1, 8.4],
  [121, 'Allgäu/Oberbayern/Bay. Wald', 47.8, 11.6], [122, 'Donauniederungen', 48.6, 11.9],
  [123, 'Bayern nördl. der Donau, o. Bayr. Wald, o. Mainfranken', 49.65, 11.55], [124, 'Mainfranken', 49.85, 9.75]
];
const PSTEP = { '-1': null, '0': 0, '0-1': 0.5, '1': 1, '1-2': 1.5, '2': 2, '2-3': 2.5, '3': 3 };
const PTXT = ['keine', 'keine bis gering', 'gering', 'gering bis mittel', 'mittel', 'mittel bis hoch', 'hoch'];
const PCOL = ['#c8e6c9', '#e6ee9c', '#fff176', '#ffd54f', '#ffb74d', '#ff8a65', '#e53935'];

const DEFAULTS = {
  loc: null, station: null, favs: [], basemap: 'bm_grau', sat: 'auto', satDay: '', satNight: '', intervalMin: 10,
  notify: false, warnNotify: true, autoLocate: true, mapMode: 'radar', model: 'icon_d2', rangeH: 12,
  pollen: POLLEN.map(p => p.k), pollenRegion: 'auto', pollenHideZero: false,
  showFeels: true, showDew: true, layout: null, layoutSeen: [], wizardFor: null, theme: 'system', scene: true, glass: 84,
  rainRadius: 10, rainMin: 'all', stormNotify: false, stormRadius: 50,
  dailyEve: false, dailyEveTime: '20:00', dailyMorn: false, dailyMornTime: '06:30', dailyPlace: 'gps', gpsLoc: null
};
let S = (() => {
  try { const s = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS) || '{}')); s.favs = Array.isArray(s.favs) ? s.favs : []; return s; }
  catch { return { ...DEFAULTS, favs: [] }; }
})();
const isUpgrade = !!localStorage.getItem(LS) && S.wizardFor !== WIZARD_VERSION;
if (!MODELS.some(m => m.key === S.model)) S.model = 'icon_d2';   // entfernte Modelle → Standard
delete S.keys;
const save = () => { localStorage.setItem(LS, JSON.stringify(S)); syncNative(); };

// ---------- Android-App (wetter-android) ----------
// Aufrufe an die App laufen über prompt() – die App nimmt sie nur von der eigenen Herkunft an.
const NATIVE = / WetterApp-Android\//.test(navigator.userAgent);
const native = (cmd, ...args) => { try { return JSON.parse(prompt('wetterapp:' + JSON.stringify([cmd, ...args])) ?? 'null'); } catch { return null; } };
// Standort und Schalter für die Hintergrundprüfung (Warnungen, Regen) der App
function syncNative() {
  if (NATIVE) native('sync', { lat: S.loc?.lat ?? null, lon: S.loc?.lon ?? null, name: S.loc?.name ?? '', notify: S.notify, warnNotify: S.warnNotify, theme: S.theme,
    rainRadius: S.rainRadius, rainMin: S.rainMin, stormNotify: S.stormNotify, stormRadius: S.stormRadius,
    dailyEve: S.dailyEve, dailyEveTime: S.dailyEveTime, dailyMorn: S.dailyMorn, dailyMornTime: S.dailyMornTime, dailyPlace: dailyPlace(),
    // Widgets können einzeln auf „Mein Standort“ oder einen Favoriten eingestellt werden
    favs: S.favs.map(f => ({ id: String(f.id), name: f.name, lat: f.lat, lon: f.lon })), gpsLoc: S.gpsLoc });
}
// Ort der Tagesvorhersage: zuletzt per GPS ermittelter Standort (sonst der angezeigte Ort) oder ein Favorit
function dailyPlace() {
  const fav = S.favs.find(f => f.id === S.dailyPlace);
  const p = fav || S.gpsLoc || S.loc;
  return p ? { lat: p.lat, lon: p.lon, name: p.name || '' } : null;
}
const notifyPermission = () => NATIVE ? native('permission') : ('Notification' in window ? Notification.permission : 'denied');
function requestNotifyPermission() {
  if (NATIVE) return new Promise(res => { window.__wetterPerm = res; native('requestPermission'); });
  return 'Notification' in window ? Notification.requestPermission() : Promise.resolve('denied');
}

// ---------- Darstellung ----------
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = S.theme === 'light' || S.theme === 'dark' ? S.theme : (darkMq.matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('#themeSeg button').forEach(b => { b.classList.toggle('active', b.dataset.theme === S.theme); b.setAttribute('aria-checked', String(b.dataset.theme === S.theme)); });
  const sel = $('#setTheme'); if (sel) sel.value = S.theme;
}
darkMq.addEventListener?.('change', () => { if (S.theme === 'system') applyTheme(); });

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const I = (k) => window.ICONS.ui(k);
const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d });
const hhmm = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const dirName = (deg) => deg == null ? '' : DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const HOUR = 3600000, MIN = 60000;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Kalendertage addieren – nicht n * 24 h, sonst stimmt der Tag bei der Zeitumstellung (23-/25-Stunden-Tag) nicht
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const isoZ = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
function distKm(a, b, c, d) { const x = rad(c - a), y = rad(d - b); const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); }
function whenTxt(ms) {
  const d = new Date(ms), today = dayStart(Date.now());
  const day = dayStart(ms) === today ? 'heute ' : dayStart(ms) === addDays(today, -1) ? 'gestern ' : `${WD[d.getDay()]} `;
  return `${day}${hhmm(ms)} Uhr`;
}
function hourTxt(ms) {
  const today = dayStart(Date.now()), d = dayStart(ms), h = new Date(ms).getHours();
  if (d === today) return `${h} Uhr`;
  if (d === addDays(today, 1)) return h < 6 ? `${h} Uhr in der Nacht` : `morgen ${h} Uhr`;
  return `${WD[new Date(ms).getDay()]} ${h} Uhr`;
}
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

let toastT;
function toast(msg, ms = 4000, action) {
  const t = $('#toast'); t.innerHTML = ''; const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { t.hidden = true; action.fn(); }; t.appendChild(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
let offlineHits = 0;
async function fetchJSON(url, opts = {}) {
  let r;
  try { r = await fetch(url, { cache: 'no-store', ...opts }); }
  catch { throw new Error('keine Verbindung oder vom Anbieter blockiert (CORS)'); }
  if (r.headers.get('x-sw-cache') === '1') offlineHits++;
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    if (r.status === 429) msg += ' – Abrufgrenze erreicht';
    try { const j = await r.json(); const reason = j.reason || j.message || j.error; if (reason && typeof reason === 'string') msg += ` (${reason})`; } catch { }
    throw new Error(msg);
  }
  const at = Number(r.headers.get('x-sw-time')) || Date.now();
  return { data: await r.json(), at };
}
const getJSON = async (url, opts) => (await fetchJSON(url, opts)).data;

// Gefühlte Temperatur (Australian Apparent Temperature, Steadman) – Wind in km/h
function apparentTemp(t, rh, windKmh) {
  if (t == null || rh == null) return null;
  const e = rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t));
  return t + 0.33 * e - 0.70 * ((windKmh ?? 0) / 3.6) - 4.00;
}
function rhFromDew(t, td) {
  if (t == null || td == null) return null;
  const f = (x) => Math.exp(17.625 * x / (243.04 + x));
  return Math.min(100, 100 * f(td) / f(t));
}

// ---------- Startseiten-Layout ----------
function normLayout() {
  const def = SECTIONS.map(s => ({ id: s.id, on: true }));
  if (!Array.isArray(S.layout)) return def;
  const known = S.layout.filter(l => SECTIONS.some(s => s.id === l.id));
  for (const s of SECTIONS) if (!known.some(l => l.id === s.id)) {
    const i = SECTIONS.findIndex(x => x.id === s.id), before = SECTIONS.slice(i + 1).map(x => x.id);
    const pos = known.findIndex(l => before.includes(l.id));
    known.splice(pos < 0 ? known.length : pos, 0, { id: s.id, on: true });
  }
  return known;
}
const isOn = (id) => (S.layout || []).find(l => l.id === id)?.on !== false;
function applyLayout() {
  const main = $('#content'), credits = $('#credits');
  for (const l of S.layout) {
    const el = main.querySelector(`[data-sec="${l.id}"]`); if (!el) continue;
    main.insertBefore(el, credits);
    el.toggleAttribute('data-off', !l.on);
  }
  if (map && isOn('map')) setTimeout(() => map.invalidateSize(), 60);
}
let layoutDraft = null, layoutWasOff = [], afterLayout = null;
function openLayout(first = false) {
  layoutDraft = S.layout.map(l => ({ ...l }));
  layoutWasOff = S.layout.filter(l => !l.on).map(l => l.id);
  $('#layoutTitle').textContent = first ? (isUpgrade ? `Neu in Version ${WIZARD_VERSION}: Benachrichtigungen einrichten` : 'Willkommen! App einrichten') : 'Startseite anpassen';
  $('#themePick').hidden = !first;
  $('#wizNotify').hidden = !first;
  $('#layoutHead').hidden = !first;
  syncNotifyControls();
  $('#gripHint').innerHTML = I('grip');
  renderLayoutList();
  $('#dlgLayout').showModal();
}
function renderLayoutList() {
  const ul = $('#layoutList'); ul.innerHTML = '';
  layoutDraft.forEach((l, i) => {
    const s = SECTIONS.find(x => x.id === l.id), isNew = S.layoutSeen.length > 0 && !S.layoutSeen.includes(l.id);
    const li = document.createElement('li'); li.dataset.id = l.id; li.classList.toggle('off', !l.on);
    li.innerHTML = `<span class="grip" title="Ziehen zum Verschieben">${I('grip')}</span>`
      + `<label class="lname">${I(s.icon)}<span>${esc(s.name)}${isNew ? ' <span class="new">neu</span>' : ''}<small>${esc(s.sub)}</small></span></label>`
      + `<button type="button" class="mv" data-mv="-1" title="Nach oben" ${i === 0 ? 'disabled style="opacity:.35"' : ''}>${I('up')}</button>`
      + `<button type="button" class="mv" data-mv="1" title="Nach unten" ${i === layoutDraft.length - 1 ? 'disabled style="opacity:.35"' : ''}>${I('down')}</button>`
      + `<input type="checkbox" ${l.on ? 'checked' : ''} aria-label="${esc(s.name)} anzeigen">`;
    li.querySelector('input').onchange = (e) => { l.on = e.target.checked; li.classList.toggle('off', !l.on); commitLayout(); };
    li.querySelector('.lname').onclick = () => { const c = li.querySelector('input'); c.checked = !c.checked; c.onchange({ target: c }); };
    li.querySelectorAll('.mv').forEach(b => b.onclick = () => {
      const j = i + Number(b.dataset.mv); if (j < 0 || j >= layoutDraft.length) return;
      [layoutDraft[i], layoutDraft[j]] = [layoutDraft[j], layoutDraft[i]]; renderLayoutList(); commitLayout();
    });
    initDrag(li, li.querySelector('.grip'));
    ul.appendChild(li);
  });
}
function initDrag(li, handle) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const ul = li.parentElement; li.classList.add('dragging');
    const move = (ev) => {
      ev.preventDefault();
      const sibs = [...ul.children].filter(x => x !== li);
      const after = sibs.find(x => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (after) { if (li.nextElementSibling !== after) ul.insertBefore(li, after); } else if (ul.lastElementChild !== li) ul.appendChild(li);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      li.classList.remove('dragging');
      const order = [...ul.children].map(x => x.dataset.id);
      layoutDraft.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      renderLayoutList(); commitLayout();
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}
function commitLayout() { S.layout = layoutDraft.map(l => ({ ...l })); save(); applyLayout(); }
function closeLayout() {
  S.layoutSeen = SECTIONS.map(s => s.id); S.wizardFor = WIZARD_VERSION; save();
  $('#dlgLayout').close();
  if (afterLayout) { const f = afterLayout; afterLayout = null; f(); }
  if (S.layout.some(l => l.on && layoutWasOff.includes(l.id))) refresh();
  if (!isOn('map')) stopAnim();
}

// ---------- Sonne ----------
function sunElevation(lat, lon, date = new Date()) {
  const d = (date - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = rad((357.529 + 0.98560028 * d) % 360), q = (280.459 + 0.98564736 * d) % 360;
  const L = rad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)), e = rad(23.439 - 0.00000036 * d);
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = rad((gmst * 15 + lon) % 360) - ra;
  return deg(Math.asin(Math.sin(rad(lat)) * Math.sin(dec) + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(ha)));
}
function sunTimes(dayMs, lat, lon) {
  const noon = new Date(dayMs); noon.setHours(12, 0, 0, 0);
  const jd = noon.getTime() / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008), Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 0.0003 * Math.sin(rad(3 * M));
  const lam = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(rad(M)) - 0.0069 * Math.sin(rad(2 * lam));
  const dec = Math.asin(Math.sin(rad(lam)) * Math.sin(rad(23.44)));
  const cw = (Math.sin(rad(-0.833)) - Math.sin(rad(lat)) * Math.sin(dec)) / (Math.cos(rad(lat)) * Math.cos(dec));
  const toMs = (j) => (j - 2440587.5) * 86400000;
  if (cw > 1) return { polar: 'night' };
  if (cw < -1) return { polar: 'day' };
  const w = deg(Math.acos(cw)) / 360;
  return { rise: toMs(Jt - w), set: toMs(Jt + w) };
}
// ---------- Mond (Formeln nach astronomyanswers.com / SunCalc, Genauigkeit wenige Minuten) ----------
const J2000_MS = Date.UTC(2000, 0, 1, 12), ECL = rad(23.4397);
const astroDays = (ms) => (ms - J2000_MS) / 86400000;
const raOf = (l, b) => Math.atan2(Math.sin(l) * Math.cos(ECL) - Math.tan(b) * Math.sin(ECL), Math.cos(l));
const decOf = (l, b) => Math.asin(Math.sin(b) * Math.cos(ECL) + Math.cos(b) * Math.sin(ECL) * Math.sin(l));
function moonCoords(d) {
  const L = rad(218.316 + 13.176396 * d), M = rad(134.963 + 13.064993 * d), F = rad(93.272 + 13.229350 * d);
  const l = L + rad(6.289) * Math.sin(M), b = rad(5.128) * Math.sin(F);
  return { ra: raOf(l, b), dec: decOf(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
function moonAltitude(ms, lat, lon) {
  const d = astroDays(ms), c = moonCoords(d), phi = rad(lat);
  const H = rad(280.16 + 360.9856235 * d) + rad(lon) - c.ra;
  return Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
}
// Phase 0 = Neumond, 0,25 = erstes Viertel, 0,5 = Vollmond, 0,75 = letztes Viertel; frac = beleuchteter Anteil
function moonPhase(ms) {
  const d = astroDays(ms), M = rad(357.5291 + 0.98560028 * d);
  const Ls = M + rad(1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad(102.9372) + Math.PI;
  const s = { ra: raOf(Ls, 0), dec: decOf(Ls, 0), dist: 149598000 }, m = moonCoords(d);
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(s.dist * Math.sin(phi), m.dist - s.dist * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { frac: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
}
// Auf- und Untergänge im Zeitraum [from, from + hours] (Horizont inkl. Refraktion/Mondradius)
function moonEvents(from, hours, lat, lon) {
  const ev = [], alt = (h) => moonAltitude(from + h * HOUR, lat, lon) - rad(0.133);
  let h0 = alt(0);
  for (let i = 1; i <= hours; i += 2) {
    // Parabel durch drei Stunden-Werte; Nullstellen im Intervall = Horizontdurchgang, steigend = Aufgang
    const h1 = alt(i), h2 = alt(i + 1), a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a), disc = b * b - 4 * a * h1;
    if (disc >= 0 && a !== 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
      for (const x of [xe - dx, xe + dx]) if (Math.abs(x) <= 1) ev.push({ t: from + (i + x) * HOUR, rise: 2 * a * x + b > 0 });
    } else if (a === 0 && b !== 0 && Math.abs(-h1 / b) <= 1) ev.push({ t: from + (i - h1 / b) * HOUR, rise: b > 0 });
    h0 = h2;
  }
  return ev.sort((p, q) => p.t - q.t);
}
const MOON_NAMES = [[0.03, 'Neumond'], [0.22, 'zunehmende Sichel'], [0.28, 'zunehmender Halbmond'], [0.47, 'zunehmender Mond'], [0.53, 'Vollmond'], [0.72, 'abnehmender Mond'], [0.78, 'abnehmender Halbmond'], [0.97, 'abnehmende Sichel'], [1.01, 'Neumond']];
const moonName = (p) => MOON_NAMES.find(([lim]) => p < lim)[1];
function nextFullNew(ms) {   // nächster Voll- bzw. Neumond (Suche in 1-h-Schritten, auf die Stunde genau)
  const out = {}; let prev = moonPhase(ms).phase;
  for (let t = ms + HOUR; t < ms + 31 * 86400000 && !(out.full && out.new); t += HOUR) {
    const p = moonPhase(t).phase;
    if (!out.full && prev < 0.5 && p >= 0.5) out.full = t;
    if (!out.new && p < prev - 0.5) out.new = t;
    prev = p;
  }
  return out;
}

function renderSun() {
  const p = S.station?.lat != null ? { lat: S.station.lat, lon: S.station.lon, name: `Station ${S.station.name}` } : S.loc ? { ...S.loc } : null;
  const el = $('#sunRow'); if (!p) { el.innerHTML = ''; return; }
  const now = Date.now(); let st = sunTimes(now, p.lat, p.lon), label = '';
  if (st.set && now > st.set) { st = sunTimes(now + 24 * HOUR, p.lat, p.lon); label = ' (morgen)'; }
  if (st.polar) { el.textContent = st.polar === 'day' ? 'Polartag – die Sonne geht nicht unter' : 'Polarnacht – die Sonne geht nicht auf'; return; }
  const len = Math.round((st.set - st.rise) / MIN);
  el.innerHTML = `<span title="Sonnenaufgang${label} · ${esc(p.name)}">${I('sunrise')}<b>${hhmm(st.rise)}</b></span>`
    + `<span title="Sonnenuntergang${label} · ${esc(p.name)}">${I('sunset')}<b>${hhmm(st.set)}</b></span>`
    + `<span class="muted" title="Tageslänge">${I('daylen')}${Math.floor(len / 60)} h ${String(len % 60).padStart(2, '0')} min${label}</span>`
    + moonRow(now, p);
}
function moonRow(now, p) {
  const mp = moonPhase(now), ev = moonEvents(now, 48, p.lat, p.lon), today = dayStart(now);
  const when = (t) => `${dayStart(t) === today ? '' : dayStart(t) === addDays(today, 1) ? 'morgen ' : `${WD[new Date(t).getDay()]} `}${hhmm(t)}`;
  const rise = ev.find(e => e.rise), set = ev.find(e => !e.rise), nx = nextFullNew(now);
  const items = [rise && [rise.t, `<span title="Mondaufgang · ${esc(p.name)}">${I('moonrise')}<b>${when(rise.t)}</b></span>`],
    set && [set.t, `<span title="Monduntergang · ${esc(p.name)}">${I('moonset')}<b>${when(set.t)}</b></span>`]].filter(Boolean).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  if (!rise && !set) items.push(`<span class="muted">${moonAltitude(now, p.lat, p.lon) > 0 ? 'Mond geht nicht unter' : 'Mond geht nicht auf'}</span>`);
  const nextTxt = [[nx.full, 'Vollmond'], [nx.new, 'Neumond']].filter(x => x[0]).sort((a, b) => a[0] - b[0]).map(([t, n]) => `${n} ${whenDay(t)}`).join(' · ');
  return `<span class="moonbreak"></span>` + items.join('')
    + `<span title="${esc(nextTxt)}">${window.SCENE.moonIcon(mp.phase)}<b>${moonName(mp.phase)}</b><span class="muted">${fmt(mp.frac * 100, 0)} %</span></span>`;
}
const whenDay = (t) => `${WD[new Date(t).getDay()]} ${new Date(t).getDate()}.${new Date(t).getMonth() + 1}.`;

// ---------- Hintergrundszene (scene.js) ----------
let sceneWx = null, sceneRainNow = false, sceneKey = '';
const SEASON_OF_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const PRECIP_OF = { rain: 'rain', sleet: 'sleet', snow: 'snow', hail: 'hail', thunderstorm: 'rain' };
// Vorschau über die Adresse, z. B. ?szene=herbst,tag,klar oder ?szene=winter,nacht,schnee,wind
const SCENE_WORDS = {
  season: { fruehling: 'spring', frühling: 'spring', sommer: 'summer', herbst: 'autumn', winter: 'winter' },
  phase: { morgen: 'dawn', tag: 'day', abend: 'dusk', nacht: 'night' },
  sky: { klar: 'clear', heiter: 'partly', bewoelkt: 'cloudy', bewölkt: 'cloudy', nebel: 'fog' },
  precip: { regen: 'rain', schneeregen: 'sleet', schnee: 'snow', hagel: 'hail' },
  flag: { gewitter: 'storm', heiss: 'hot', heiß: 'hot', wind: 'windy', schneedecke: 'snowCover', frost: 'frost' },
  moon: { sichel: 0.15, halbmond: 0.25, vollmond: 0.5, abnehmend: 0.8, neumond: null }
};
function scenePreview() {
  const q = new URLSearchParams(location.search).get('szene'); if (!q) return null;
  const st = { season: 'summer', phase: 'day', sky: 'clear', precip: null, storm: false, hot: false, windy: false, snowCover: false, frost: false, moon: 0.35 };
  for (const w of q.toLowerCase().split(',').map(x => x.trim())) {
    for (const k of ['season', 'phase', 'sky', 'precip']) if (SCENE_WORDS[k][w]) st[k] = SCENE_WORDS[k][w];
    if (SCENE_WORDS.flag[w]) st[SCENE_WORDS.flag[w]] = true;
    if (w in SCENE_WORDS.moon) st.moon = SCENE_WORDS.moon[w];
  }
  if (st.precip === 'snow') st.snowCover = true;
  if (st.precip && st.sky === 'clear') st.sky = 'cloudy';
  return st;
}
function sceneState() {
  const now = Date.now(), season = SEASON_OF_MONTH[new Date(now).getMonth()];
  let phase;
  if (S.loc) {
    const st = sunTimes(now, S.loc.lat, S.loc.lon), D = 40 * MIN;
    phase = st.polar ? (st.polar === 'day' ? 'day' : 'night')
      : now < st.rise - D || now > st.set + D ? 'night' : now < st.rise + D ? 'dawn' : now > st.set - D ? 'dusk' : 'day';
  } else { const h = new Date(now).getHours(); phase = h < 6 || h >= 20 ? 'night' : h < 8 ? 'dawn' : h >= 18 ? 'dusk' : 'day'; }
  const c = sceneWx || {}, icon = c.icon || '', cond = c.condition || '', temp = c.temperature;
  let precip = PRECIP_OF[cond] || PRECIP_OF[icon] || null;
  if (!precip && sceneRainNow) precip = temp != null && temp <= 0 ? 'snow' : 'rain';   // Radar: regnet gerade am Standort
  let sky = cond === 'fog' || icon === 'fog' ? 'fog' : icon.startsWith('clear') ? 'clear' : icon.startsWith('partly') || icon === 'wind' ? 'partly' : icon === 'cloudy' ? 'cloudy' : null;
  if (!sky) sky = precip ? 'cloudy' : c.cloud_cover == null ? 'partly' : c.cloud_cover < 25 ? 'clear' : c.cloud_cover < 75 ? 'partly' : 'cloudy';
  if (precip && sky === 'clear') sky = 'partly';
  const gust = c.wind_gust_speed_10 ?? c.wind_gust_speed_30 ?? c.wind_gust_speed_60;
  return {
    season, phase, sky, precip, storm: cond === 'thunderstorm' || icon === 'thunderstorm',
    hot: temp != null && temp >= 27, windy: icon === 'wind' || (gust != null && gust >= 50),
    snowCover: precip === 'snow' || (precip === 'sleet' && temp != null && temp <= 1), frost: temp != null && temp <= 0,
    // Mond nachts nur, wenn er über dem Horizont steht; Phase gerundet, damit die Szene nicht ständig neu gezeichnet wird
    moon: phase === 'night' && S.loc && moonAltitude(now, S.loc.lat, S.loc.lon) > 0 ? Math.round(moonPhase(now).phase * 40) / 40 : null
  };
}
function applyGlass() {
  document.documentElement.style.setProperty('--ga', String(S.glass / 100));
  $('#glassVal').textContent = `${S.glass} %`;
  $('#glassRow').hidden = !S.scene;
}
function renderScene() {
  document.body.classList.toggle('scene', !!S.scene);
  applyGlass();
  const box = $('#scene');
  if (!S.scene) { box.innerHTML = ''; sceneKey = ''; return; }
  const st = scenePreview() || sceneState(), key = JSON.stringify(st);
  if (key === sceneKey) return;
  sceneKey = key;
  const layer = document.createElement('div');
  layer.innerHTML = window.SCENE.svg(st);
  box.appendChild(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => { layer.style.opacity = '1'; }));   // sanft überblenden
  setTimeout(() => { while (box.children.length > 1) box.firstElementChild.remove(); }, 1400);
}

// ---------- Aktuelles Wetter ----------
const ICON_TXT = { 'clear-day': 'Sonnig', 'clear-night': 'Klar', 'partly-cloudy-day': 'Teilweise bewölkt', 'partly-cloudy-night': 'Teilweise bewölkt', cloudy: 'Bewölkt', fog: 'Nebel', wind: 'Windig', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
const COND = { fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
async function loadCurrent(lat, lon) {
  let d, fallback = false;
  if (S.station?.wmo) {
    try { d = await getJSON(`${BS}/current_weather?wmo_station_id=${encodeURIComponent(S.station.wmo)}&tz=Europe/Berlin`); }
    catch { fallback = true; }
  }
  if (!d) d = await getJSON(`${BS}/current_weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`);
  const c = d.weather, src = (d.sources || []).find(s => s.id === c.source_id) || d.sources?.[0];
  sceneWx = c; renderScene();
  $('#nowIcon').innerHTML = window.ICONS.weather(c.icon);
  $('#nowTemp').textContent = `${fmt(c.temperature)} °C`;
  $('#nowDesc').textContent = COND[c.condition] || ICON_TXT[c.icon] || 'trocken';
  const wind = c.wind_speed_10 ?? c.wind_speed_30 ?? c.wind_speed_60;
  const wdir = c.wind_direction_10 ?? c.wind_direction_30 ?? c.wind_direction_60;
  const gust = c.wind_gust_speed_10 ?? c.wind_gust_speed_30 ?? c.wind_gust_speed_60;
  const precip = c.precipitation_60 ?? c.precipitation_30 ?? c.precipitation_10;
  const feels = apparentTemp(c.temperature, c.relative_humidity, wind);
  $('#nowDetails').innerHTML = [
    feels != null && Math.abs(feels - c.temperature) >= 1 && `<span>${I('thermo')}gefühlt <b>${fmt(feels, 0)} °C</b></span>`,
    wind != null && `<span>${I('wind')}<b>${fmt(wind, 0)} km/h</b> ${dirName(wdir)}${gust != null ? `, Böen ${fmt(gust, 0)}` : ''}</span>`,
    c.relative_humidity != null && `<span>${I('drop')}<b>${fmt(c.relative_humidity, 0)} %</b>${c.dew_point != null ? `, Taupunkt ${fmt(c.dew_point, 0)} °C` : ''}</span>`,
    precip != null && `<span>${I('umbrella')}<b>${fmt(precip)} mm</b>/h</span>`,
    c.cloud_cover != null && `<span>${I('cloud')}<b>${fmt(c.cloud_cover, 0)} %</b></span>`,
    c.pressure_msl != null && `<span>${I('gauge')}<b>${fmt(c.pressure_msl, 0)} hPa</b></span>`
  ].filter(Boolean).join('');
  const dist = src && S.loc ? distKm(S.loc.lat, S.loc.lon, src.lat, src.lon) : null;
  $('#nowStation').textContent = `Station ${src?.station_name ?? '–'}${dist != null ? ` · ${fmt(dist, 0)} km` : ''} · ${hhmm(new Date(c.timestamp))} Uhr`;
  $('#btnStation').title = `DWD-Station ${src?.station_name ?? ''} (${S.station ? 'gewählt' : 'nächste'}) – antippen zum Wechseln`;
  $('#btnStation').classList.toggle('chosen', !!S.station);
  if (fallback) toast(`Station ${S.station.name} liefert gerade keine Werte – zeige nächstgelegene.`);
}
async function openStationDialog() {
  if (!S.loc) { openSearch(); return; }
  const ul = $('#stationList'); ul.innerHTML = '<li class="muted small">Lade Stationen …</li>';
  $('#dlgStation').showModal();
  try {
    const d = await getJSON(`${BS}/sources?lat=${S.loc.lat.toFixed(4)}&lon=${S.loc.lon.toFixed(4)}&max_dist=60000`);
    const seen = new Set(), list = [];
    for (const s of (d.sources || []).filter(s => s.observation_type === 'synop' && s.wmo_station_id)) {
      if (seen.has(s.wmo_station_id)) continue; seen.add(s.wmo_station_id);
      list.push({ ...s, km: distKm(S.loc.lat, S.loc.lon, s.lat, s.lon) });
    }
    list.sort((a, b) => a.km - b.km);
    ul.innerHTML = '';
    const add = (label, sub, sel, fn) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      if (sel) b.className = 'sel';
      b.innerHTML = `<b>${esc(label)}</b><br><span class="small muted">${esc(sub)}</span>`;
      b.onclick = () => { fn(); syncFavStation(); $('#dlgStation').close(); renderSun(); refresh(); };
      li.appendChild(b); ul.appendChild(li);
    };
    add('Automatisch', 'immer die nächstgelegene Station mit aktuellen Werten', !S.station, () => { S.station = null; save(); drawStationMarker(); });
    for (const s of list) add(s.station_name, `${fmt(s.km, 0)} km · ${fmt(s.height, 0)} m ü. NN · WMO ${s.wmo_station_id}`, S.station?.wmo === s.wmo_station_id,
      () => { S.station = { wmo: s.wmo_station_id, name: s.station_name, lat: s.lat, lon: s.lon }; save(); drawStationMarker(); });
    if (!list.length) ul.insertAdjacentHTML('beforeend', '<li class="muted small">Keine weiteren Stationen im Umkreis gefunden.</li>');
  } catch (e) { ul.innerHTML = `<li class="muted small">Stationen nicht abrufbar (${esc(e.message)})</li>`; }
}

// ---------- Modellstatus ----------
const metaCache = {};
async function modelRun(m) {
  if (!m.meta) return null;
  const c = metaCache[m.meta]; if (c && Date.now() - c.ts < 10 * MIN) return c.run;
  try {
    const d = await getJSON(`${OM_META}/${m.meta}/static/meta.json`);
    const run = d.last_run_initialisation_time ? d.last_run_initialisation_time * 1000 : null;
    metaCache[m.meta] = { ts: Date.now(), run }; return run;
  } catch { metaCache[m.meta] = { ts: Date.now(), run: null }; return null; }
}
const runTxt = (run, at) => run ? `Modelllauf ${whenTxt(run)}` : `Datenstand ${whenTxt(at)}`;

// ---------- Vorhersage-Abruf ----------
// Zeile: { t, temp, feels, dew, mm, pEnd, prob, sun, wind, wdir, gust, icon, cloud, code }
let mosmixCache = null;
async function getMosmix(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (mosmixCache && mosmixCache.key === key && Date.now() - mosmixCache.ts < 15 * MIN) return mosmixCache;
  const from = new Date(dayStart(Date.now())), to = new Date(addDays(from.getTime(), 11));
  const { data: d, at } = await fetchJSON(`${BS}/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&date=${from.toISOString()}&last_date=${to.toISOString()}&tz=Europe/Berlin`);
  const rows = (d.weather || []).map(w => {
    const t = new Date(w.timestamp).getTime();
    const rh = w.relative_humidity ?? rhFromDew(w.temperature, w.dew_point);
    return {
      t, temp: w.temperature, dew: w.dew_point ?? null, feels: apparentTemp(w.temperature, rh, w.wind_speed),
      mm: w.precipitation ?? 0, pEnd: t, prob: w.precipitation_probability ?? null, sun: w.sunshine ?? null,
      wind: w.wind_speed, wdir: w.wind_direction, gust: w.wind_gust_speed, icon: w.icon, cloud: w.cloud_cover
    };
  }).filter(r => r.temp != null).sort((a, b) => a.t - b.t);
  mosmixCache = { key, ts: Date.now(), at, rows };
  return mosmixCache;
}
async function omHourly(lat, lon, model, vars, days) {
  const q = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: vars.join(','), models: model, timezone: 'auto', timeformat: 'unixtime', forecast_days: String(days) });
  const { data: d, at } = await fetchJSON(`${OM}?${q}`);
  const h = d.hourly || {};
  const col = (n) => h[n] ?? h[`${n}_${model}`] ?? [];
  return { time: h.time || [], col, at, elevation: d.elevation };
}
async function fcOpenMeteo(lat, lon, H, m) {
  const vars = ['temperature_2m', 'apparent_temperature', 'dew_point_2m', 'precipitation', 'precipitation_probability', 'sunshine_duration', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'];
  const [res, run] = await Promise.all([omHourly(lat, lon, m.key, vars, Math.min(16, Math.ceil(H / 24) + 1)), modelRun(m)]);
  const c = Object.fromEntries(vars.map(v => [v, res.col(v)]));
  const rows = res.time.map((t, i) => ({
    t: t * 1000, temp: c.temperature_2m[i], feels: c.apparent_temperature[i] ?? null, dew: c.dew_point_2m[i] ?? null,
    mm: c.precipitation[i] ?? 0, pEnd: t * 1000, prob: c.precipitation_probability[i] ?? null,
    sun: c.sunshine_duration[i] == null ? null : c.sunshine_duration[i] / 60,
    wind: c.wind_speed_10m[i], wdir: c.wind_direction_10m[i], gust: c.wind_gusts_10m[i]
  }));
  return { rows, at: res.at, run };
}
async function fetchModel(m, lat, lon, H) {
  if (m.src === 'bs') { const r = await getMosmix(lat, lon); return { rows: r.rows, at: r.at, run: null }; }
  return fcOpenMeteo(lat, lon, H, m);
}

// ---------- Verlauf ----------
const currentModel = () => MODELS.find(m => m.key === S.model) || MODELS[0];
const range = () => RANGES.find(r => r.h === S.rangeH) || RANGES[0];
let fcSeq = 0;
async function loadForecast(lat, lon) {
  const seq = ++fcSeq;
  const m = currentModel(), R = range();
  $('#chartTitle').textContent = R.title;
  $('#chartInfo').textContent = 'Lade Vorhersage …';
  let used = m.maxH < R.h ? MOSMIX : m, res;
  try { res = await fetchModel(used, lat, lon, R.h); }
  catch (e) {
    if (used === MOSMIX) throw e;
    console.warn(`${m.name}: ${e.message} – Rückfall auf MOSMIX`);
    used = MOSMIX; res = await fetchModel(MOSMIX, lat, lon, R.h);
  }
  const start = new Date(); start.setMinutes(0, 0, 0);
  const t0 = start.getTime(), t1 = t0 + R.h * HOUR;
  let rows = res.rows.filter(r => r.temp != null && r.t >= t0 - 3 * HOUR && r.t <= t1 + 3 * HOUR).map(r => ({ ...r })).sort((a, b) => a.t - b.t);
  if (rows.filter(r => r.t >= t0 && r.t <= t1).length < 2) throw new Error(`${used.name} liefert für diesen Ort keine Daten`);
  // Regenwahrscheinlichkeit: liefert das Modell keine, aus DWD MOSMIX ergänzen
  let probSrc = used.name;
  if (!rows.some(r => r.prob != null && r.t >= t0 && r.t <= t1)) {
    try {
      const mm = await getMosmix(lat, lon), pm = new Map(mm.rows.map(r => [r.t, r.prob]));
      rows.forEach(r => { r.prob = pm.get(r.t) ?? null; });
      probSrc = 'DWD MOSMIX';
    } catch { probSrc = null; }
  }
  if (seq !== fcSeq) return;
  $('#modelInfo').innerHTML = `${I('clock')} <span><b>${esc(used.name)}</b> · ${runTxt(res.run, res.at)}</span>`;
  $('#modelInfo').title = used.info;
  drawChart(rows, t0, t1, used, probSrc);
}

function renderLegend(hasF, hasD) {
  const box = $('#chartLegend');
  const item = (key, cls, label, has, color, style) => `<button type="button" data-k="${key}" class="${S[key] && has ? '' : 'off'}" ${has ? '' : 'disabled title="vom Modell nicht geliefert"'}><i style="border-top-color:${color};border-top-style:${style}"></i>${label}</button>`;
  box.innerHTML = `<button type="button" disabled style="opacity:1"><i style="border-top-color:var(--temp)"></i>Temperatur</button>`
    + item('showFeels', 'f', 'gefühlt', hasF, 'var(--feels)', 'dashed')
    + item('showDew', 'd', 'Taupunkt', hasD, 'var(--dew)', 'dotted');
  box.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => { S[b.dataset.k] = !S[b.dataset.k]; save(); if (lastChart) drawChart(...lastChart); });
}

let lastChart = null;
function drawChart(rows, t0, t1, model, probSrc) {
  lastChart = [rows, t0, t1, model, probSrc];
  const H = (t1 - t0) / HOUR;
  const W = Math.max(300, Math.round($('#chart').clientWidth || 680)), PADL = 34, PADR = 16;
  const plotW = W - PADL - PADR, pph = plotW / H;
  const TOP = 22, TH = W < 500 ? 130 : 150;
  const XL = TOP + TH + 15;
  const hourStep = H <= 12 ? null : [3, 6, 12].find(s => s * pph >= 24);
  const XD = H > 12 && hourStep ? XL + 15 : XL;
  const RAIN_Y = XD + 32, RAIN_H = 34;
  const PROB_Y = RAIN_Y + RAIN_H + 26, PROB_H = 16;
  const WIND_Y = PROB_Y + PROB_H + 26, WIND_H = 34;
  const SUN_Y = WIND_Y + WIND_H + 30, SUN_H = 22;
  const HGT = SUN_Y + SUN_H + 18;
  const x = (t) => PADL + (t - t0) / (t1 - t0) * plotW;

  const tp = rows.filter(r => r.t >= t0 && r.t <= t1);
  const hasF = rows.some(r => r.feels != null), hasD = rows.some(r => r.dew != null);
  const showF = S.showFeels && hasF, showD = S.showDew && hasD;
  renderLegend(hasF, hasD);
  const temps = tp.map(r => r.temp);
  const all = tp.flatMap(r => [r.temp, showF ? r.feels : null, showD ? r.dew : null]).filter(v => v != null);
  let tmin = Math.floor(Math.min(...all) - 1), tmax = Math.ceil(Math.max(...all) + 1);
  if (tmax - tmin < 6) { const mid = (tmax + tmin) / 2; tmin = Math.floor(mid - 3); tmax = Math.ceil(mid + 3); }
  const y = (v) => TOP + TH - (v - tmin) / (tmax - tmin) * TH;
  let svg = '';
  const tickStep = (tmax - tmin) > 20 ? 5 : (tmax - tmin) > 9 ? 2 : 1;
  for (let v = Math.ceil(tmin / tickStep) * tickStep; v <= tmax; v += tickStep)
    svg += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${y(v)}" y2="${y(v)}"/><text class="rowlbl" x="${PADL - 5}" y="${y(v) + 3}" text-anchor="end">${v}°</text>`;
  if (tmin < 0 && tmax > 0) svg += `<line x1="${PADL}" x2="${W - PADR}" y1="${y(0)}" y2="${y(0)}" stroke="#4dabf7" stroke-width="1" stroke-dasharray="4 3"/>`;

  // Zeitachse
  if (H <= 12) {
    const step = 3 * pph >= 48 ? 3 : 6;
    for (let t = t0; t <= t1; t += step * HOUR) {
      const anchor = t === t0 ? 'start' : x(t) > W - PADR - 20 ? 'end' : 'middle';
      svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${TOP}" y2="${TOP + TH}"/><text class="xlbl" x="${anchor === 'start' ? x(t) - 4 : x(t)}" y="${XL}" style="text-anchor:${anchor}">${t === t0 ? 'jetzt' : new Date(t).getHours() + ' Uhr'}</text>`;
    }
  } else {
    for (let t = addDays(dayStart(t0), 1); t < t1; t = addDays(t, 1)) svg += `<line class="daysep" x1="${x(t)}" x2="${x(t)}" y1="${TOP}" y2="${XD + 4}"/>`;
    if (hourStep) {
      svg += `<text class="rowlbl" x="${PADL - 5}" y="${XL}" text-anchor="end">Uhr</text>`;
      for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += HOUR) {
        const hr = new Date(t).getHours();
        if (hr === 0 || hr % hourStep) continue;
        if (x(t) < PADL + 6 || x(t) > W - PADR - 6) continue;
        svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${TOP}" y2="${TOP + TH}"/><text class="xlbl" x="${x(t)}" y="${XL}">${hr}</text>`;
      }
    }
    for (let t = dayStart(t0); t < t1; t = addDays(t, 1)) {
      const a = Math.max(t, t0), b = Math.min(addDays(t, 1), t1), span = x(b) - x(a);
      if (span < 14) continue;
      const d = new Date(t), today = dayStart(Date.now());
      const name = t === today ? 'Heute' : t === addDays(today, 1) ? 'Morgen' : WD[d.getDay()];
      const txt = span >= 70 ? `${name} ${t > addDays(today, 1) ? d.getDate() + '.' : ''}`.trim() : span >= 44 ? name : WD[d.getDay()];
      svg += `<text class="xlbl day" x="${(x(a) + x(b)) / 2}" y="${XD}">${txt}</text>`;
    }
  }

  // Kurven
  const curve = (key) => {
    const pts = rows.filter(r => r[key] != null).map(r => [x(r.t), y(r[key])]);
    if (pts.length < 2) return { d: '', pts };
    return { pts, d: pts.map((p, i) => { if (!i) return `M${p[0]},${p[1]}`; const p0 = pts[i - 1], cx = (p0[0] + p[0]) / 2; return `C${cx},${p0[1]} ${cx},${p[1]} ${p[0]},${p[1]}`; }).join(' ') };
  };
  const T = curve('temp');
  svg += `<defs><clipPath id="clipT"><rect x="${PADL}" y="0" width="${plotW}" height="${TOP + TH}"/></clipPath></defs><g clip-path="url(#clipT)">`;
  svg += `<path class="tarea" d="${T.d} L${T.pts[T.pts.length - 1][0]},${TOP + TH} L${T.pts[0][0]},${TOP + TH} Z"/>`;
  if (showD) svg += `<path class="dline" d="${curve('dew').d}"/>`;
  if (showF) svg += `<path class="fline" d="${curve('feels').d}"/>`;
  svg += `<path class="tline" d="${T.d}"/></g>`;
  const label = (r, cls = '') => `<circle class="tdot" cx="${x(r.t)}" cy="${y(r.temp)}" r="3.5"/><text class="tlbl ${cls}" x="${Math.min(Math.max(x(r.t), PADL + 10), W - PADR - 8)}" y="${cls === 'min' ? y(r.temp) + 16 : y(r.temp) - 9}">${fmt(r.temp, 0)}°</text>`;
  if (H <= 12) {
    const iMin = temps.indexOf(Math.min(...temps)), iMax = temps.indexOf(Math.max(...temps));
    const lstep = 3 * pph >= 48 ? 3 : 6;
    tp.forEach((r, i) => { if (((r.t - t0) / HOUR) % lstep === 0 || i === iMin || i === iMax) svg += label(r); });
  } else {
    const days = {};
    tp.forEach(r => { (days[dayStart(r.t)] ||= []).push(r); });
    for (const list of Object.values(days)) {
      const hr = (r) => new Date(r.t).getHours();
      const aft = list.filter(r => hr(r) >= 11 && hr(r) <= 17), morn = list.filter(r => hr(r) >= 2 && hr(r) <= 8);
      if (aft.length >= 2) svg += label(aft.reduce((a, b) => b.temp > a.temp ? b : a));
      if (morn.length >= 2) svg += label(morn.reduce((a, b) => b.temp < a.temp ? b : a), 'min');
    }
  }

  // Zeitblöcke
  const B = H <= 12 ? (pph >= 22 ? 1 : 2) : [3, 6, 12, 24].find(b => b * pph >= 22) || 24;
  const buckets = [];
  if (B === 24) { for (let t = dayStart(t0); t < t1; t = addDays(t, 1)) buckets.push([Math.max(t, t0), Math.min(addDays(t, 1), t1)]); }
  else {
    let t = t0; const h0 = new Date(t0).getHours(), first = (B - (h0 % B)) % B;
    if (first) { buckets.push([t0, t0 + first * HOUR]); t = t0 + first * HOUR; }
    for (; t < t1; t += B * HOUR) buckets.push([t, Math.min(t + B * HOUR, t1)]);
  }
  const stat = buckets.map(([a, b]) => {
    let mm = 0, sun = 0, sunN = 0, u = 0, v = 0, ws = 0, wn = 0, gust = null, prob = null;
    for (const r of rows) {
      const e = r.pEnd - 1;
      if (e >= a && e < b) { mm += r.mm || 0; if (r.sun != null) { sun += r.sun; sunN++; } if (r.prob != null) prob = Math.max(prob ?? 0, r.prob); }
      if (r.t > a && r.t <= b && r.wind != null) {
        ws += r.wind; wn++;
        if (r.wdir != null) { u += r.wind * Math.sin(rad(r.wdir)); v += r.wind * Math.cos(rad(r.wdir)); }
        if (r.gust != null) gust = Math.max(gust ?? 0, r.gust);
      }
    }
    const wdir = (u || v) ? (deg(Math.atan2(u, v)) + 360) % 360 : null;
    return { a, b, mm, prob, sun: sunN ? sun : null, hrs: (b - a) / HOUR, wind: wn ? ws / wn : null, wdir, gust };
  });
  const blk = B === 24 ? 'je Tag' : B > 1 ? `je ${B} h` : '';
  const hasSun = stat.some(s => s.sun != null), hasWind = stat.some(s => s.wind != null), hasProb = stat.some(s => s.prob != null);
  const sunHrs = B >= 6;
  svg += `<text class="rowlbl" x="0" y="${RAIN_Y - 16}">Niederschlag (mm${blk ? ' ' + blk : ''})</text>`;
  svg += `<text class="rowlbl" x="0" y="${PROB_Y - 7}">Regenwahrscheinlichkeit (%${blk ? ', höchster Wert ' + blk : ''})${!hasProb ? ' – nicht verfügbar' : probSrc && probSrc !== model.name ? ` · aus ${probSrc}` : ''}</text>`;
  svg += `<text class="rowlbl" x="0" y="${WIND_Y - 8}">Wind (km/h${blk ? ', Mittel ' + blk : ''}) · Pfeil zeigt Zugrichtung${hasWind ? '' : ' – nicht geliefert'}</text>`;
  svg += `<text class="rowlbl" x="0" y="${SUN_Y - 8}">Sonnenschein (${sunHrs ? 'h' : 'min'}${blk ? ' ' + blk : ''})${hasSun ? '' : ' – vom Modell nicht geliefert'}</text>`;
  const rmax = Math.max(1, ...stat.map(s => s.mm));
  const windCol = (k) => k < 12 ? '#7a8a9c' : k < 29 ? '#1c7ed6' : k < 50 ? '#e67700' : k < 75 ? '#e03131' : '#9c36b5';
  for (const s of stat) {
    const cx = (x(s.a) + x(s.b)) / 2, cw = x(s.b) - x(s.a), bw = Math.min(cw * 0.72, 34);
    const showTxt = cw >= 17;
    const rh = s.mm > 0 ? Math.max(2, s.mm / rmax * RAIN_H) : 0;
    svg += `<line class="grid" x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${RAIN_Y + RAIN_H}" y2="${RAIN_Y + RAIN_H}"/>`;
    if (rh) { svg += `<rect class="rbar" x="${cx - bw / 2}" y="${RAIN_Y + RAIN_H - rh}" width="${bw}" height="${rh}" rx="2"/>`; if (showTxt && s.mm >= 0.05) svg += `<text class="rval" x="${cx}" y="${RAIN_Y + RAIN_H - rh - 3}">${fmt(s.mm, s.mm >= 10 ? 0 : 1)}</text>`; }
    if (s.prob != null) {
      const p = Math.round(s.prob), op = 0.08 + 0.8 * p / 100, dark = p >= 55;
      svg += `<rect x="${cx - Math.min(cw - 2, 30) / 2}" y="${PROB_Y}" width="${Math.min(cw - 2, 30)}" height="${PROB_H}" rx="3" fill="#3d8bfd" fill-opacity="${op.toFixed(2)}"><title>Regenwahrscheinlichkeit ${p} %</title></rect>`;
      if (showTxt) svg += `<text class="pval" x="${cx}" y="${PROB_Y + 11.5}" fill="${dark ? '#fff' : 'currentColor'}">${p}</text>`;
    }
    if (s.wind != null) {
      const col = windCol(s.wind), sc = Math.min(1.25, 0.8 + s.wind / 60);
      if (s.wdir != null) svg += `<g transform="translate(${cx} ${WIND_Y + 8}) rotate(${(s.wdir + 180) % 360}) scale(${sc})"><title>${fmt(s.wind, 0)} km/h aus ${dirName(s.wdir)}${s.gust != null ? `, Böen ${fmt(s.gust, 0)} km/h` : ''}</title><path d="M0,-8 L5.5,6 L0,3 L-5.5,6 Z" fill="${col}"/></g>`;
      if (showTxt) svg += `<text class="wval" x="${cx}" y="${WIND_Y + 28}">${fmt(s.wind, 0)}</text>`;
      if (showTxt && s.gust != null && s.gust >= 60) svg += `<text class="gval" x="${cx}" y="${WIND_Y + 39}">B ${fmt(s.gust, 0)}</text>`;
    }
    const maxSun = s.hrs * 60, sv = Math.min(s.sun ?? 0, maxSun), sh = sv > 0 ? Math.max(2, sv / maxSun * SUN_H) : 0;
    svg += `<line class="grid" x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${SUN_Y + SUN_H}" y2="${SUN_Y + SUN_H}"/>`;
    if (sh) svg += `<rect class="sbar" x="${cx - bw / 2}" y="${SUN_Y + SUN_H - sh}" width="${bw}" height="${sh}" rx="2"/>`;
    if (sv >= 1 && showTxt) svg += `<text class="sval" x="${cx}" y="${SUN_Y + SUN_H + 12}">${sunHrs ? fmt(sv / 60, 1) : fmt(sv, 0)}</text>`;
  }
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${HGT}" width="${W}" height="${HGT}" role="img" style="color:var(--text)">${svg}</svg>`;
  const rain = stat.reduce((a, s) => a + s.mm, 0), sun = stat.reduce((a, s) => a + (s.sun || 0), 0);
  const gmax = Math.max(0, ...stat.map(s => s.gust ?? 0)), pmax = Math.max(-1, ...stat.map(s => s.prob ?? -1));
  const sunTxt = !hasSun ? '–' : sun >= 60 ? `${fmt(sun / 60, 1)} h` : `${fmt(sun, 0)} min`;
  $('#chartInfo').textContent = `Summe: ${fmt(rain)} mm Niederschlag${pmax >= 0 ? ` (Risiko bis ${fmt(pmax, 0)} %)` : ''} · ${sunTxt} Sonne · Min ${fmt(Math.min(...temps), 0)}° / Max ${fmt(Math.max(...temps), 0)}°${gmax ? ` · Böen bis ${fmt(gmax, 0)} km/h` : ''}`;
}
function initForecastControls() {
  const sel = $('#modelSelect'), groups = {};
  for (const m of MODELS) (groups[m.group] ||= []).push(m);
  sel.innerHTML = Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(m => `<option value="${m.key}" title="${esc(m.info)}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
  sel.value = currentModel().key;
  sel.onchange = () => { S.model = sel.value; save(); reloadForecast(); };
  const seg = $('#rangeSeg');
  seg.innerHTML = RANGES.map(r => `<button type="button" data-h="${r.h}" title="${r.title}" class="${r.h === S.rangeH ? 'active' : ''}"><span class="long">${r.label}</span><span class="short">${r.h === 12 ? '12 h' : r.h / 24 + ' T'}</span></button>`).join('');
  seg.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.rangeH = Number(b.dataset.h); save();
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    reloadForecast();
  };
}
function reloadForecast() { if (S.loc) loadForecast(S.loc.lat, S.loc.lon).catch(showForecastError); }
function showForecastError(e) { $('#chart').innerHTML = ''; $('#chartInfo').textContent = `Vorhersage nicht abrufbar (${e.message}).`; }

// ---------- 10-Tage-Übersicht (DWD MOSMIX) ----------
function dayIcon(list) {
  const day = list.filter(r => { const h = new Date(r.t).getHours(); return h >= 7 && h <= 19; });
  const L = day.length ? day : list;
  const cnt = (k) => L.filter(r => r.icon === k).length;
  const mm = list.reduce((a, r) => a + (r.mm || 0), 0);
  if (cnt('thunderstorm') >= 1) return 'thunderstorm';
  if (mm >= 0.5) {
    if (cnt('snow') >= 3) return 'snow';
    if (cnt('sleet') >= 3) return 'sleet';
    return L.filter(r => (r.mm || 0) >= 0.1).length >= 5 ? 'rain' : 'showers';
  }
  if (cnt('fog') >= 4) return 'fog';
  const cl = avg(L.map(r => r.cloud).filter(v => v != null));
  if (cl == null) { const c = { 'clear-day': cnt('clear-day'), 'partly-cloudy-day': cnt('partly-cloudy-day'), cloudy: cnt('cloudy') }; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }
  return cl < 25 ? 'clear-day' : cl < 70 ? 'partly-cloudy-day' : 'cloudy';
}
async function loadDays(lat, lon) {
  const { rows, at } = await getMosmix(lat, lon);
  const today = dayStart(Date.now()), groups = new Map();
  for (const r of rows) { const d = dayStart(r.t - 1); if (d >= today) (groups.get(d) || groups.set(d, []).get(d)).push(r); }
  const days = [...groups.entries()].filter(([, l]) => l.length >= 12).slice(0, 10).map(([d, l]) => ({
    d, tmin: Math.min(...l.map(r => r.temp)), tmax: Math.max(...l.map(r => r.temp)),
    mm: l.reduce((a, r) => a + (r.mm || 0), 0), prob: l.some(r => r.prob != null) ? Math.max(...l.map(r => r.prob ?? 0)) : null,
    sun: l.some(r => r.sun != null) ? l.reduce((a, r) => a + (r.sun || 0), 0) : null,
    gust: Math.max(0, ...l.map(r => r.gust ?? 0)), icon: dayIcon(l)
  }));
  if (!days.length) throw new Error('keine Tageswerte');
  const gmin = Math.min(...days.map(d => d.tmin)), gmax = Math.max(...days.map(d => d.tmax)), span = Math.max(1, gmax - gmin);
  const box = $('#daysList'); box.className = 'days';
  daysRows = rows;
  box.innerHTML = days.map(x => {
    const dt = new Date(x.d), name = x.d === today ? 'Heute' : x.d === addDays(today, 1) ? 'Morgen' : WD[dt.getDay()];
    const rain = x.mm >= 0.1 ? `<b>${fmt(x.mm, x.mm >= 10 ? 0 : 1)} mm</b>` : 'trocken';
    const extra = [x.prob != null && x.prob >= 10 ? `${fmt(x.prob, 0)} %` : '', x.sun != null ? `${fmt(x.sun / 60, 1)} h Sonne` : '', x.gust >= 50 ? `Böen ${fmt(x.gust, 0)}` : ''].filter(Boolean).join(' · ');
    const l = (x.tmin - gmin) / span * 100, w = Math.max(4, (x.tmax - x.tmin) / span * 100);
    return `<div class="day" role="button" tabindex="0" aria-expanded="false" data-d="${x.d}" title="Stundenwerte anzeigen"><div class="dname">${name}<small>${dt.getDate()}.${dt.getMonth() + 1}.</small></div>`
      + `<div class="dico" title="${esc(ICON_TXT[x.icon] || '')}">${window.ICONS.weather(x.icon)}</div>`
      + `<div class="drain">${rain}${extra ? `<br>${extra}` : ''}</div>`
      + `<div class="dtemp"><span class="mn">${fmt(x.tmin, 0)}°</span><div class="tbar"><i style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></i></div><span class="mx">${fmt(x.tmax, 0)}°</span></div></div>`
      + `<div class="dhours" hidden></div>`;
  }).join('');
  if (openDay != null) toggleDay(box.querySelector(`.day[data-d="${openDay}"]`), true);
  $('#daysInfo').textContent = `DWD MOSMIX · Datenstand ${whenTxt(at)} · Tag antippen für Stundenwerte · Prozent = höchste stündliche Regenwahrscheinlichkeit`;
}
// Stundenwerte eines Tages (00–23 Uhr) unter der Tageszeile auf- und zuklappen; immer nur ein Tag offen
let daysRows = [], openDay = null;
function toggleDay(el, open = el && el.getAttribute('aria-expanded') !== 'true') {
  if (!el) { openDay = null; return; }
  document.querySelectorAll('#daysList .day[aria-expanded="true"]').forEach(o => { o.setAttribute('aria-expanded', 'false'); o.nextElementSibling.hidden = true; });
  openDay = open ? Number(el.dataset.d) : null;
  if (!open) return;
  const d = openDay, box = el.nextElementSibling, now = Date.now();
  const hrs = daysRows.filter(r => dayStart(r.t) === d);
  box.innerHTML = `<div class="hstrip">${hrs.map(r => {
    const dt = new Date(r.t), past = r.t + HOUR <= now;
    const rain = r.mm >= 0.1 ? fmt(r.mm, r.mm >= 10 ? 0 : 1) : '';
    const prob = r.prob != null && r.prob >= 10 ? `${fmt(r.prob, 0)} %` : '';
    return `<div class="hcell${past ? ' past' : ''}"><span class="hh">${String(dt.getHours()).padStart(2, '0')}</span>`
      + `<span class="hico" title="${esc(ICON_TXT[r.icon] || '')}">${window.ICONS.weather(r.icon || 'unknown')}</span>`
      + `<b class="ht">${fmt(r.temp, 0)}°</b><span class="hmm">${rain}</span><span class="hp">${prob}</span></div>`;
  }).join('')}</div>`
    + `<div class="hlegend small muted">Niederschlag in mm je Stunde · Regenwahrscheinlichkeit</div>`;
  box.hidden = false; el.setAttribute('aria-expanded', 'true');
  const cur = box.querySelector('.hcell:not(.past)'), strip = box.firstChild;   // heute: bei der aktuellen Stunde beginnen
  if (cur && cur.previousElementSibling) strip.scrollLeft = cur.offsetLeft - strip.offsetLeft;
}
function initDays() {
  const box = $('#daysList');
  box.onclick = (e) => { const el = e.target.closest('.day'); if (el) toggleDay(el); };
  box.onkeydown = (e) => { const el = e.target.closest('.day'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleDay(el); } };
}

// ---------- Textprognose + Winterhinweise (ICON-D2) ----------
async function loadDayText(lat, lon) {
  const vars = ['temperature_2m', 'dew_point_2m', 'precipitation', 'snowfall', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_gusts_10m', 'snowfall_height', 'freezing_level_height'];
  let model = MODELS.find(m => m.key === 'icon_d2'), res;
  const get = async (m) => {
    const r = await omHourly(lat, lon, m.key, vars, 3);
    const c = Object.fromEntries(vars.map(v => [v, r.col(v)]));
    const rows = r.time.map((t, i) => ({
      t: t * 1000, temp: c.temperature_2m[i], dew: c.dew_point_2m[i], mm: c.precipitation[i] ?? 0, snow: c.snowfall[i] ?? 0,
      code: c.weather_code[i], cloud: c.cloud_cover[i], wind: c.wind_speed_10m[i], gust: c.wind_gusts_10m[i],
      snowH: c.snowfall_height[i] ?? null, frzH: c.freezing_level_height[i] ?? null
    })).filter(x => x.temp != null);
    if (rows.length < 12) throw new Error('keine Daten');
    return { rows, at: r.at, elevation: r.elevation };
  };
  try { res = await get(model); }
  catch { model = MODELS.find(m => m.key === 'icon_seamless'); res = await get(model); }
  const run = await modelRun(model);
  const out = buildDayText(res.rows, Date.now());
  if (!out) { $('#dayText').textContent = 'Keine Textprognose verfügbar.'; $('#dayIcon').innerHTML = ''; $('#daySource').textContent = ''; }
  else {
    $('#dayIcon').innerHTML = window.ICONS.weather(out.icon);
    $('#dayText').textContent = out.text;
    $('#daySource').textContent = `${model.name.replace(' (2 km)', '')} · ${runTxt(run, res.at)}`;
  }
  renderWinter(buildWinter(res.rows, res.elevation, Date.now()));
}
// tomorrow: true = nächster Tag (Standard ab 20 Uhr). Gleiche Logik in wetter-android DailyForecast.dayText() – dort nachziehen.
function buildDayText(rows, now, tomorrow = new Date(now).getHours() >= 20) {
  const base = addDays(dayStart(now), tomorrow ? 1 : 0);
  const word = tomorrow ? 'Morgen' : 'Heute';
  const PER = [{ k: 'V', a: 6, b: 12 }, { k: 'N', a: 12, b: 18 }, { k: 'A', a: 18, b: 24 }];
  const periods = [];
  for (const p of PER) {
    const from = Math.max(base + p.a * HOUR, tomorrow ? 0 : now), to = base + p.b * HOUR;
    const list = rows.filter(r => r.t > from && r.t <= to);
    if (list.length < 2) continue;
    const av = (f) => avg(list.map(f).filter(x => x != null));
    const codes = list.map(r => r.code).filter(c => c != null);
    periods.push({
      k: p.k, list, mm: list.reduce((a, r) => a + (r.mm || 0), 0), cloud: av(r => r.cloud), wind: av(r => r.wind),
      gust: Math.max(0, ...list.map(r => r.gust ?? 0)), codes,
      fog: codes.filter(c => c === 45 || c === 48).length >= list.length / 2,
      tmax: Math.max(...list.map(r => r.temp)), tmin: Math.min(...list.map(r => r.temp))
    });
  }
  if (!periods.length) return null;
  const wetType = (p) => {
    const has = (f) => p.codes.some(f);
    if (has(c => c >= 95)) return 'thunder';
    if (p.mm < 0.2) return null;
    if (has(c => (c >= 71 && c <= 77) || c === 85 || c === 86)) return 'snow';
    if (has(c => [56, 57, 66, 67].includes(c))) return 'freezing';
    if (has(c => c >= 80 && c <= 82)) return 'shower';
    if (has(c => c >= 61 && c <= 65)) return p.mm / p.list.length >= 0.8 ? 'heavy' : 'rain';
    if (has(c => c >= 51 && c <= 55)) return 'drizzle';
    return 'rain';
  };
  const WET = { thunder: 'mit Gewittern', snow: 'mit Schneefall', freezing: 'mit gefrierendem Regen (Glättegefahr)', shower: 'mit Schauern', heavy: 'mit kräftigem Regen', rain: 'mit Regen', drizzle: 'mit Nieselregen' };
  const skyCls = (p) => p.fog ? 4 : (p.cloud ?? 50) < 20 ? 0 : (p.cloud ?? 50) < 45 ? 1 : (p.cloud ?? 50) < 75 ? 2 : 3;
  const SKY_DAY = ['sonnig', 'heiter', 'wolkig', 'bedeckt', 'neblig'], SKY_NIGHT = ['klar', 'überwiegend klar', 'wolkig', 'bedeckt', 'neblig'];
  for (const p of periods) p.wet = wetType(p);
  const anyWet = periods.some(p => p.wet);
  for (const p of periods) p.key = `${skyCls(p)}|${p.wet}`;
  const segs = [];
  for (const p of periods) { const last = segs[segs.length - 1]; if (last && last.key === p.key) last.k += p.k; else segs.push({ k: p.k, key: p.key, p }); }
  for (const sg of segs) {
    const c = skyCls(sg.p), w = sg.k === 'A' ? SKY_NIGHT[c] : SKY_DAY[c];
    sg.desc = sg.p.wet ? `${w} ${WET[sg.p.wet]}` : anyWet ? `${w} und trocken` : w;
  }
  const FIRST = { V: ' Vormittag', N: ' Nachmittag', A: ' Abend', VN: ' tagsüber', NA: ' ab dem Nachmittag', VNA: '' };
  const NEXT = { N: 'am Nachmittag', A: 'am Abend', NA: 'ab dem Nachmittag' };
  let text = segs.length === 1 ? `${word} ${segs[0].desc}` : `${word}${FIRST[segs[0].k] ?? ''} ${segs[0].desc}` + segs.slice(1).map(s => `, ${NEXT[s.k] ?? ''} ${s.desc}`).join('');
  const f = periods[0], l = periods[periods.length - 1];
  if (periods.length > 1 && l.wind - f.wind >= 8 && l.wind >= 15) text += ' bei auffrischendem Wind';
  else if (periods.length > 1 && f.wind - l.wind >= 8 && f.wind >= 15) text += ' bei nachlassendem Wind';
  else if (Math.max(...periods.map(p => p.wind ?? 0)) >= 30) text += ' bei kräftigem Wind';
  text += '.';
  if (!anyWet) text += ' Es bleibt trocken.';
  const gmax = Math.max(...periods.map(p => p.gust));
  if (gmax >= 75) text += ` Sturmböen bis ${fmt(gmax, 0)} km/h.`;
  else if (gmax >= 60) text += ` Stürmische Böen bis ${fmt(gmax, 0)} km/h.`;
  else if (gmax >= 45) text += ` Windböen bis ${fmt(gmax, 0)} km/h.`;
  const dayP = periods.filter(p => p.k !== 'A');
  if (dayP.length) text += ` Höchstwert ${fmt(Math.max(...dayP.map(p => p.tmax)), 0)} °C`;
  else text += ` Temperaturen um ${fmt((l.tmax + l.tmin) / 2, 0)} °C`;
  const night = rows.filter(r => r.t > addDays(base, 1) && r.t <= addDays(base, 1) + 7 * HOUR);
  if (night.length >= 3) text += `, in der Nacht ${fmt(Math.min(...night.map(r => r.temp)), 0)} °C`;
  text += '.';
  const wetP = periods.filter(p => p.wet).sort((a, b) => b.mm - a.mm)[0];
  const main = wetP || periods.find(p => p.k === 'N') || periods[0];
  const ICON_OF = { thunder: 'thunderstorm', snow: 'snow', freezing: 'sleet', shower: 'showers', heavy: 'rain', rain: 'rain', drizzle: 'rain' };
  const icon = main.wet ? ICON_OF[main.wet] : main.fog ? 'fog' : (main.cloud ?? 50) < 20 ? (main.k === 'A' ? 'clear-night' : 'clear-day') : (main.cloud ?? 50) < 75 ? (main.k === 'A' ? 'partly-cloudy-night' : 'partly-cloudy-day') : 'cloudy';
  return { text: text.replace(/\s+/g, ' ').trim(), icon };
}
// Winterhinweise für die nächsten 30 Stunden
function buildWinter(rows, elev, now) {
  const win = rows.filter(r => r.t > now && r.t <= now + 30 * HOUR);
  if (!win.length) return [];
  const out = [];
  const elevR = elev != null ? Math.round(elev / 10) * 10 : null;
  const round100 = (v) => Math.max(0, Math.round(v / 100) * 100);
  // Schneefallgrenze – nur wenn Niederschlag erwartet wird
  const wet = win.filter(r => (r.mm || 0) >= 0.1);
  const sh = wet.map(r => r.snowH ?? (r.frzH != null ? r.frzH - 300 : null)).filter(v => v != null);
  if (wet.length && sh.length && Math.min(...sh) < 1500) {
    const lo = round100(Math.min(...sh)), hi = round100(Math.max(...sh));
    let t = `Schneefallgrenze ${lo === hi ? `um ${lo}` : `zwischen ${lo} und ${hi}`} m`;
    if (elevR != null) {
      t += ` (Standort ${elevR} m)`;
      t += lo <= elevR ? ' – Schnee bzw. Schneeregen bis in den Ort' : lo <= elevR + 300 ? ' – Schnee knapp oberhalb des Ortes, im Ort Regen oder Schneeregen' : ' – im Ort Regen';
    }
    out.push({ icon: 'snowflake', text: t + '.' });
  }
  // Glätte
  const firstOf = (pred) => { for (let i = 0; i < win.length; i++) if (pred(win[i], i)) return win[i].t; return null; };
  const isSnowCode = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
  const all = rows.filter(r => r.t > now - 6 * HOUR && r.t <= now + 30 * HOUR);
  const hz = [];
  const tFrz = firstOf(r => [56, 57, 66, 67].includes(r.code));
  if (tFrz) hz.push({ t: tFrz, why: 'gefrierenden Regen (Glatteis)' });
  const tSnow = firstOf(r => ((r.snow || 0) > 0 || isSnowCode(r.code)) && r.temp <= 1.5);
  if (tSnow) hz.push({ t: tSnow, why: 'Schnee' });
  const tWet = firstOf(r => r.temp <= 0 && all.some(p => p.t < r.t && p.t >= r.t - 6 * HOUR && (p.mm || 0) >= 0.1 && p.temp > 0));
  if (tWet) hz.push({ t: tWet, why: 'überfrierende Nässe' });
  const tRime = firstOf(r => r.temp <= 0 && r.dew != null && r.temp - r.dew <= 1.5 && (r.mm || 0) < 0.1);
  if (tRime) hz.push({ t: tRime, why: 'Reif' });
  if (hz.length) {
    hz.sort((a, b) => a.t - b.t);
    out.push({ icon: 'ice', cls: 'ice', text: `Glättegefahr ab ${hourTxt(hz[0].t)} durch ${hz.map(h => h.why).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.` });
  }
  // Frost
  const tmin = Math.min(...win.map(r => r.temp));
  if (tmin <= 0) {
    const tm = win.find(r => r.temp === tmin).t, t0f = firstOf(r => r.temp <= 0);
    out.push({ icon: 'thermo', text: `Frost ab ${hourTxt(t0f)}, Tiefstwert ${fmt(tmin, 0)} °C gegen ${hourTxt(tm)}.` });
  } else if (tmin <= 3) {
    out.push({ icon: 'thermo', text: `Bodenfrost möglich – Tiefstwert in 2 m Höhe ${fmt(tmin, 0)} °C.` });
  }
  return out;
}
function renderWinter(items) {
  const box = $('#winterHint');
  if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = items.map(i => `<div class="${i.cls || ''}">${I(i.icon)}<span>${esc(i.text)}</span></div>`).join('');
}

// ---------- Warnungen ----------
const sevRank = (s) => ({ minor: 1, moderate: 2, severe: 3, extreme: 4 }[s] || 0);
async function loadWarnings(lat, lon) {
  const d = await getJSON(`${BS}/alerts?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`);
  const list = (d.alerts || []).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const box = $('#warnings'); box.innerHTML = '';
  if (!list.length) return;
  const place = d.location?.name ? ` für ${d.location.name}` : '';
  const dt = (s) => s ? new Date(s).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  for (const a of list) {
    const heat = /HITZE/i.test(`${a.event_de} ${a.headline_de}`);
    const el = document.createElement('div');
    el.className = `warn ${heat ? 'heat' : (a.severity || 'minor')}`;
    el.innerHTML = `<div class="w-title">${I(heat ? 'thermo' : 'warn')}${esc(a.headline_de || a.event_de)}</div>`
      + `<div class="w-time">${esc(dt(a.onset))}${a.expires ? ' – ' + esc(dt(a.expires)) : ''}${esc(place)} · antippen für Details</div>`
      + `<div class="w-det">${esc(a.description_de)}${a.instruction_de ? '\n\n' + esc(a.instruction_de) : ''}</div>`;
    el.onclick = () => el.classList.toggle('open');
    box.appendChild(el);
  }
  if (S.warnNotify) {
    let seen; try { seen = JSON.parse(localStorage.getItem(LS_WARN) || '[]'); } catch { seen = []; }
    for (const a of list) {
      const id = a.alert_id || a.id; if (!id || seen.includes(id)) continue;
      if (await notify(`DWD-Warnung: ${a.headline_de || a.event_de}`, a.description_de || '', `warn-${id}`, 'warn')) seen.push(id);
    }
    localStorage.setItem(LS_WARN, JSON.stringify(seen.slice(-50)));
  }
}

// ---------- Pollen ----------
let dwdPollen = null;
const isGermany = () => !S.loc || (S.loc.lat > 47.2 && S.loc.lat < 55.1 && S.loc.lon > 5.8 && S.loc.lon < 15.1 && (!S.loc.sub || /deutschland|germany/i.test(S.loc.sub)));
function autoPollenRegion(lat, lon) { let best = null, bd = Infinity; for (const r of POLLEN_REGIONS) { const d = distKm(lat, lon, r[2], r[3]); if (d < bd) { bd = d; best = r; } } return best; }
const regionOf = (id) => POLLEN_REGIONS.find(r => r[0] === Number(id));
async function getDwdPollen() {
  if (dwdPollen && Date.now() - dwdPollen.ts < 60 * MIN) return dwdPollen;
  const { data, at } = await fetchJSON(DWD_POLLEN);
  dwdPollen = { ts: Date.now(), at, data }; return dwdPollen;
}
const parseDwdTime = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };
const dayLabel = (t) => { const today = dayStart(Date.now()); return t === today ? 'Heute' : t === addDays(today, 1) ? 'Morgen' : `${WD[new Date(t).getDay()]} ${new Date(t).getDate()}.`; };
async function loadPollen(lat, lon) {
  const sel = POLLEN.filter(p => S.pollen.includes(p.k));
  if (!sel.length) { renderPollen(null, [], 'Keine Pollenart gewählt – über „Pollenarten wählen“ festlegen.'); return; }
  if (isGermany()) {
    try {
      const { data } = await getDwdPollen();
      const reg = S.pollenRegion !== 'auto' && regionOf(S.pollenRegion) ? regionOf(S.pollenRegion) : autoPollenRegion(lat, lon);
      const entry = (data.content || []).find(c => (c.partregion_id > 0 ? c.partregion_id : c.region_id) === reg[0]);
      if (!entry) throw new Error('Gebiet nicht im DWD-Datensatz');
      const upd = parseDwdTime(data.last_update);
      const shift = upd ? Math.max(0, Math.round((dayStart(Date.now()) - dayStart(upd)) / 86400000)) : 0;
      const keys = ['today', 'tomorrow', 'dayafter_to'].slice(shift);
      const days = keys.map((_, i) => dayLabel(addDays(dayStart(Date.now()), i)));
      const rows = sel.map(p => ({ name: p.name, vals: keys.map(k => PSTEP[entry.Pollen?.[p.k]?.[k]] ?? null) }));
      renderPollen(days, rows, `DWD Pollenflug-Gefahrenindex · Gebiet ${reg[1]}${S.pollenRegion === 'auto' ? ' (automatisch)' : ''} · Stand ${upd ? whenTxt(upd) : data.last_update}`);
      return;
    } catch (e) { console.warn('DWD-Pollen:', e.message); }
  }
  const om = sel.filter(p => p.om);
  const q = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: (om.length ? om : POLLEN.filter(p => p.om)).map(p => p.om).join(','), timezone: 'auto', timeformat: 'unixtime', forecast_days: '3' });
  const { data: d, at } = await fetchJSON(`${OM_AQ}?${q}`);
  const h = d.hourly || {}, t = (h.time || []).map(x => x * 1000);
  const base = dayStart(Date.now());
  const days = [0, 1, 2].map(i => dayLabel(addDays(base, i)));
  const level = (k, v) => {
    if (v == null) return null;
    const th = k === 'grass_pollen' ? [1, 5, 15, 30, 50, 100] : k === 'ragweed_pollen' || k === 'mugwort_pollen' ? [1, 3, 6, 10, 20, 40] : [1, 10, 30, 50, 100, 200];
    let s = 0; for (const x of th) if (v >= x) s += 0.5; return s;
  };
  const rows = sel.map(p => ({ name: p.name, vals: [0, 1, 2].map(i => {
    if (!p.om) return null;
    const vs = t.map((x, j) => x >= addDays(base, i) && x < addDays(base, i + 1) ? h[p.om]?.[j] : null).filter(v => v != null);
    return vs.length ? level(p.om, Math.max(...vs)) : null;
  }) }));
  renderPollen(days, rows, `Open-Meteo / CAMS (Modell, 11 km) · Stufen aus Pollenkonzentration abgeleitet · Datenstand ${whenTxt(at)}${isGermany() ? ' · DWD-Daten derzeit nicht abrufbar' : ''}`);
}
function renderPollen(days, rows, info) {
  const body = $('#pollenBody');
  $('#pollenScale').innerHTML = PTXT.map((t, i) => i % 2 === 0 ? `<span><i style="background:${PCOL[i]}"></i>${t}</span>` : '').join('') + '<span class="muted">(Zwischenstufen möglich)</span>';
  $('#pollenInfo').textContent = days ? info : '';
  if (!days) { body.className = 'small muted'; body.textContent = info; return; }
  let list = rows;
  if (S.pollenHideZero) list = rows.filter(r => r.vals.some(v => v != null && v > 0));
  const allZero = rows.every(r => r.vals.every(v => v == null || v === 0));
  if (!list.length) { body.className = 'small muted'; body.textContent = 'Für die gewählten Pollenarten wird keine Belastung erwartet.'; return; }
  const cell = (v) => {
    if (v == null) return '<td><div class="pna" title="keine Vorhersage">–</div></td>';
    const i = Math.round(v * 2);
    const bar = [1, 2, 3, 4, 5, 6].map(k => `<i style="${k <= i ? `background:${PCOL[i]}` : ''}"></i>`).join('');
    return `<td><div class="pcell" title="${PTXT[i]}"><div class="pbar">${bar}</div><div class="plabel">${PTXT[i]}</div></div></td>`;
  };
  body.className = '';
  body.innerHTML = `<table class="ptable"><thead><tr><th></th>${days.map(d => `<th>${esc(d)}</th>`).join('')}</tr></thead><tbody>`
    + list.map(r => `<tr><td class="pname">${esc(r.name)}</td>${r.vals.map(cell).join('')}</tr>`).join('') + '</tbody></table>'
    + (allZero ? '<div class="small muted">Derzeit keine Belastung – außerhalb der Blütezeit der gewählten Pollenarten.</div>' : '');
}
function initPollenDialog() {
  $('#pollenIco').innerHTML = I('flower');
  $('#pollenChecks').innerHTML = POLLEN.map(p => `<label class="check"><input type="checkbox" value="${p.k}"> ${esc(p.name)}</label>`).join('');
  const sync = () => $('#pollenChecks').querySelectorAll('input').forEach(c => c.checked = S.pollen.includes(c.value));
  const changed = () => { S.pollen = [...$('#pollenChecks').querySelectorAll('input:checked')].map(c => c.value); save(); reloadPollen(); };
  $('#pollenChecks').onchange = changed;
  $('#btnPollenAll').onclick = () => { S.pollen = POLLEN.map(p => p.k); sync(); changed(); };
  $('#btnPollenNone').onclick = () => { S.pollen = []; sync(); changed(); };
  const rs = $('#setPollenRegion');
  const fillRegions = () => {
    const auto = S.loc ? autoPollenRegion(S.loc.lat, S.loc.lon) : null;
    rs.innerHTML = `<option value="auto">automatisch${auto ? ` (${esc(auto[1])})` : ''}</option>` + POLLEN_REGIONS.map(r => `<option value="${r[0]}">${esc(r[1])}</option>`).join('');
    rs.value = String(S.pollenRegion);
  };
  rs.onchange = () => { S.pollenRegion = rs.value === 'auto' ? 'auto' : Number(rs.value); save(); reloadPollen(); };
  $('#setPollenHideZero').checked = S.pollenHideZero;
  $('#setPollenHideZero').onchange = (e) => { S.pollenHideZero = e.target.checked; save(); reloadPollen(); };
  $('#btnPollenCfg').onclick = () => { sync(); fillRegions(); $('#dlgPollen').showModal(); };
}
function reloadPollen() { if (S.loc) loadPollen(S.loc.lat, S.loc.lon).catch(e => renderPollen(null, [], `Pollenvorhersage nicht abrufbar (${e.message}).`)); }

// ---------- Favoriten ----------
const sameLoc = (a, b) => a && b && distKm(a.lat, a.lon, b.lat, b.lon) < 1;
const currentFav = () => S.favs.find(f => sameLoc(f, S.loc));
function renderFavBtn() {
  const f = currentFav();
  $('#btnFav').innerHTML = I(f ? 'starFill' : 'star');
  $('#btnFav').title = f ? `Favorit „${f.name}“ – antippen zum Entfernen` : 'Als Favorit speichern';
}
function toggleFav() {
  if (!S.loc) { openSearch(); return; }
  const f = currentFav();
  if (f) {
    const idx = S.favs.indexOf(f); S.favs.splice(idx, 1); save(); renderFavBtn();
    toast(`„${f.name}“ aus den Favoriten entfernt.`, 6000, { label: 'Rückgängig', fn: () => { S.favs.splice(idx, 0, f); save(); renderFavBtn(); } });
  } else {
    S.favs.push({ id: Date.now().toString(36), name: S.loc.name, sub: S.loc.sub || '', lat: S.loc.lat, lon: S.loc.lon, station: S.station || null });
    save(); renderFavBtn(); toast(`„${S.loc.name}“ als Favorit gespeichert.`);
  }
}
function syncFavStation() { const f = currentFav(); if (f) { f.station = S.station || null; save(); } }
function openPlaces() { renderFavList(); $('#dlgPlaces').showModal(); }
function renderFavList(editId = null) {
  const ul = $('#favList'); ul.innerHTML = '';
  $('#favHint').hidden = S.favs.length > 0;
  S.favs.forEach((f, i) => {
    const li = document.createElement('li');
    if (editId === f.id) {
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = f.name; inp.setAttribute('aria-label', 'Name');
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'ficon'; ok.innerHTML = I('ok'); ok.title = 'Speichern';
      const done = () => { const v = inp.value.trim(); if (v) { f.name = v; save(); if (sameLoc(f, S.loc)) { S.loc.name = v; save(); renderLoc(); } } renderFavList(); };
      ok.onclick = done; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { e.preventDefault(); renderFavList(); } };
      li.append(inp, ok); ul.appendChild(li); setTimeout(() => { inp.focus(); inp.select(); }, 0); return;
    }
    const main = document.createElement('button'); main.type = 'button'; main.className = 'fmain' + (sameLoc(f, S.loc) ? ' sel' : '');
    main.innerHTML = `<span class="fname">${esc(f.name)}</span><span class="fsub">${esc(f.sub || `${fmt(f.lat, 3)}, ${fmt(f.lon, 3)}`)}${f.station ? ` · Station ${esc(f.station.name)}` : ''}</span>`;
    main.onclick = () => { $('#dlgPlaces').close(); loadFav(f); };
    const up = document.createElement('button'); up.type = 'button'; up.className = 'ficon'; up.innerHTML = I('up'); up.title = 'Nach oben'; up.disabled = i === 0; up.style.opacity = i === 0 ? .35 : 1;
    up.onclick = () => { if (i > 0) { [S.favs[i - 1], S.favs[i]] = [S.favs[i], S.favs[i - 1]]; save(); renderFavList(); } };
    const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'ficon'; ed.innerHTML = I('edit'); ed.title = 'Umbenennen';
    ed.onclick = () => renderFavList(f.id);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'ficon del'; del.innerHTML = I('trash'); del.title = 'Löschen';
    del.onclick = () => {
      S.favs.splice(i, 1); save(); renderFavList(); renderFavBtn();
      toast(`„${f.name}“ gelöscht.`, 6000, { label: 'Rückgängig', fn: () => { S.favs.splice(i, 0, f); save(); renderFavList(); renderFavBtn(); } });
    };
    li.append(main, up, ed, del); ul.appendChild(li);
  });
}
function loadFav(f) { S.station = f.station || null; setLocation(f.lat, f.lon, { name: f.name, sub: f.sub }, true); }

// ---------- Karte ----------
let map = null, marker, stMarker, satLayer, activeBase = null;
const baseLayers = {};
const hasLeaflet = () => typeof window.L !== 'undefined';
function bkg(layer) {
  const l = L.tileLayer.wms(BKG_WMS, { layers: layer, format: 'image/png', version: '1.3.0', tileSize: 512, maxZoom: 19, attribution: BKG_ATTR });
  let err = 0;
  l.on('tileerror', () => { if (++err === 6 && activeBase !== 'osm') { toast('basemap.de nicht erreichbar – zeige OpenStreetMap.'); setBase('osm', false); } });
  l.on('tileload', () => { err = 0; });
  return l;
}
const BASES = {
  bm_grau: () => bkg('de_basemapde_web_raster_grau'),
  bm_farbe: () => bkg('de_basemapde_web_raster_farbe'),
  osm: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTR })
};
function setBase(key, persist = true) {
  if (!map) return;
  if (!BASES[key]) key = 'bm_grau';
  if (activeBase === key) return;
  if (activeBase) map.removeLayer(baseLayers[activeBase]);
  (baseLayers[key] ||= BASES[key]()).addTo(map);
  baseLayers[key].bringToBack();
  activeBase = key;
  if (persist) { S.basemap = key; save(); }
}
let SAT = { ...SAT_DEFAULT, source: 'Standard' };
async function discoverSatLayers() {
  try { const c = JSON.parse(localStorage.getItem(LS_SAT) || 'null'); if (c && Date.now() - c.ts < 7 * 86400000) { SAT = c.layers; return; } } catch { }
  try {
    const r = await fetch(`${SAT_WMS}?service=WMS&request=GetCapabilities&version=1.3.0`);
    if (!r.ok) throw new Error();
    const xml = await r.text();
    const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]).filter(n => n.includes(':'));
    const pick = (cands, re) => cands.find(c => names.includes(c)) || names.find(n => re.test(n));
    const day = pick(['mtg_fd:rgb_geocolour', 'mtg_fd:rgb_truecolour', 'mtg_fd:rgb_naturalcolour'], /^mtg_fd:rgb_(true|natural)/i);
    const night = pick(['mtg_fd:ir105_hrfi', 'mtg_fd:ir105'], /^mtg_fd:.*ir_?105/i) || pick([], /^mtg_fd:.*ir/i);
    if (day || night) { SAT = { day: day || SAT_DEFAULT.day, night: night || day || SAT_DEFAULT.night, source: 'EUMETSAT-Katalog' }; localStorage.setItem(LS_SAT, JSON.stringify({ ts: Date.now(), layers: SAT })); }
  } catch { }
}
function satLayerName() {
  const day = S.satDay.trim() || SAT.day, night = S.satNight.trim() || SAT.night;
  if (S.sat === 'day') return day;
  if (S.sat === 'night') return night;
  const p = S.loc || { lat: 50, lon: 10 };
  return sunElevation(p.lat, p.lon) > 3 ? day : night;
}
const isDayLayer = () => satLayerName() === (S.satDay.trim() || SAT.day);
function initMap() {
  if (!hasLeaflet()) { $('#map').innerHTML = '<div class="nomap">Karte konnte nicht geladen werden (keine Verbindung zum Kartendienst). Bitte später erneut öffnen.</div>'; return; }
  map = L.map('map', { maxZoom: 14 }).setView([49.6, 11.0], 8);
  setBase(S.basemap, false);
  map.attributionControl.addAttribution('Radar: <a href="https://www.dwd.de/" target="_blank" rel="noopener">DWD</a>');
  satLayer = L.tileLayer.wms(SAT_WMS, { layers: satLayerName(), format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, opacity: 0.85, zIndex: 10, attribution: 'Satellit © <a href="https://www.eumetsat.int/" target="_blank" rel="noopener">EUMETSAT</a>' });
  let satErr = 0;
  satLayer.on('tileerror', () => { if (++satErr === 4) toast(`Satellitenebene „${satLayerName()}“ nicht abrufbar – in den Einstellungen andere Ebene wählen.`, 6000); });
  satLayer.on('tileload', () => { satErr = 0; });
  map.on('contextmenu', (e) => {
    const div = document.createElement('div'), b = document.createElement('button');
    div.innerHTML = `<div style="margin-bottom:.4rem">${fmt(e.latlng.lat, 4)}, ${fmt(e.latlng.lng, 4)}</div>`;
    b.textContent = 'Als Standort setzen';
    b.onclick = async () => { map.closePopup(); setLocation(e.latlng.lat, e.latlng.lng, await reverseGeocode(e.latlng.lat, e.latlng.lng)); };
    div.appendChild(b); L.popup().setLatLng(e.latlng).setContent(div).openOn(map);
  });
}

// ---- Radar-Animation (DWD-WMS mit TIME-Parameter, 10-Minuten-Schritte, −1 h bis +2 h) ----
const anim = { times: [], idx: 0, nowIdx: 0, layers: new Map(), timer: null, hold: 0 };
let radarTimes = [];        // Zeitpunkte aus dem Bright-Sky-Radar (gleiches DWD-RV-Produkt)
let capCache = null;
const radarVisible = () => isOn('map') && (S.mapMode === 'radar' || S.mapMode === 'both');
async function capTimes() {
  if (capCache && Date.now() - capCache.ts < 5 * MIN) return capCache.times;
  const r = await fetch(DWD_RADAR_CAPS); if (!r.ok) throw new Error();
  const xml = await r.text();
  const m = xml.match(/<Dimension[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/i); if (!m) throw new Error();
  const times = [];
  for (const part of m[1].trim().split(',')) {
    const iv = part.split('/');
    if (iv.length === 3) {
      const a = Date.parse(iv[0]), b = Date.parse(iv[1]), st = (iv[2].match(/PT(\d+)M/) || [0, 5])[1] * MIN;
      for (let t = Math.max(a, Date.now() - 3 * HOUR); t <= b; t += st) times.push(t);
    } else { const t = Date.parse(part); if (isFinite(t)) times.push(t); }
  }
  capCache = { ts: Date.now(), times }; return times;
}
async function updateAnimFrames() {
  if (!map) return;
  const now = Date.now();
  let times = radarTimes.length ? radarTimes.slice() : null;
  if (!times) { try { times = await capTimes(); } catch { times = null; } }
  if (!times || !times.length) {   // Zeitpunkte schätzen: 5-Minuten-Raster, letztes Bild ca. 5 min alt
    const base = Math.floor(now / (5 * MIN)) * 5 * MIN - 5 * MIN; times = [];
    for (let k = -12; k <= 24; k++) times.push(base + k * 5 * MIN);
  }
  times = [...new Set(times)].filter(t => t >= now - 62 * MIN && t <= now + 125 * MIN).sort((a, b) => a - b);
  if (!times.length) return;
  let ni = 0; times.forEach((t, i) => { if (t <= now + MIN) ni = i; });
  const sel = times.filter((t, i) => (((i - ni) % 2) + 2) % 2 === 0);
  const keep = new Set(sel);
  for (const [t, l] of anim.layers) if (!keep.has(t)) { map.removeLayer(l); anim.layers.delete(t); }
  const curT = anim.times[anim.idx];
  anim.times = sel; anim.nowIdx = sel.indexOf(times[ni]);
  $('#animSlider').max = String(sel.length - 1);
  showFrame(anim.timer && sel.includes(curT) ? sel.indexOf(curT) : anim.nowIdx);
}
function animLayer(t) {
  if (!anim.layers.has(t)) {
    const l = L.tileLayer.wms(DWD_WMS, { layers: DWD_RADAR, format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, opacity: 0, zIndex: 20, time: isoZ(t) });
    anim.layers.set(t, l);
    if (radarVisible()) l.addTo(map);
  }
  return anim.layers.get(t);
}
function showFrame(i) {
  if (!map || !anim.times.length) return;
  anim.idx = Math.max(0, Math.min(anim.times.length - 1, i));
  const t = anim.times[anim.idx];
  if (radarVisible()) {
    const cur = animLayer(t);
    for (let k = 1; k <= 2; k++) if (anim.times[anim.idx + k]) animLayer(anim.times[anim.idx + k]);   // vorladen
    for (const l of anim.layers.values()) l.setOpacity(l === cur ? 0.8 : 0);
  }
  $('#animSlider').value = String(anim.idx);
  const diff = Math.round((t - anim.times[anim.nowIdx]) / MIN), el = $('#animTime');
  el.textContent = diff > 0 ? `${hhmm(t)} · Prognose +${diff} min` : diff < 0 ? `${hhmm(t)} · vor ${-diff} min` : `${hhmm(t)} · aktuell`;
  el.classList.toggle('fc', diff > 0);
}
function playAnim() {
  if (anim.timer) { stopAnim(); return; }
  if (!anim.times.length) return;
  if (anim.idx >= anim.times.length - 1) showFrame(0);
  $('#btnPlay').innerHTML = I('pause'); $('#btnPlay').title = 'Animation anhalten';
  anim.timer = setInterval(() => {
    if (anim.hold > 0) { anim.hold--; return; }
    if (anim.idx >= anim.times.length - 1) { anim.hold = 2; showFrame(0); return; }
    showFrame(anim.idx + 1);
    if (anim.idx === anim.times.length - 1) anim.hold = 2;
  }, 650);
}
function stopAnim() {
  clearInterval(anim.timer); anim.timer = null; anim.hold = 0;
  $('#btnPlay').innerHTML = I('play'); $('#btnPlay').title = 'Animation abspielen';
}
function windyUrl() {
  const p = S.loc || { lat: 49.6, lon: 11 };
  const q = new URLSearchParams({ lat: p.lat.toFixed(3), lon: p.lon.toFixed(3), detailLat: p.lat.toFixed(3), detailLon: p.lon.toFixed(3), zoom: '7', level: 'surface', overlay: 'wind', product: 'ecmwf', menu: '', message: 'true', marker: 'true', calendar: 'now', pressure: 'true', type: 'map', location: 'coordinates', detail: '', metricWind: 'km/h', metricTemp: '°C', radarRange: '-1' });
  return `https://embed.windy.com/embed2.html?${q}`;
}
function setMapMode(mode, persist = true) {
  S.mapMode = mode; if (persist) save();
  const tabs = { radar: '#tabRadar', sat: '#tabSat', both: '#tabBoth', wind: '#tabWind' };
  Object.entries(tabs).forEach(([k, sel]) => $(sel).classList.toggle('active', k === mode));
  const wind = mode === 'wind', radar = mode === 'radar' || mode === 'both';
  $('#map').hidden = wind; $('#windy').hidden = !wind; $('#animBar').hidden = !radar;
  $('#radarLegend').style.display = radar ? '' : 'none';
  $('#mapTitle').textContent = { radar: 'Regenradar', sat: 'Satellitenbild', both: 'Radar & Satellit', wind: 'Windströmung' }[mode];
  if (!radar) stopAnim();
  if (wind) {
    const box = $('#windy'), url = windyUrl();
    if (!box.firstChild || box.dataset.src !== url) { box.innerHTML = `<iframe src="${url}" title="Windkarte von Windy.com" loading="lazy" allowfullscreen></iframe>`; box.dataset.src = url; }
  } else if (map) {
    for (const l of anim.layers.values()) { if (radar) l.addTo(map); else map.removeLayer(l); }
    if (radar) showFrame(anim.idx);
    if (mode !== 'radar') { satLayer.setParams({ layers: satLayerName() }, true); satLayer.addTo(map); } else map.removeLayer(satLayer);
    setTimeout(() => map.invalidateSize(), 50);
  }
  updateMapTime();
}
// Karte im Vollbild: Karte füllt den Bildschirm, Knopf oben rechts, Zurück-Taste oder Esc kehren zurück
const mapCard = () => document.querySelector('section[data-sec="map"]');
function setMapFull(on) {
  const card = mapCard();
  if (card.classList.contains('full') === on) return;
  card.classList.toggle('full', on); document.body.classList.toggle('map-open', on);
  const b = $('#btnMapFull'); b.innerHTML = I(on ? 'collapse' : 'expand');
  b.title = b.ariaLabel = on ? 'Vollbild beenden' : 'Karte im Vollbild';
  if (on) history.pushState({ mapFull: 1 }, '');
  else if (history.state && history.state.mapFull) history.back();
  setTimeout(() => map && map.invalidateSize(), 60);
}
window.appBack = () => { if (!mapCard().classList.contains('full')) return false; setMapFull(false); return true; };   // Android-Zurück-Taste
function initMapFull() {
  $('#btnMapFull').innerHTML = I('expand');
  $('#btnMapFull').onclick = () => setMapFull(!mapCard().classList.contains('full'));
  window.addEventListener('popstate', () => { if (!(history.state && history.state.mapFull)) setMapFull(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]') && window.appBack()) e.preventDefault(); });
}
function updateMapTime() {
  const m = S.mapMode, parts = [];
  if (m === 'wind') parts.push('Windy.com · ECMWF-Modell');
  if (m === 'radar' || m === 'both') parts.push('DWD-Radar, 10-Minuten-Schritte');
  if (m === 'sat' || m === 'both') parts.push(`Satellit ${isDayLayer() ? 'Echtfarben' : 'Infrarot'} (ca. 10–20 min Verzug)`);
  $('#mapTime').textContent = parts.join(' · ');
}
function refreshSat() { if (map && satLayer) satLayer.setParams({ _t: Math.floor(Date.now() / (5 * MIN)), layers: satLayerName() }); }
function drawMarker() {
  if (!S.loc || !map) return;
  const ll = [S.loc.lat, S.loc.lon];
  if (!marker) marker = L.marker(ll, { title: 'Standort' }).addTo(map); else marker.setLatLng(ll);
  drawStationMarker();
}
function drawStationMarker() {
  if (!map) return;
  if (stMarker) { map.removeLayer(stMarker); stMarker = null; }
  if (S.station?.lat != null) stMarker = L.circleMarker([S.station.lat, S.station.lon], { radius: 6, color: '#0b5cab', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`Station ${S.station.name}`).addTo(map);
}

// ---------- Regen in 2 Stunden (Bright Sky /radar) ----------
const RAIN_RAW = 5, NEAR_KM = 25, LOC_KM = 1.5;
async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const s = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function u16(bytes, le) { const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const o = new Uint16Array(bytes.byteLength / 2); for (let i = 0; i < o.length; i++) o[i] = dv.getUint16(i * 2, le); return o; }
const bad = (a) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] > 2500 && a[i] < 65000) n++; return n; };
async function loadRadar(lat, lon) {
  const now = Date.now();
  const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), distance: String((NEAR_KM + 2) * 1000), date: new Date(now - 65 * MIN).toISOString(), last_date: new Date(now + 125 * MIN).toISOString(), format: 'DecompressionStream' in window ? 'compressed' : 'plain' });
  const d = await getJSON(`${BS}/radar?${q}`);
  const recs = (d.radar || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!recs.length) throw new Error('keine Radardaten');
  let w, h, le = null; const frames = [];
  for (const r of recs) {
    let data; const p = r.precipitation_5;
    if (Array.isArray(p)) { h = p.length; w = p[0].length; data = new Uint16Array(w * h); for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) data[yy * w + xx] = p[yy][xx] ?? 0; }
    else { const b = await inflate(p); if (le === null) le = bad(u16(b, true)) <= bad(u16(b, false)); data = u16(b, le); if (d.bbox) { h = d.bbox[2] - d.bbox[0] + 1; w = d.bbox[3] - d.bbox[1] + 1; } else w = h = Math.round(Math.sqrt(data.length)); }
    if (data.length !== w * h) throw new Error('unerwartetes Radar-Gitter');
    frames.push({ t: new Date(r.timestamp).getTime(), data });
  }
  let px = (w - 1) / 2, py = (h - 1) / 2;
  if (d.latlon_position && typeof d.latlon_position.x === 'number') { px = d.latlon_position.x; py = d.latlon_position.y; if (d.bbox && (px >= w || py >= h)) { px -= d.bbox[1]; py -= d.bbox[0]; } }
  const rot = lon - 10;
  const st = frames.map(f => {
    let loc = 0, locSum = 0, locN = 0, minD = Infinity, minB = null;
    for (let yy = Math.max(0, Math.floor(py - NEAR_KM)); yy <= Math.min(h - 1, Math.ceil(py + NEAR_KM)); yy++)
      for (let xx = Math.max(0, Math.floor(px - NEAR_KM)); xx <= Math.min(w - 1, Math.ceil(px + NEAR_KM)); xx++) {
        const dx = xx - px, dy = py - yy, dist = Math.hypot(dx, dy); if (dist > NEAR_KM) continue;
        const v = f.data[yy * w + xx]; if (v >= 2500) continue;
        if (dist <= LOC_KM) { if (v > loc) loc = v; locSum += v; locN++; }
        if (v >= RAIN_RAW && dist < minD) { minD = dist; minB = (deg(Math.atan2(dx, dy)) + rot + 360) % 360; }
      }
    return { t: f.t, loc, mean: locN ? locSum / locN : 0, minD: isFinite(minD) ? minD : null, minB };
  });
  radarTimes = st.map(s => s.t);
  let ni = 0; st.forEach((s, i) => { if (s.t <= now + MIN) ni = i; });
  const cur = st[ni]; let eta = null, until = null;
  if (cur.loc < RAIN_RAW) { for (let i = ni + 1; i < st.length; i++) if (st[i].loc >= RAIN_RAW) { eta = Math.max(0, Math.round((st[i].t - now) / MIN)); break; } }
  else { for (let i = ni + 1; i < st.length; i++) if (st[i].loc < RAIN_RAW) { until = Math.round((st[i].t - now) / MIN); break; } }
  return { st, ni, t: cur.t, atLoc: cur.loc >= RAIN_RAW, mmh: cur.loc * 0.12, eta, until, minD: cur.minD, minB: cur.minB };
}
const rainCol = (mmh) => mmh < 0.5 ? '#9fd3ff' : mmh < 2 ? '#2f7fff' : mmh < 10 ? '#f5c400' : '#e0282e';
let lastNowcast;
function renderNowcast(r) {
  lastNowcast = r;
  if (sceneRainNow !== !!r?.atLoc) { sceneRainNow = !!r?.atLoc; renderScene(); }
  const el = $('#rainHint');
  if (!r) { el.className = 'rainhint small'; el.innerHTML = ''; $('#ncChart').innerHTML = ''; $('#ncInfo').textContent = 'Radardaten derzeit nicht abrufbar.'; return; }
  let cls, txt;
  if (r.atLoc) { cls = 'danger'; txt = `Es regnet am Standort (ca. ${fmt(r.mmh)} mm/h)` + (r.until != null ? ` – laut Radarvorhersage vorbei in ~${r.until} min` : ' – hält laut Radarvorhersage über 2 h an'); }
  else if (r.eta != null) {
    cls = 'danger'; txt = `Regen erreicht den Standort in ca. ${r.eta} min (gegen ${hhmm(Date.now() + r.eta * MIN)})`;
    rainNotify(`Regen in ca. ${r.eta} min`, `Laut DWD-Radarvorhersage gegen ${hhmm(Date.now() + r.eta * MIN)}.`);
  } else if (r.minD != null) { cls = 'warn'; txt = `Regen ${fmt(r.minD, 0)} km ${dirName(r.minB)} – laut Radarvorhersage nicht am Standort in den nächsten 2 h`; }
  else { cls = 'ok'; txt = `Kein Regen im Umkreis von ${NEAR_KM} km – auch in den nächsten 2 h nicht erwartet`; }
  el.className = `rainhint small ${cls}`;
  el.innerHTML = `${I(cls === 'ok' ? 'check' : 'rainIco')}<span>${esc(txt)}</span>`;

  // 5-Minuten-Diagramm
  const t0 = r.st[r.ni].t, fr = r.st.slice(r.ni).filter(s => s.t <= t0 + 120 * MIN);
  const W = Math.max(300, Math.round($('#ncChart').clientWidth || 600)), PADL = 30, PADR = 6, TOP = 10, BH = 64, HGT = TOP + BH + 18;
  const bw = (W - PADL - PADR) / Math.max(fr.length, 1);
  const yv = (v) => Math.sqrt(Math.min(v, 10) / 10) * BH;
  let svg = '';
  for (const [v, l] of [[0.5, '0,5'], [2, '2'], [10, '10']]) svg += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${TOP + BH - yv(v)}" y2="${TOP + BH - yv(v)}"/><text class="lbl" x="${PADL - 4}" y="${TOP + BH - yv(v) + 3}" style="text-anchor:end">${l}</text>`;
  svg += `<text class="lbl" x="${PADL + 3}" y="${TOP + 9}" style="text-anchor:start">mm/h</text>`;
  svg += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${TOP + BH}" y2="${TOP + BH}" style="stroke:var(--line2)"/>`;
  let total = 0;
  fr.forEach((s, i) => {
    const v = s.mean * 0.12; total += v * 5 / 60;
    const x = PADL + i * bw;
    if (v >= 0.1) { const hh = Math.max(2, yv(v)); svg += `<rect x="${(x + 0.6).toFixed(1)}" y="${(TOP + BH - hh).toFixed(1)}" width="${Math.max(1, bw - 1.2).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${rainCol(v)}"><title>${hhmm(s.t)} Uhr: ${fmt(v)} mm/h</title></rect>`; }
    const mins = Math.round((s.t - t0) / MIN);
    if (mins % 30 === 0 && (i === 0 || x + bw / 2 < W - PADR - 16)) svg += `<text class="lbl" x="${x + (i === 0 ? 0 : bw / 2)}" y="${TOP + BH + 13}" style="text-anchor:${i === 0 ? 'start' : 'middle'}">${i === 0 ? 'jetzt' : hhmm(s.t)}</text>`;
  });
  $('#ncChart').innerHTML = `<svg viewBox="0 0 ${W} ${HGT}" width="${W}" height="${HGT}" role="img" aria-label="Niederschlag in 5-Minuten-Schritten">${svg}</svg>`;
  $('#ncInfo').textContent = (total >= 0.05 ? `Summe in 2 h ca. ${fmt(total)} mm` : 'Kein nennenswerter Niederschlag am Standort erwartet') + ` · DWD-Radar mit Vorhersage, Bild ${hhmm(r.t)} Uhr`;
}
async function rainNotify(title, body) {
  if (NATIVE) return;   // die Android-App meldet Regen selbst (Umkreis, Stärke, Richtung) – auch im Hintergrund
  const last = Number(localStorage.getItem(LS_RAIN) || 0);
  if (Date.now() - last < 60 * MIN) return;
  if (await notify(title, body, 'rain', 'rain')) localStorage.setItem(LS_RAIN, String(Date.now()));
}
async function notify(title, body, tag, kind) {
  const allowed = kind === 'rain' ? S.notify : kind === 'warn' ? S.warnNotify : true;
  if (!allowed || notifyPermission() !== 'granted') return false;
  if (NATIVE) return !!native('notify', tag, title, body);
  const o = { body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag, renotify: true };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification(title, o); return true; } } catch { }
  try { new Notification(title, o); return true; } catch { return false; }
}

// ---------- Standort ----------
async function reverseGeocode(lat, lon) {
  try {
    const d = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&accept-language=de`);
    const a = d.address || {};
    return { name: a.city || a.town || a.village || a.municipality || a.suburb || d.name || `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: [a.state, a.country].filter(Boolean).join(', ') };
  } catch { return { name: `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: '' }; }
}
function parseCoords(q) {
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/) || q.match(/^\s*(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
async function doSearch() {
  const q = $('#searchInput').value.trim(), ul = $('#searchResults'); ul.innerHTML = ''; if (!q) return;
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
  if (!('geolocation' in navigator)) { openSearch(); return; }
  navigator.geolocation.getCurrentPosition(async p => {
    const lat = p.coords.latitude, lon = p.coords.longitude;
    const fav = S.favs.find(f => sameLoc(f, { lat, lon }));
    if (fav) loadFav(fav); else { S.station = null; setLocation(lat, lon, await reverseGeocode(lat, lon)); }
    S.gpsLoc = { lat, lon, name: S.loc?.name || '' }; save();   // für die Tagesvorhersage „Mein Standort“
  }, () => { if (S.loc) toast(`Standort nicht ermittelbar – verwende „${S.loc.name}“.`); else { toast('Standort nicht ermittelbar – bitte Ort suchen.'); openSearch(); } },
  { timeout: 15000, maximumAge: 5 * MIN });
}
function setLocation(lat, lon, info, keepStation = false) {
  if (!keepStation) {
    const fav = S.favs.find(f => sameLoc(f, { lat, lon }));
    if (fav) { S.station = fav.station || null; info = { name: fav.name, sub: fav.sub }; }
    else if (S.station?.lat != null && distKm(lat, lon, S.station.lat, S.station.lon) > 60) { S.station = null; }
  }
  S.loc = { lat, lon, name: info?.name || `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: info?.sub || '' }; save();
  mosmixCache = null; radarTimes = [];
  renderLoc(); drawMarker(); drawStationMarker(); if (map) map.setView([lat, lon], 9);
  if (S.mapMode === 'wind') setMapMode('wind', false);
  refresh();
}
function renderLoc() {
  $('#locName').textContent = S.loc ? S.loc.name : 'Kein Standort';
  $('#locSub').textContent = S.loc ? (S.loc.sub || `${fmt(S.loc.lat, 3)}, ${fmt(S.loc.lon, 3)}`) : 'Standort ermitteln oder suchen';
  renderFavBtn();
}

// ---------- Aktualisierung (nur eingeschaltete Abschnitte) ----------
let busy = false, again = false;
async function refresh() {
  if (!S.loc) return;
  if (busy) { again = true; return; }
  busy = true; $('#btnRefresh').classList.add('spin');
  const { lat, lon } = S.loc; offlineHits = 0;
  const jobs = [];
  if (isOn('warnings')) jobs.push(loadWarnings(lat, lon).catch(() => { $('#warnings').innerHTML = ''; }));
  if (isOn('now')) { renderSun(); jobs.push(loadCurrent(lat, lon).catch(e => { $('#nowStation').textContent = `Aktuelle Werte nicht abrufbar (${e.message})`; })); }
  else if (S.scene) jobs.push(getJSON(`${BS}/current_weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`).then(d => { sceneWx = d.weather; renderScene(); }).catch(() => {}));
  const radarJob = isOn('nowcast') ? loadRadar(lat, lon).then(renderNowcast).catch(() => renderNowcast(null)) : Promise.resolve();
  jobs.push(radarJob);
  if (isOn('daytext')) jobs.push(loadDayText(lat, lon).catch(e => { $('#dayText').textContent = `Textprognose nicht abrufbar (${e.message}).`; renderWinter([]); }));
  if (isOn('chart')) jobs.push(loadForecast(lat, lon).catch(showForecastError));
  if (isOn('days')) jobs.push(loadDays(lat, lon).catch(e => { $('#daysList').className = 'days small muted'; $('#daysList').textContent = `Tagesübersicht nicht abrufbar (${e.message}).`; $('#daysInfo').textContent = ''; }));
  if (isOn('map')) { refreshSat(); jobs.push(radarJob.then(updateAnimFrames)); }
  if (isOn('pollen')) jobs.push(loadPollen(lat, lon).catch(e => renderPollen(null, [], `Pollenvorhersage nicht abrufbar (${e.message}).`)));
  await Promise.allSettled(jobs);
  $('#offline').hidden = !(offlineHits > 0 || !navigator.onLine);
  busy = false; $('#btnRefresh').classList.remove('spin');
  if (again) { again = false; refresh(); }
}
let timer;
const schedule = () => { clearInterval(timer); timer = setInterval(refresh, S.intervalMin * MIN); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); else stopAnim(); });
window.addEventListener('online', () => refresh());
window.addEventListener('offline', () => { $('#offline').hidden = false; });

// ---------- Einstellungen ----------
function initSettings() {
  const bind = (sel, key, conv = v => v, after) => {
    const el = $(sel);
    if (el.type === 'checkbox') el.checked = S[key]; else el.value = String(S[key] ?? '');
    el.onchange = async () => {
      S[key] = el.type === 'checkbox' ? el.checked : conv(el.value); save(); after?.();
    };
  };
  bind('#setBasemap', 'basemap', v => v, () => setBase(S.basemap));
  const satChanged = () => { if (S.mapMode !== 'wind') setMapMode(S.mapMode, false); updateMapTime(); };
  bind('#setSat', 'sat', v => v, satChanged);
  bind('#setSatDay', 'satDay', v => v.trim(), satChanged);
  bind('#setSatNight', 'satNight', v => v.trim(), satChanged);
  bind('#setInterval', 'intervalMin', Number, schedule);
  bind('#setAuto', 'autoLocate');
  initNotifyControls();
  bind('#setTheme', 'theme', v => v, applyTheme);
  bind('#setScene', 'scene', v => v, renderScene);
  bind('#setGlass', 'glass', Number, applyGlass);
  $('#setGlass').oninput = (e) => { S.glass = Number(e.target.value); applyGlass(); };   // live beim Ziehen, gespeichert bei onchange
  document.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => { S.theme = b.dataset.theme; save(); applyTheme(); });
  $('#btnLayout').innerHTML = `${I('layout')} Startseite: Abschnitte auswählen und sortieren`;
  $('#btnLayout').onclick = () => { $('#dlgSettings').close(); openLayout(false); };
  $('#btnTestNotify').onclick = async () => {
    if (notifyPermission() === 'default') await requestNotifyPermission();
    if (!(await notify('Test: Regen in ca. 20 min', 'So sieht ein Regenhinweis aus.', 'test', 'test'))) toast('Benachrichtigungen sind nicht erlaubt.');
  };
}

// Benachrichtigungen: Einstellungen und Einrichtungsassistent teilen sich die Bedienelemente (data-key).
// Umkreis, Stärke und Unwetter im Umkreis gibt es nur in der Android-App (Hintergrundprüfung).
const NOTIFY_KEYS = ['notify', 'warnNotify', 'stormNotify', 'dailyEve', 'dailyMorn'];
function initNotifyControls() {
  $('#wizNotify').appendChild($('#notifyBlock').cloneNode(true)).removeAttribute('id');
  document.querySelectorAll('.notify-block [data-key]').forEach(el => el.onchange = async () => {
    const key = el.dataset.key;
    if (el.type === 'checkbox' && el.checked && NOTIFY_KEYS.includes(key) && await requestNotifyPermission() !== 'granted') {
      el.checked = false; toast('Benachrichtigungen nicht erlaubt.'); return;
    }
    S[key] = el.type === 'checkbox' ? el.checked : 'num' in el.dataset ? Number(el.value) : el.value;
    save(); syncNotifyControls();
  });
  document.querySelectorAll('.notify-block [data-daily-test]').forEach(b => b.onclick = () => {
    toast('Tagesvorhersage wird abgerufen …');
    native('dailyTest', b.dataset.dailyTest === 'eve');
  });
  document.querySelectorAll('.notify-block [data-open]').forEach(b => b.onclick = () => native('openSettings', b.dataset.open));
  window.__dailyTest = (msg) => { toast(msg, 6000); syncNotifyControls(); };
  syncNotifyControls();
}
// Status der Tagesvorhersage aus der Android-App: nächste und letzte Meldung
function dailyStatusText() {
  const st = NATIVE && native('dailyStatus');
  if (!st) return '';
  const part = (k, label) => {
    if (!S[k]) return '';
    const s = st[k] || {}, bits = [];
    bits.push(s.next ? `nächste ${whenTxt(s.next)}` : 'nicht geplant');
    if (s.lastAt) bits.push(`zuletzt ${whenTxt(s.lastAt)}: ${s.last}`);
    return `${label}: ${bits.join(' · ')}`;
  };
  return [part('dailyEve', 'Abends'), part('dailyMorn', 'Morgens'), st.exact ? '' : 'Genaue Wecker sind nicht erlaubt – die Meldung kann sich verspäten.'].filter(Boolean).join('\n');
}
function syncNotifyControls() {
  document.querySelectorAll('.notify-block [data-key=dailyPlace]').forEach(sel => {
    const gps = S.gpsLoc ? ` (zuletzt: ${S.gpsLoc.name || 'GPS'})` : '';
    sel.innerHTML = `<option value="gps">Mein Standort${esc(gps)}</option>` + S.favs.map(f => `<option value="${esc(f.id)}">★ ${esc(f.name)}</option>`).join('');
  });
  if (S.dailyPlace !== 'gps' && !S.favs.some(f => f.id === S.dailyPlace)) S.dailyPlace = 'gps';   // Favorit gelöscht
  document.querySelectorAll('.notify-block [data-key]').forEach(el => { if (el.type === 'checkbox') el.checked = !!S[el.dataset.key]; else el.value = String(S[el.dataset.key]); });
  document.querySelectorAll('.notify-block .native-only').forEach(el => { el.hidden = !NATIVE; });
  document.querySelectorAll('.notify-block .browser-only').forEach(el => { el.hidden = NATIVE; });
  document.querySelectorAll('.notify-block [data-show]').forEach(el => { el.hidden = !NATIVE || !el.dataset.show.split(' ').some(k => S[k]); });
  if (NATIVE && (S.dailyEve || S.dailyMorn)) {
    const txt = dailyStatusText(), xiaomi = !!native('dailyStatus')?.xiaomi;
    document.querySelectorAll('.notify-block .daily-status').forEach(el => { el.textContent = txt; });
    document.querySelectorAll('.notify-block .daily-xiaomi').forEach(el => { el.hidden = !xiaomi; });
  }
}

// ---------- Updates der Android-App (GitHub-Release) ----------
// Die Web-App im Browser aktualisiert sich über den Service Worker; die Android-App braucht eine neue APK.
const RELEASE_API = 'https://api.github.com/repos/mohnstollen/regenradar/releases/latest';
const APK_URL = 'https://github.com/mohnstollen/regenradar/releases/latest/download/wetter.apk';
const LS_UPD = 'wetterapp.updateCheck';
const verCmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function downloadApk() {   // als Link öffnen – die App gibt ihn an den Browser weiter, der die APK lädt
  const a = document.createElement('a'); a.href = APK_URL; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}
// Release-Notizen ohne Markdown-Zeichen und ohne die Download-Zeile
const releaseNotes = (body) => String(body || '').split('\n').filter(l => l.trim() && !/^Download:/.test(l.trim()))
  .map(l => l.replace(/`/g, '').replace(/\*\*/g, '').replace(/^\s*-\s+/, '• ').replace(/^\s{2,}/, '  ')).join('\n');
function showUpdate(st) {
  const info = $('#updateInfo'), newer = st && st.latest && verCmp(st.latest, APP_VERSION) > 0;
  $('#updateDl').hidden = !newer;
  if (!st) { info.hidden = true; return; }
  info.hidden = false;
  info.textContent = st.error ? `Prüfung nicht möglich (${st.error}).`
    : newer ? `Version ${st.latest} ist verfügbar – installiert sich als Update, Einstellungen bleiben erhalten.${st.notes ? '\n\nNeu:\n' + st.notes : ''}`
    : `Du hast die neueste Version (${APP_VERSION}).`;
}
async function checkUpdate(manual) {
  let st;
  try {
    const r = await fetch(RELEASE_API, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    st = { ts: Date.now(), latest: String(j.tag_name || '').replace(/^v/, ''), notes: releaseNotes(j.body) };
    let old = {}; try { old = JSON.parse(localStorage.getItem(LS_UPD) || '{}'); } catch { }
    localStorage.setItem(LS_UPD, JSON.stringify({ ...st, told: old.told }));
    // automatische Prüfung: auf eine neue Version nur einmal hinweisen
    if (!manual && verCmp(st.latest, APP_VERSION) > 0 && old.told !== st.latest) {
      localStorage.setItem(LS_UPD, JSON.stringify({ ...st, told: st.latest }));
      toast(`Neue App-Version ${st.latest} verfügbar.`, 12000, { label: 'Herunterladen', fn: downloadApk });
    }
  } catch (e) {
    st = { error: /fetch|network/i.test(e.message) ? 'keine Verbindung' : e.message };
  }
  if (manual || !st.error) showUpdate(st);
  return st;
}
function initUpdate() {
  $('#updateBox').hidden = !NATIVE;
  if (!NATIVE) return;
  $('#installedVer').textContent = APP_VERSION;
  $('#btnUpdateDl').onclick = downloadApk;
  $('#btnUpdateCheck').onclick = async () => {
    const b = $('#btnUpdateCheck'); b.disabled = true; b.textContent = 'Suche …';
    await checkUpdate(true);
    b.disabled = false; b.textContent = 'Nach Updates suchen';
  };
  let last = {}; try { last = JSON.parse(localStorage.getItem(LS_UPD) || '{}'); } catch { }
  if (last.latest) showUpdate(last);
  if (!last.ts || Date.now() - last.ts > 24 * HOUR) setTimeout(() => checkUpdate(false), 4000);   // einmal am Tag beim Start
}

// ---------- PWA ----------
let installEvt = null;
function initPwa() {
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hint = $('#installHint');
  // In der Android-App oder als installierte PWA gibt es nichts mehr zu installieren
  $('#installBox').hidden = NATIVE || isStandalone;
  initUpdate();
  if (isStandalone) hint.textContent = 'Die App ist installiert.';
  else if (ios) hint.textContent = 'iPhone/iPad: In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.';
  else hint.textContent = 'Falls der Button nichts tut: im Browsermenü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.';
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; installEvt = null; toast('App installiert.'); });
  const doInstall = async () => {
    if (!installEvt) { toast(hint.textContent, 6000); return; }
    installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true;
  };
  $('#btnInstall').onclick = doInstall; $('#btnInstall2').onclick = doInstall;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller)
            toast('Neue App-Version verfügbar.', 15000, { label: 'Neu laden', fn: () => location.reload() });
        });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * MIN);
    }).catch(() => {});
  }
}

// ---------- Start ----------
function init() {
  if (isUpgrade && !S.layoutSeen.length) S.layoutSeen = SECTIONS.map(x => x.id).filter(id => !NEW_IN_VERSION.includes(id));
  S.layout = normLayout(); save(); applyLayout(); applyTheme(); renderScene();
  $('#bkgYear').textContent = `(${YEAR})`;
  $('#appVersion').textContent = `Version ${APP_VERSION}`;
  $('#btnLocate').innerHTML = I('gps'); $('#btnSearch').innerHTML = I('search'); $('#btnRefresh').innerHTML = I('refresh');
  $('#btnSettings').innerHTML = I('gear'); $('#btnInstall').innerHTML = I('install'); $('#locChevron').innerHTML = I('chevron');
  $('#stationIco').innerHTML = I('station'); $('#stationChevron').innerHTML = I('chevron');
  $('#btnPlacesGps').innerHTML = `${I('gps')} Mein Standort`; $('#btnPlacesSearch').innerHTML = `${I('search')} Ort suchen`;
  $('#nowIcon').innerHTML = window.ICONS.weather('unknown'); $('#ncIco').innerHTML = I('bars'); $('#daysIco').innerHTML = I('calendar');
  $('#btnPlay').innerHTML = I('play');
  initForecastControls(); initSettings(); initPollenDialog(); initMap(); setMapMode(S.mapMode, false); renderLoc(); initPwa();
  $('#btnFav').onclick = toggleFav; $('#btnPlaces').onclick = openPlaces;
  $('#btnPlacesGps').onclick = () => { $('#dlgPlaces').close(); locate(); };
  $('#btnPlacesSearch').onclick = () => { $('#dlgPlaces').close(); openSearch(); };
  $('#btnClosePlaces').onclick = () => $('#dlgPlaces').close();
  $('#btnLocate').onclick = locate; $('#btnSearch').onclick = openSearch; $('#btnRefresh').onclick = refresh;
  $('#btnSettings').onclick = () => {
    syncNotifyControls(); $('#satFound').textContent = `Gefunden: Tag ${SAT.day}, Nacht ${SAT.night} (${SAT.source})`; $('#dlgSettings').showModal(); };
  $('#btnCloseSearch').onclick = () => $('#dlgSearch').close();
  $('#btnStation').onclick = openStationDialog; $('#btnCloseStation').onclick = () => $('#dlgStation').close();
  $('#searchForm').onsubmit = (e) => { e.preventDefault(); doSearch(); };
  $('#tabRadar').onclick = () => setMapMode('radar'); $('#tabSat').onclick = () => setMapMode('sat');
  $('#tabBoth').onclick = () => setMapMode('both'); $('#tabWind').onclick = () => setMapMode('wind');
  initMapFull(); initDays();
  $('#btnPlay').onclick = playAnim;
  $('#btnAnimNow').onclick = () => { stopAnim(); showFrame(anim.nowIdx); };
  $('#animSlider').oninput = (e) => { stopAnim(); showFrame(Number(e.target.value)); };
  $('#btnLayoutDone').onclick = closeLayout;
  $('#dlgLayout').addEventListener('cancel', (e) => { e.preventDefault(); closeLayout(); });
  $('#btnLayoutReset').onclick = () => { layoutDraft = SECTIONS.map(s => ({ id: s.id, on: true })); renderLayoutList(); commitLayout(); };
  discoverSatLayers().then(() => { if (S.mapMode === 'sat' || S.mapMode === 'both') setMapMode(S.mapMode, false); });
  if (S.loc) { drawMarker(); renderSun(); if (map) map.setView([S.loc.lat, S.loc.lon], 9); refresh(); }
  const startLocate = () => { if (S.autoLocate || !S.loc) locate(); };
  if (S.wizardFor !== WIZARD_VERSION) { afterLayout = startLocate; openLayout(true); } else startLocate();
  schedule();
  setInterval(() => { if (isOn('now')) renderSun(); renderScene(); }, 10 * MIN);
}
let rsT;
window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (lastChart) drawChart(...lastChart); if (lastNowcast) renderNowcast(lastNowcast); }, 150); });
document.addEventListener('DOMContentLoaded', init);
