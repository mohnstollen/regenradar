/* Wetter-App (PWA) – Version 3.1
 * Aktuell:    Bright Sky /current_weather – nächste oder gewählte DWD-Station (/sources)
 * Sonne:      Sonnenauf-/-untergang lokal berechnet (NOAA-Verfahren) für Station bzw. Standort
 * Text:       Tagesprognose in Worten aus DWD ICON-D2 (Open-Meteo)
 * Verlauf:    12 h … 10 Tage; Temperatur, Niederschlag, Wind (Pfeil + km/h), Sonnenschein
 *             Modelle: Open-Meteo (ICON-D2 Standard), DWD MOSMIX (Bright Sky), Anbieter mit API-Key.
 *             Reicht ein Modell nicht weit genug → automatisch DWD MOSMIX.
 * Warnungen:  Bright Sky /alerts
 * Karte:      DWD-Radar (WMS), EUMETSAT-Satellit (WMS, MTG), Windy-Einbettung (Wind)
 */
'use strict';
const APP_VERSION = '3.1.0';

// ---------- Endpunkte ----------
const BS = 'https://api.brightsky.dev';
const OM = 'https://api.open-meteo.com/v1/forecast';
const OM_META = 'https://api.open-meteo.com/data';
const DWD_WMS = 'https://maps.dwd.de/geoserver/dwd/wms';
const DWD_RADAR = 'dwd:Niederschlagsradar';
const SAT_WMS = 'https://view.eumetsat.int/geoserver/wms';
const SAT_DEFAULT = { day: 'mtg_fd:rgb_truecolour', night: 'mtg_fd:ir105_hrfi' };
const BKG_WMS = 'https://sgx.geodatenzentrum.de/wms_basemapde';
const YEAR = new Date().getFullYear();
const BKG_ATTR = `© GeoBasis-DE / <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">BKG</a> (${YEAR}) <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>`;
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const LS = 'wetterapp.settings.v3', LS_RAIN = 'wetterapp.rainNotified', LS_WARN = 'wetterapp.warnNotified', LS_SAT = 'wetterapp.satLayers', LS_CACHE = 'wetterapp.cache.';

// ---------- Zeiträume ----------
const RANGES = [
  { h: 12, label: '12 h', title: 'Die nächsten 12 Stunden' },
  { h: 48, label: '2 Tage', title: 'Die nächsten 2 Tage' },
  { h: 72, label: '3 Tage', title: 'Die nächsten 3 Tage' },
  { h: 120, label: '5 Tage', title: 'Die nächsten 5 Tage' },
  { h: 168, label: '7 Tage', title: 'Die nächsten 7 Tage' },
  { h: 240, label: '10 Tage', title: 'Die nächsten 10 Tage' }
];

// ---------- Anbieter mit API-Key ----------
const KEY_PROVIDERS = {
  owm: { name: 'OpenWeatherMap', url: 'https://home.openweathermap.org/users/sign_up', free: 'kostenlos: 60 Abrufe/min, 1 Mio./Monat · 3-Stunden-Schritte, 5 Tage' },
  weatherapi: { name: 'WeatherAPI.com', url: 'https://www.weatherapi.com/signup.aspx', free: 'kostenlos: 100.000 Abrufe/Monat · 3 Tage stündlich' },
  tomorrow: { name: 'Tomorrow.io', url: 'https://app.tomorrow.io/signup', free: 'kostenlos: 500/Tag, 25/Stunde · 5 Tage stündlich' },
  pirate: { name: 'Pirate Weather', url: 'https://pirateweather.net/', free: 'kostenlos: 10.000 Abrufe/Monat · 7 Tage stündlich' },
  meteoblue: { name: 'meteoblue', url: 'https://www.meteoblue.com/de/weather-api', free: 'Free Weather API: 1 Jahr, 10 Mio. Credits · 7 Tage stündlich' }
};

// ---------- Modelle ----------
// meta: Datensatz-Name für den Open-Meteo-Modellstatus (Zeitpunkt des letzten Modelllaufs)
const MODELS = [
  { key: 'icon_d2', src: 'om', group: 'DWD', name: 'DWD ICON-D2 (2 km)', maxH: 48, meta: 'dwd_icon_d2', info: 'DWD-Rohmodell, 2,2 km · alle 3 h neu · bis +48 h' },
  { key: 'mosmix', src: 'bs', group: 'DWD', name: 'DWD MOSMIX', maxH: 240, info: 'DWD · an Messstationen statistisch korrigierte Punktvorhersage · bis 10 Tage' },
  { key: 'icon_seamless', src: 'om', group: 'DWD', name: 'DWD ICON kombiniert', maxH: 180, meta: 'dwd_icon', info: 'DWD · ICON-D2 → ICON-EU → ICON global · bis ca. 7 Tage' },
  { key: 'ecmwf_ifs025', src: 'om', group: 'Europa', name: 'ECMWF IFS', maxH: 360, meta: 'ecmwf_ifs025', info: 'ECMWF · globales Referenzmodell · bis 15 Tage' },
  { key: 'ecmwf_aifs025', src: 'om', group: 'Europa', name: 'ECMWF AIFS (KI-Modell)', maxH: 360, meta: 'ecmwf_aifs025_single', info: 'ECMWF · KI-basiertes Modell · bis 15 Tage' },
  { key: 'knmi_harmonie_arome_europe', src: 'om', group: 'Europa', name: 'KNMI Harmonie (NL)', maxH: 60, meta: 'knmi_harmonie_arome_europe', info: 'Niederländischer Wetterdienst · bis ca. 2,5 Tage' },
  { key: 'meteofrance_seamless', src: 'om', group: 'Europa', name: 'Météo-France ARPEGE/AROME', maxH: 96, meta: 'meteofrance_arpege_europe', info: 'Französischer Wetterdienst · bis 4 Tage' },
  { key: 'ukmo_seamless', src: 'om', group: 'Weltweit', name: 'UK Met Office', maxH: 168, meta: 'ukmo_global_deterministic_10km', info: 'Britischer Wetterdienst · bis 7 Tage' },
  { key: 'gfs_seamless', src: 'om', group: 'Weltweit', name: 'NOAA GFS (USA)', maxH: 384, meta: 'ncep_gfs025', info: 'US-Wetterdienst · bis 16 Tage' },
  { key: 'best_match', src: 'om', group: 'Weltweit', name: 'Open-Meteo „Best Match“', maxH: 384, info: 'Open-Meteo wählt automatisch das beste Modell' },
  { key: 'k_owm', src: 'key', prov: 'owm', group: 'Mit API-Key', name: 'OpenWeatherMap', maxH: 120, info: '3-Stunden-Schritte · bis 5 Tage' },
  { key: 'k_weatherapi', src: 'key', prov: 'weatherapi', group: 'Mit API-Key', name: 'WeatherAPI.com', maxH: 72, info: 'stündlich · Gratis-Tarif bis 3 Tage' },
  { key: 'k_tomorrow', src: 'key', prov: 'tomorrow', group: 'Mit API-Key', name: 'Tomorrow.io', maxH: 120, info: 'stündlich · bis 5 Tage' },
  { key: 'k_pirate', src: 'key', prov: 'pirate', group: 'Mit API-Key', name: 'Pirate Weather', maxH: 168, info: 'stündlich · bis 7 Tage' },
  { key: 'k_meteoblue', src: 'key', prov: 'meteoblue', group: 'Mit API-Key', name: 'meteoblue', maxH: 168, info: 'stündlich inkl. Sonnenscheindauer · bis 7 Tage' }
];
const MOSMIX = MODELS.find(m => m.key === 'mosmix');

const DEFAULTS = {
  loc: null, station: null, basemap: 'bm_grau', sat: 'auto', satDay: '', satNight: '', intervalMin: 10,
  notify: false, warnNotify: true, autoLocate: true, mapMode: 'radar', model: 'icon_d2', rangeH: 12, keys: {}
};
let S = (() => {
  try { const s = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS) || '{}')); s.keys = s.keys || {}; return s; }
  catch { return { ...DEFAULTS, keys: {} }; }
})();
const save = () => localStorage.setItem(LS, JSON.stringify(S));

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
const HOUR = 3600000;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function distKm(a, b, c, d) { const x = rad(c - a), y = rad(d - b); const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); }
function ageTxt(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 2) return 'gerade eben'; if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60); return `vor ${h} h${m % 60 >= 10 && h < 6 ? ` ${m % 60} min` : ''}`;
}
function whenTxt(ms) {
  const d = new Date(ms), today = dayStart(Date.now());
  const day = dayStart(ms) === today ? '' : dayStart(ms) === today - 24 * HOUR ? 'gestern ' : `${WD[d.getDay()]} `;
  return `${day}${hhmm(ms)} Uhr`;
}

let toastT;
function toast(msg, ms = 4000, action) {
  const t = $('#toast'); t.innerHTML = ''; const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.fn; t.appendChild(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
let offlineHits = 0;
// liefert { data, at } – at = Zeitpunkt, zu dem die Daten tatsächlich abgerufen wurden (auch aus dem Offline-Cache)
async function fetchJSON(url, opts = {}) {
  let r;
  try { r = await fetch(url, { cache: 'no-store', ...opts }); }
  catch { throw new Error('keine Verbindung oder vom Anbieter blockiert (CORS)'); }
  if (r.headers.get('x-sw-cache') === '1') offlineHits++;
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    if (r.status === 401 || r.status === 403) msg += ' – API-Key ungültig oder noch nicht aktiv';
    else if (r.status === 429) msg += ' – Abrufgrenze erreicht';
    try { const j = await r.json(); const reason = j.reason || j.message || j.error?.message || j.error; if (reason && typeof reason === 'string') msg += ` (${reason})`; } catch { }
    throw new Error(msg);
  }
  const at = Number(r.headers.get('x-sw-time')) || Date.now();
  return { data: await r.json(), at };
}
const getJSON = async (url, opts) => (await fetchJSON(url, opts)).data;
async function cachedJSON(url, ttlMin, cacheKey) {
  const k = LS_CACHE + cacheKey;
  try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c && Date.now() - c.ts < ttlMin * 60000) return { data: c.data, at: c.ts }; } catch { }
  const res = await fetchJSON(url);
  try { localStorage.setItem(k, JSON.stringify({ ts: res.at, data: res.data })); } catch { }
  return res;
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
// Sonnenauf-/-untergang (Sonnenaufgangsgleichung, Refraktion −0,833°); Genauigkeit ca. ±1 min
function sunTimes(dayMs, lat, lon) {
  const noon = new Date(dayMs); noon.setHours(12, 0, 0, 0);
  const jd = noon.getTime() / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const Js = n - lon / 360;
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
  return { rise: toMs(Jt - w), set: toMs(Jt + w), noon: toMs(Jt) };
}
function renderSun() {
  const p = S.station?.lat != null ? { lat: S.station.lat, lon: S.station.lon, name: `Station ${S.station.name}` } : S.loc ? { ...S.loc, name: S.loc.name } : null;
  const el = $('#sunRow'); if (!p) { el.innerHTML = ''; return; }
  const now = Date.now(); let st = sunTimes(now, p.lat, p.lon), label = '';
  if (st.set && now > st.set) { st = sunTimes(now + 24 * HOUR, p.lat, p.lon); label = ' (morgen)'; }
  if (st.polar) { el.textContent = st.polar === 'day' ? 'Polartag – die Sonne geht nicht unter' : 'Polarnacht – die Sonne geht nicht auf'; return; }
  const len = Math.round((st.set - st.rise) / 60000);
  el.innerHTML = `<span title="Sonnenaufgang${label} · ${esc(p.name)}">${I('sunrise')}<b>${hhmm(st.rise)}</b></span>`
    + `<span title="Sonnenuntergang${label} · ${esc(p.name)}">${I('sunset')}<b>${hhmm(st.set)}</b></span>`
    + `<span class="muted" title="Tageslänge">${I('daylen')}${Math.floor(len / 60)} h ${String(len % 60).padStart(2, '0')} min${label}</span>`;
}

// ---------- 1. Aktuelles Wetter ----------
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
  $('#nowIcon').innerHTML = window.ICONS.weather(c.icon);
  $('#nowTemp').textContent = `${fmt(c.temperature)} °C`;
  $('#nowDesc').textContent = COND[c.condition] || ICON_TXT[c.icon] || 'trocken';
  const wind = c.wind_speed_10 ?? c.wind_speed_30 ?? c.wind_speed_60;
  const wdir = c.wind_direction_10 ?? c.wind_direction_30 ?? c.wind_direction_60;
  const gust = c.wind_gust_speed_10 ?? c.wind_gust_speed_30 ?? c.wind_gust_speed_60;
  const precip = c.precipitation_60 ?? c.precipitation_30 ?? c.precipitation_10;
  $('#nowDetails').innerHTML = [
    wind != null && `<span>${I('wind')}<b>${fmt(wind, 0)} km/h</b> ${dirName(wdir)}${gust != null ? `, Böen ${fmt(gust, 0)}` : ''}</span>`,
    c.relative_humidity != null && `<span>${I('drop')}<b>${fmt(c.relative_humidity, 0)} %</b></span>`,
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
      b.onclick = () => { fn(); $('#dlgStation').close(); renderSun(); refresh(); };
      li.appendChild(b); ul.appendChild(li);
    };
    add('Automatisch', 'immer die nächstgelegene Station mit aktuellen Werten', !S.station, () => { S.station = null; save(); drawStationMarker(); });
    for (const s of list) {
      add(s.station_name, `${fmt(s.km, 0)} km · ${fmt(s.height, 0)} m ü. NN · WMO ${s.wmo_station_id}`, S.station?.wmo === s.wmo_station_id,
        () => { S.station = { wmo: s.wmo_station_id, name: s.station_name, lat: s.lat, lon: s.lon }; save(); drawStationMarker(); });
    }
    if (!list.length) ul.insertAdjacentHTML('beforeend', '<li class="muted small">Keine weiteren Stationen im Umkreis gefunden.</li>');
  } catch (e) { ul.innerHTML = `<li class="muted small">Stationen nicht abrufbar (${esc(e.message)})</li>`; }
}

// ---------- Modellstatus (Zeitpunkt des Modelllaufs) ----------
const metaCache = {};
async function modelRun(m) {
  if (!m.meta) return null;
  const c = metaCache[m.meta]; if (c && Date.now() - c.ts < 10 * 60000) return c.run;
  try {
    const d = await getJSON(`${OM_META}/${m.meta}/static/meta.json`);
    const run = d.last_run_initialisation_time ? d.last_run_initialisation_time * 1000 : null;
    metaCache[m.meta] = { ts: Date.now(), run }; return run;
  } catch { metaCache[m.meta] = { ts: Date.now(), run: null }; return null; }
}

// ---------- Vorhersage-Abruf ----------
// Zeile: { t, temp, mm, pEnd, sun (min|null), wind (km/h), wdir (°), gust (km/h), code, cloud }
const ms2kmh = (v) => v == null ? null : v * 3.6;
async function fcMosmix(lat, lon, H) {
  const now = new Date(); now.setMinutes(0, 0, 0);
  const to = new Date(now.getTime() + (H + 1) * HOUR);
  const { data: d, at } = await fetchJSON(`${BS}/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&date=${now.toISOString()}&last_date=${to.toISOString()}&tz=Europe/Berlin`);
  const rows = (d.weather || []).map(w => {
    const t = new Date(w.timestamp).getTime();
    return { t, temp: w.temperature, mm: w.precipitation ?? 0, pEnd: t, sun: w.sunshine ?? null, wind: w.wind_speed, wdir: w.wind_direction, gust: w.wind_gust_speed, cloud: w.cloud_cover };
  });
  return { rows, at, run: null };
}
async function omHourly(lat, lon, model, vars, days) {
  const q = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: vars.join(','), models: model, timezone: 'auto', timeformat: 'unixtime', forecast_days: String(days) });
  const { data: d, at } = await fetchJSON(`${OM}?${q}`);
  const h = d.hourly || {};
  const col = (n) => h[n] ?? h[`${n}_${model}`] ?? [];
  return { time: h.time || [], col, at };
}
async function fcOpenMeteo(lat, lon, H, m) {
  const [res, run] = await Promise.all([
    omHourly(lat, lon, m.key, ['temperature_2m', 'precipitation', 'sunshine_duration', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'], Math.min(16, Math.ceil(H / 24) + 1)),
    modelRun(m)
  ]);
  const T = res.col('temperature_2m'), P = res.col('precipitation'), SD = res.col('sunshine_duration');
  const WS = res.col('wind_speed_10m'), WDR = res.col('wind_direction_10m'), G = res.col('wind_gusts_10m');
  const rows = res.time.map((t, i) => ({ t: t * 1000, temp: T[i], mm: P[i] ?? 0, pEnd: t * 1000, sun: SD[i] == null ? null : SD[i] / 60, wind: WS[i], wdir: WDR[i], gust: G[i] }));
  return { rows, at: res.at, run };
}
const KEY_FETCH = {
  async owm(lat, lon, key) {
    const { data: d, at } = await cachedJSON(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&units=metric&appid=${encodeURIComponent(key)}`, 15, `owm_${lat.toFixed(2)}_${lon.toFixed(2)}`);
    return { at, rows: (d.list || []).map(x => ({ t: x.dt * 1000, temp: x.main?.temp, mm: (x.rain?.['3h'] || 0) + (x.snow?.['3h'] || 0), pEnd: x.dt * 1000, sun: null, wind: ms2kmh(x.wind?.speed), wdir: x.wind?.deg, gust: ms2kmh(x.wind?.gust) })) };
  },
  async weatherapi(lat, lon, key) {
    const { data: d, at } = await cachedJSON(`https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${lat.toFixed(4)},${lon.toFixed(4)}&days=3&aqi=no&alerts=no`, 15, `wapi_${lat.toFixed(2)}_${lon.toFixed(2)}`);
    const rows = [];
    for (const day of d.forecast?.forecastday || []) for (const x of day.hour || []) rows.push({ t: x.time_epoch * 1000, temp: x.temp_c, mm: x.precip_mm || 0, pEnd: (x.time_epoch + 3600) * 1000, sun: null, wind: x.wind_kph, wdir: x.wind_degree, gust: x.gust_kph });
    return { rows, at };
  },
  async tomorrow(lat, lon, key) {
    const { data: d, at } = await cachedJSON(`https://api.tomorrow.io/v4/weather/forecast?location=${lat.toFixed(4)},${lon.toFixed(4)}&timesteps=1h&units=metric&apikey=${encodeURIComponent(key)}`, 20, `tio_${lat.toFixed(2)}_${lon.toFixed(2)}`);
    return { at, rows: (d.timelines?.hourly || []).map(x => {
      const v = x.values || {}, t = new Date(x.time).getTime();
      const mm = v.precipitationIntensity ?? ((v.rainIntensity || 0) + (v.snowIntensity || 0) + (v.sleetIntensity || 0) + (v.freezingRainIntensity || 0));
      return { t, temp: v.temperature, mm, pEnd: t + HOUR, sun: null, wind: ms2kmh(v.windSpeed), wdir: v.windDirection, gust: ms2kmh(v.windGust) };
    }) };
  },
  async pirate(lat, lon, key) {
    const { data: d, at } = await cachedJSON(`https://api.pirateweather.net/forecast/${encodeURIComponent(key)}/${lat.toFixed(4)},${lon.toFixed(4)}?units=si&extend=hourly&exclude=currently,minutely,daily,alerts`, 15, `pw_${lat.toFixed(2)}_${lon.toFixed(2)}`);
    return { at, rows: (d.hourly?.data || []).map(x => ({ t: x.time * 1000, temp: x.temperature, mm: x.precipIntensity || 0, pEnd: (x.time + 3600) * 1000, sun: null, wind: ms2kmh(x.windSpeed), wdir: x.windBearing, gust: ms2kmh(x.windGust) })) };
  },
  async meteoblue(lat, lon, key) {
    const { data: d, at } = await cachedJSON(`https://my.meteoblue.com/packages/basic-1h_clouds-1h?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&apikey=${encodeURIComponent(key)}&format=json&timeformat=timestamp_utc`, 30, `mb_${lat.toFixed(2)}_${lon.toFixed(2)}`);
    const h = d.data_1h || {};
    return { at, rows: (h.time || []).map((t, i) => {
      const ms = typeof t === 'number' ? t * 1000 : new Date(String(t).replace(' ', 'T') + 'Z').getTime() - (d.metadata?.utc_timeoffset || 0) * HOUR;
      return { t: ms, temp: h.temperature?.[i], mm: h.precipitation?.[i] || 0, pEnd: ms, sun: h.sunshinetime?.[i] ?? null, wind: ms2kmh(h.windspeed?.[i]), wdir: h.winddirection?.[i], gust: null };
    }) };
  }
};
async function fetchModel(m, lat, lon, H) {
  if (m.src === 'bs') return fcMosmix(lat, lon, H);
  if (m.src === 'om') return fcOpenMeteo(lat, lon, H, m);
  const key = (S.keys[m.prov] || '').trim();
  if (!key) throw new Error(`kein API-Key für ${KEY_PROVIDERS[m.prov].name}`);
  const r = await KEY_FETCH[m.prov](lat, lon, key);
  return { ...r, run: null };
}

// ---------- 2. Verlauf ----------
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
  if (seq !== fcSeq) return;
  const start = new Date(); start.setMinutes(0, 0, 0);
  const t0 = start.getTime(), t1 = t0 + R.h * HOUR;
  const rows = res.rows.filter(r => r.temp != null && r.t >= t0 - 3 * HOUR && r.t <= t1 + 3 * HOUR).sort((a, b) => a.t - b.t);
  if (rows.filter(r => r.t >= t0 && r.t <= t1).length < 2) throw new Error(`${used.name} liefert für diesen Ort keine Daten`);
  renderModelInfo(used, res);
  drawChart(rows, t0, t1, used);
}
function renderModelInfo(m, res) {
  const parts = [`<b>${esc(m.name)}</b>`];
  if (res.run) parts.push(`Modelllauf ${whenTxt(res.run)}`);
  const old = Date.now() - res.at > 30 * 60000;
  parts.push(`<span class="${old ? 'old' : ''}">abgerufen ${hhmm(res.at)} Uhr (${ageTxt(res.at)})</span>`);
  $('#modelInfo').innerHTML = `${I('clock')} <span>${parts.join(' · ')}</span>`;
  $('#modelInfo').title = m.info;
}

let lastChart = null;
function drawChart(rows, t0, t1, model) {
  lastChart = [rows, t0, t1, model];
  const H = (t1 - t0) / HOUR;
  const W = Math.max(300, Math.round($('#chart').clientWidth || 680)), PADL = 34, PADR = 16;
  const plotW = W - PADL - PADR, pph = plotW / H;
  const TOP = 22, TH = W < 500 ? 120 : 140;
  const XL = TOP + TH + 15;                       // Stunden-Zeile
  const hourStep = H <= 12 ? null : [3, 6, 12].find(s => s * pph >= 24);
  const XD = H > 12 && hourStep ? XL + 15 : XL;   // Tages-Zeile (rückt hoch, wenn keine Stunden passen)
  const RAIN_Y = XD + 32, RAIN_H = 34;
  const WIND_Y = RAIN_Y + RAIN_H + 26, WIND_H = 34;
  const SUN_Y = WIND_Y + WIND_H + 30, SUN_H = 22;
  const HGT = SUN_Y + SUN_H + 18;
  const x = (t) => PADL + (t - t0) / (t1 - t0) * plotW;

  const tp = rows.filter(r => r.t >= t0 && r.t <= t1);
  const temps = tp.map(r => r.temp);
  let tmin = Math.floor(Math.min(...temps) - 1), tmax = Math.ceil(Math.max(...temps) + 1);
  if (tmax - tmin < 6) { const mid = (tmax + tmin) / 2; tmin = Math.floor(mid - 3); tmax = Math.ceil(mid + 3); }
  const y = (v) => TOP + TH - (v - tmin) / (tmax - tmin) * TH;
  let svg = '';
  const tickStep = (tmax - tmin) > 20 ? 5 : (tmax - tmin) > 9 ? 2 : 1;
  for (let v = Math.ceil(tmin / tickStep) * tickStep; v <= tmax; v += tickStep)
    svg += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${y(v)}" y2="${y(v)}"/><text class="rowlbl" x="${PADL - 5}" y="${y(v) + 3}" text-anchor="end">${v}°</text>`;

  // ---- Zeitachse: Abstände richten sich nach der verfügbaren Breite ----
  if (H <= 12) {
    const step = 3 * pph >= 48 ? 3 : 6;
    for (let t = t0; t <= t1; t += step * HOUR) {
      const anchor = t === t0 ? 'start' : x(t) > W - PADR - 20 ? 'end' : 'middle';
      svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${TOP}" y2="${TOP + TH}"/><text class="xlbl" x="${anchor === 'start' ? x(t) - 4 : x(t)}" y="${XL}" style="text-anchor:${anchor}">${t === t0 ? 'jetzt' : new Date(t).getHours() + ' Uhr'}</text>`;
    }
  } else {
    // Tagesgrenzen
    for (let t = dayStart(t0) + 24 * HOUR; t < t1; t += 24 * HOUR) svg += `<line class="daysep" x1="${x(t)}" x2="${x(t)}" y1="${TOP}" y2="${XD + 4}"/>`;
    // Stunden: kleinster Abstand (3/6/12 h), bei dem die Zahlen mind. 24 px auseinander liegen
    const step = hourStep;
    if (step) {
      svg += `<text class="rowlbl" x="${PADL - 5}" y="${XL}" text-anchor="end">Uhr</text>`;
      for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += HOUR) {
        const hr = new Date(t).getHours();
        if (hr === 0 || hr % step) continue;
        if (x(t) < PADL + 6 || x(t) > W - PADR - 6) continue;
        svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${TOP}" y2="${TOP + TH}"/><text class="xlbl" x="${x(t)}" y="${XL}">${hr}</text>`;
      }
    }
    // Tagesnamen (zentriert im sichtbaren Tagesabschnitt, Länge je nach Platz)
    for (let t = dayStart(t0); t < t1; t += 24 * HOUR) {
      const a = Math.max(t, t0), b = Math.min(t + 24 * HOUR, t1), span = x(b) - x(a);
      if (span < 14) continue;
      const d = new Date(t), today = dayStart(Date.now());
      const name = t === today ? 'Heute' : t === today + 24 * HOUR ? 'Morgen' : WD[d.getDay()];
      const txt = span >= 70 ? `${name} ${t > today + 24 * HOUR ? d.getDate() + '.' : ''}`.trim() : span >= 44 ? name : WD[d.getDay()];
      svg += `<text class="xlbl day" x="${(x(a) + x(b)) / 2}" y="${XD}">${txt}</text>`;
    }
  }

  // ---- Temperaturkurve ----
  const pts = rows.map(r => [x(r.t), y(r.temp)]);
  const path = pts.map((p, i) => { if (!i) return `M${p[0]},${p[1]}`; const p0 = pts[i - 1], cx = (p0[0] + p[0]) / 2; return `C${cx},${p0[1]} ${cx},${p[1]} ${p[0]},${p[1]}`; }).join(' ');
  svg += `<defs><clipPath id="clipT"><rect x="${PADL}" y="0" width="${plotW}" height="${TOP + TH}"/></clipPath></defs>`;
  svg += `<g clip-path="url(#clipT)"><path class="tarea" d="${path} L${pts[pts.length - 1][0]},${TOP + TH} L${pts[0][0]},${TOP + TH} Z"/><path class="tline" d="${path}"/></g>`;
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

  // ---- Zeitblöcke für Balken und Wind ----
  // Blockgröße so wählen, dass ein Block mind. ca. 22 px breit ist
  const B = H <= 12 ? (pph >= 22 ? 1 : 2) : [3, 6, 12, 24].find(b => b * pph >= 22) || 24;
  const buckets = [];
  if (B === 24) { for (let t = dayStart(t0); t < t1; t += 24 * HOUR) buckets.push([Math.max(t, t0), Math.min(t + 24 * HOUR, t1)]); }
  else {
    let t = t0; const h0 = new Date(t0).getHours(), first = (B - (h0 % B)) % B;
    if (first) { buckets.push([t0, t0 + first * HOUR]); t = t0 + first * HOUR; }
    for (; t < t1; t += B * HOUR) buckets.push([t, Math.min(t + B * HOUR, t1)]);
  }
  const stat = buckets.map(([a, b]) => {
    let mm = 0, sun = 0, sunN = 0, u = 0, v = 0, ws = 0, wn = 0, gust = null;
    for (const r of rows) {
      const e = r.pEnd - 1;
      if (e >= a && e < b) { mm += r.mm || 0; if (r.sun != null) { sun += r.sun; sunN++; } }
      if (r.t > a && r.t <= b && r.wind != null) {
        ws += r.wind; wn++;
        if (r.wdir != null) { u += r.wind * Math.sin(rad(r.wdir)); v += r.wind * Math.cos(rad(r.wdir)); }
        if (r.gust != null) gust = Math.max(gust ?? 0, r.gust);
      }
    }
    const wdir = (u || v) ? (deg(Math.atan2(u, v)) + 360) % 360 : null;
    return { a, b, mm, sun: sunN ? sun : null, hrs: (b - a) / HOUR, wind: wn ? ws / wn : null, wdir, gust };
  });
  const blk = B === 24 ? 'je Tag' : B > 1 ? `je ${B} h` : '';
  const hasSun = stat.some(s => s.sun != null), hasWind = stat.some(s => s.wind != null);
  const sunHrs = B >= 6;

  // Niederschlag
  svg += `<text class="rowlbl" x="0" y="${RAIN_Y - 16}">Niederschlag (mm${blk ? ' ' + blk : ''})</text>`;
  const rmax = Math.max(1, ...stat.map(s => s.mm));
  // Wind
  svg += `<text class="rowlbl" x="0" y="${WIND_Y - 8}">Wind (km/h${blk ? ', Mittel ' + blk : ''}) · Pfeil zeigt Zugrichtung${hasWind ? '' : ' – nicht geliefert'}</text>`;
  // Sonne
  svg += `<text class="rowlbl" x="0" y="${SUN_Y - 8}">Sonnenschein (${sunHrs ? 'h' : 'min'}${blk ? ' ' + blk : ''})${hasSun ? '' : ' – vom Modell nicht geliefert'}</text>`;

  const windCol = (k) => k < 12 ? '#7a8a9c' : k < 29 ? '#1c7ed6' : k < 50 ? '#e67700' : k < 75 ? '#e03131' : '#9c36b5';
  for (const s of stat) {
    const cx = (x(s.a) + x(s.b)) / 2, bw = Math.min((x(s.b) - x(s.a)) * 0.72, 34);
    const showTxt = (x(s.b) - x(s.a)) >= 17;
    // Niederschlag
    const rh = s.mm > 0 ? Math.max(2, s.mm / rmax * RAIN_H) : 0;
    svg += `<line class="grid" x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${RAIN_Y + RAIN_H}" y2="${RAIN_Y + RAIN_H}"/>`;
    if (rh) { svg += `<rect class="rbar" x="${cx - bw / 2}" y="${RAIN_Y + RAIN_H - rh}" width="${bw}" height="${rh}" rx="2"/>`; if (showTxt && s.mm >= 0.05) svg += `<text class="rval" x="${cx}" y="${RAIN_Y + RAIN_H - rh - 3}">${fmt(s.mm, s.mm >= 10 ? 0 : 1)}</text>`; }
    // Wind
    if (s.wind != null) {
      const col = windCol(s.wind), sc = Math.min(1.25, 0.8 + s.wind / 60);
      if (s.wdir != null) svg += `<g transform="translate(${cx} ${WIND_Y + 8}) rotate(${(s.wdir + 180) % 360}) scale(${sc})"><title>${fmt(s.wind, 0)} km/h aus ${dirName(s.wdir)}${s.gust != null ? `, Böen ${fmt(s.gust, 0)} km/h` : ''}</title><path d="M0,-8 L5.5,6 L0,3 L-5.5,6 Z" fill="${col}"/></g>`;
      if (showTxt) svg += `<text class="wval" x="${cx}" y="${WIND_Y + 28}">${fmt(s.wind, 0)}</text>`;
      if (showTxt && s.gust != null && s.gust >= 60) svg += `<text class="gval" x="${cx}" y="${WIND_Y + 39}">B ${fmt(s.gust, 0)}</text>`;
    }
    // Sonne
    const maxSun = s.hrs * 60, sv = Math.min(s.sun ?? 0, maxSun), sh = sv > 0 ? Math.max(2, sv / maxSun * SUN_H) : 0;
    svg += `<line class="grid" x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${SUN_Y + SUN_H}" y2="${SUN_Y + SUN_H}"/>`;
    if (sh) svg += `<rect class="sbar" x="${cx - bw / 2}" y="${SUN_Y + SUN_H - sh}" width="${bw}" height="${sh}" rx="2"/>`;
    if (sv >= 1 && showTxt) svg += `<text class="sval" x="${cx}" y="${SUN_Y + SUN_H + 12}">${sunHrs ? fmt(sv / 60, 1) : fmt(sv, 0)}</text>`;
  }

  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${HGT}" width="${W}" height="${HGT}" role="img">${svg}</svg>`;
  const rain = stat.reduce((a, s) => a + s.mm, 0), sun = stat.reduce((a, s) => a + (s.sun || 0), 0);
  const gmax = Math.max(0, ...stat.map(s => s.gust ?? 0));
  const sunTxt = !hasSun ? '–' : sun >= 60 ? `${fmt(sun / 60, 1)} h` : `${fmt(sun, 0)} min`;
  $('#chartInfo').textContent = `Summe: ${fmt(rain)} mm Niederschlag · ${sunTxt} Sonne · Min ${fmt(Math.min(...temps), 0)}° / Max ${fmt(Math.max(...temps), 0)}°${gmax ? ` · Böen bis ${fmt(gmax, 0)} km/h` : ''}`;
}

function initForecastControls() {
  const sel = $('#modelSelect'), groups = {};
  for (const m of MODELS) (groups[m.group] ||= []).push(m);
  const fill = () => {
    sel.innerHTML = Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(m => {
      const miss = m.src === 'key' && !(S.keys[m.prov] || '').trim();
      return `<option value="${m.key}" title="${esc(m.info)}">${esc(m.name)}${miss ? ' (Key fehlt)' : ''}</option>`;
    }).join('')}</optgroup>`).join('');
    sel.value = currentModel().key;
  };
  fill(); initForecastControls.refill = fill;
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

// ---------- Textprognose (ICON-D2) ----------
async function loadDayText(lat, lon) {
  const vars = ['temperature_2m', 'precipitation', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_gusts_10m'];
  let model = MODELS.find(m => m.key === 'icon_d2'), res;
  const get = async (m) => {
    const r = await omHourly(lat, lon, m.key, vars, 3);
    const rows = r.time.map((t, i) => ({ t: t * 1000, temp: r.col('temperature_2m')[i], mm: r.col('precipitation')[i] ?? 0, code: r.col('weather_code')[i], cloud: r.col('cloud_cover')[i], wind: r.col('wind_speed_10m')[i], gust: r.col('wind_gusts_10m')[i] })).filter(x => x.temp != null);
    if (rows.length < 12) throw new Error('keine Daten');
    return { rows, at: r.at };
  };
  try { res = await get(model); }
  catch { model = MODELS.find(m => m.key === 'icon_seamless'); res = await get(model); }
  const run = await modelRun(model);
  const out = buildDayText(res.rows, Date.now());
  if (!out) { $('#dayCard').hidden = true; return; }
  $('#dayIcon').innerHTML = window.ICONS.weather(out.icon);
  $('#dayText').textContent = out.text;
  $('#daySource').textContent = `Textprognose nach ${model.name}${run ? ` · Modelllauf ${whenTxt(run)}` : ''} · abgerufen ${hhmm(res.at)} Uhr`;
  $('#dayCard').hidden = false;
}

function buildDayText(rows, now) {
  const tomorrow = new Date(now).getHours() >= 20;
  const base = dayStart(now) + (tomorrow ? 24 * HOUR : 0);
  const word = tomorrow ? 'Morgen' : 'Heute';
  const PER = [{ k: 'V', a: 6, b: 12 }, { k: 'N', a: 12, b: 18 }, { k: 'A', a: 18, b: 24 }];
  const periods = [];
  for (const p of PER) {
    const from = Math.max(base + p.a * HOUR, tomorrow ? 0 : now), to = base + p.b * HOUR;
    const list = rows.filter(r => r.t > from && r.t <= to);
    if (list.length < 2) continue;
    const avg = (f) => { const v = list.map(f).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const codes = list.map(r => r.code).filter(c => c != null);
    periods.push({
      k: p.k, list, mm: list.reduce((a, r) => a + (r.mm || 0), 0), cloud: avg(r => r.cloud), wind: avg(r => r.wind),
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
  // Bewölkungsklasse: 0 klar, 1 gering, 2 wolkig, 3 bedeckt, 4 Nebel
  const skyCls = (p) => p.fog ? 4 : (p.cloud ?? 50) < 20 ? 0 : (p.cloud ?? 50) < 45 ? 1 : (p.cloud ?? 50) < 75 ? 2 : 3;
  const SKY_DAY = ['sonnig', 'heiter', 'wolkig', 'bedeckt', 'neblig'], SKY_NIGHT = ['klar', 'überwiegend klar', 'wolkig', 'bedeckt', 'neblig'];
  for (const p of periods) p.wet = wetType(p);
  const anyWet = periods.some(p => p.wet);
  for (const p of periods) p.key = `${skyCls(p)}|${p.wet}`;
  // gleiche Abschnitte zusammenfassen (z. B. „sonnig“ am Tag und „klar“ am Abend)
  const segs = [];
  for (const p of periods) { const last = segs[segs.length - 1]; if (last && last.key === p.key) last.k += p.k; else segs.push({ k: p.k, key: p.key, p }); }
  for (const sg of segs) {
    const c = skyCls(sg.p), word = sg.k === 'A' ? SKY_NIGHT[c] : SKY_DAY[c];
    sg.desc = sg.p.wet ? `${word} ${WET[sg.p.wet]}` : anyWet ? `${word} und trocken` : word;
  }
  const FIRST = { V: ' Vormittag', N: ' Nachmittag', A: ' Abend', VN: ' tagsüber', NA: ' ab dem Nachmittag', VNA: '' };
  const NEXT = { N: 'am Nachmittag', A: 'am Abend', NA: 'ab dem Nachmittag' };
  let text = segs.length === 1 ? `${word} ${segs[0].desc}` : `${word}${FIRST[segs[0].k] ?? ''} ${segs[0].desc}` + segs.slice(1).map(s => `, ${NEXT[s.k] ?? ''} ${s.desc}`).join('');

  // Wind
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

  // Temperatur
  const dayP = periods.filter(p => p.k !== 'A');
  if (dayP.length) text += ` Höchstwert ${fmt(Math.max(...dayP.map(p => p.tmax)), 0)} °C`;
  else text += ` Temperaturen um ${fmt((l.tmax + l.tmin) / 2, 0)} °C`;
  const night = rows.filter(r => r.t > base + 24 * HOUR && r.t <= base + 31 * HOUR);
  if (night.length >= 3) text += `, in der Nacht ${fmt(Math.min(...night.map(r => r.temp)), 0)} °C`;
  text += '.';

  // passendes Symbol: nasser Abschnitt mit meistem Niederschlag, sonst Tagesmitte
  const wetP = periods.filter(p => p.wet).sort((a, b) => b.mm - a.mm)[0];
  const main = wetP || periods.find(p => p.k === 'N') || periods[0];
  const ICON_OF = { thunder: 'thunderstorm', snow: 'snow', freezing: 'sleet', shower: 'showers', heavy: 'rain', rain: 'rain', drizzle: 'rain' };
  let icon = main.wet ? ICON_OF[main.wet] : main.fog ? 'fog' : (main.cloud ?? 50) < 20 ? (main.k === 'A' ? 'clear-night' : 'clear-day') : (main.cloud ?? 50) < 75 ? (main.k === 'A' ? 'partly-cloudy-night' : 'partly-cloudy-day') : 'cloudy';
  return { text: text.replace(/\s+/g, ' ').trim(), icon };
}

// ---------- 3. Warnungen ----------
const sevRank = (s) => ({ minor: 1, moderate: 2, severe: 3, extreme: 4 }[s] || 0);
async function loadWarnings(lat, lon) {
  const d = await getJSON(`${BS}/alerts?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`);
  const list = (d.alerts || []).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const box = $('#warnings'); box.innerHTML = '';
  const place = d.location?.name ? ` für ${d.location.name}` : '';
  if (!list.length) { box.innerHTML = `<div class="warn-none">${I('check')}Keine amtlichen DWD-Warnungen${esc(place)}</div>`; return; }
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

// ---------- 4. Karte ----------
let map, marker, stMarker, radarLayer, satLayer, activeBase = null;
const baseLayers = {};
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
    if (day || night) {
      SAT = { day: day || SAT_DEFAULT.day, night: night || day || SAT_DEFAULT.night, source: 'EUMETSAT-Katalog' };
      localStorage.setItem(LS_SAT, JSON.stringify({ ts: Date.now(), layers: SAT }));
    }
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
  map = L.map('map', { maxZoom: 14 }).setView([49.6, 11.0], 8);
  setBase(S.basemap, false);
  map.attributionControl.addAttribution('Radar: <a href="https://www.dwd.de/" target="_blank" rel="noopener">DWD</a>');
  radarLayer = L.tileLayer.wms(DWD_WMS, { layers: DWD_RADAR, format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, opacity: 0.8, zIndex: 20 });
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
  setMapMode(S.mapMode, false);
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
  const wind = mode === 'wind';
  $('#map').hidden = wind; $('#windy').hidden = !wind;
  $('#radarLegend').style.display = (mode === 'radar' || mode === 'both') ? '' : 'none';
  $('#mapTitle').textContent = { radar: 'Regenradar', sat: 'Satellitenbild', both: 'Radar & Satellit', wind: 'Windströmung' }[mode];
  if (wind) {
    const box = $('#windy'), url = windyUrl();
    if (!box.firstChild || box.dataset.src !== url) { box.innerHTML = `<iframe src="${url}" title="Windkarte von Windy.com" loading="lazy" allowfullscreen></iframe>`; box.dataset.src = url; }
  } else {
    if (mode !== 'sat') radarLayer.addTo(map); else map.removeLayer(radarLayer);
    if (mode !== 'radar') { satLayer.setParams({ layers: satLayerName() }, true); satLayer.addTo(map); } else map.removeLayer(satLayer);
    setTimeout(() => map.invalidateSize(), 50);
  }
  updateMapTime();
}
let radarTime = null;
function updateMapTime() {
  const m = S.mapMode, parts = [];
  if (m === 'wind') parts.push('Windy.com · ECMWF-Modell');
  if (m === 'radar' || m === 'both') parts.push(`Radar ${radarTime ? hhmm(radarTime) : 'aktuell'}`);
  if (m === 'sat' || m === 'both') parts.push(`Satellit ${isDayLayer() ? 'Echtfarben' : 'Infrarot'} (ca. 10–20 min Verzug)`);
  $('#mapTime').textContent = parts.join(' · ');
}
function refreshMapLayers() {
  const bust = { _t: Math.floor(Date.now() / 300000) };
  radarLayer.setParams(bust);
  satLayer.setParams({ ...bust, layers: satLayerName() });
}
function drawMarker() {
  if (!S.loc) return;
  const ll = [S.loc.lat, S.loc.lon];
  if (!marker) marker = L.marker(ll, { title: 'Standort' }).addTo(map); else marker.setLatLng(ll);
  drawStationMarker();
}
function drawStationMarker() {
  if (stMarker) { map.removeLayer(stMarker); stMarker = null; }
  if (S.station?.lat != null) stMarker = L.circleMarker([S.station.lat, S.station.lon], { radius: 6, color: '#0b5cab', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`Station ${S.station.name}`).addTo(map);
}

// ---------- Regen-Hinweis (DWD-Radar inkl. 2-h-Vorhersage) ----------
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
  const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), distance: String((NEAR_KM + 2) * 1000), date: new Date(now - 15 * 60000).toISOString(), last_date: new Date(now + 125 * 60000).toISOString(), format: 'DecompressionStream' in window ? 'compressed' : 'plain' });
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
    let loc = 0, minD = Infinity, minB = null;
    for (let yy = Math.max(0, Math.floor(py - NEAR_KM)); yy <= Math.min(h - 1, Math.ceil(py + NEAR_KM)); yy++)
      for (let xx = Math.max(0, Math.floor(px - NEAR_KM)); xx <= Math.min(w - 1, Math.ceil(px + NEAR_KM)); xx++) {
        const dx = xx - px, dy = py - yy, dist = Math.hypot(dx, dy); if (dist > NEAR_KM) continue;
        const v = f.data[yy * w + xx]; if (v >= 2500) continue;
        if (dist <= LOC_KM && v > loc) loc = v;
        if (v >= RAIN_RAW && dist < minD) { minD = dist; minB = (deg(Math.atan2(dx, dy)) + rot + 360) % 360; }
      }
    return { t: f.t, loc, minD: isFinite(minD) ? minD : null, minB };
  });
  let ni = 0; st.forEach((s, i) => { if (s.t <= now + 60000) ni = i; });
  const cur = st[ni]; let eta = null, until = null;
  if (cur.loc < RAIN_RAW) { for (let i = ni + 1; i < st.length; i++) if (st[i].loc >= RAIN_RAW) { eta = Math.max(0, Math.round((st[i].t - now) / 60000)); break; } }
  else { for (let i = ni + 1; i < st.length; i++) if (st[i].loc < RAIN_RAW) { until = Math.round((st[i].t - now) / 60000); break; } }
  return { t: cur.t, atLoc: cur.loc >= RAIN_RAW, mmh: cur.loc * 0.12, eta, until, minD: cur.minD, minB: cur.minB };
}
function renderRainHint(r) {
  const el = $('#rainHint');
  radarTime = r?.t || null; updateMapTime();
  if (!r) { el.className = 'rainhint small'; el.innerHTML = ''; return; }
  let cls, txt;
  if (r.atLoc) { cls = 'danger'; txt = `Es regnet am Standort (ca. ${fmt(r.mmh)} mm/h)` + (r.until != null ? ` – laut Radarvorhersage vorbei in ~${r.until} min` : ' – hält laut Radarvorhersage über 2 h an'); }
  else if (r.eta != null) {
    cls = 'danger'; txt = `Regen erreicht den Standort in ca. ${r.eta} min (gegen ${hhmm(Date.now() + r.eta * 60000)})`;
    rainNotify(`Regen in ca. ${r.eta} min`, `Laut DWD-Radarvorhersage gegen ${hhmm(Date.now() + r.eta * 60000)}.`);
  } else if (r.minD != null) { cls = 'warn'; txt = `Regen ${fmt(r.minD, 0)} km ${dirName(r.minB)} – laut Radarvorhersage nicht am Standort in den nächsten 2 h`; }
  else { cls = 'ok'; txt = `Kein Regen im Umkreis von ${NEAR_KM} km – auch in den nächsten 2 h nicht erwartet`; }
  el.className = `rainhint small ${cls}`;
  el.innerHTML = `${I(cls === 'ok' ? 'check' : 'rainIco')}<span>${esc(txt)}</span>`;
}
async function rainNotify(title, body) {
  const last = Number(localStorage.getItem(LS_RAIN) || 0);
  if (Date.now() - last < 60 * 60000) return;
  if (await notify(title, body, 'rain', 'rain')) localStorage.setItem(LS_RAIN, String(Date.now()));
}
async function notify(title, body, tag, kind) {
  const allowed = kind === 'rain' ? S.notify : kind === 'warn' ? S.warnNotify : true;
  if (!allowed || !('Notification' in window) || Notification.permission !== 'granted') return false;
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
  navigator.geolocation.getCurrentPosition(async p => setLocation(p.coords.latitude, p.coords.longitude, await reverseGeocode(p.coords.latitude, p.coords.longitude)),
    () => { if (S.loc) toast(`Standort nicht ermittelbar – verwende „${S.loc.name}“.`); else { toast('Standort nicht ermittelbar – bitte Ort suchen.'); openSearch(); } },
    { timeout: 15000, maximumAge: 5 * 60000 });
}
function setLocation(lat, lon, info) {
  if (S.station?.lat != null && distKm(lat, lon, S.station.lat, S.station.lon) > 60) { S.station = null; toast('Gewählte Station liegt zu weit weg – zurück auf automatisch.'); }
  S.loc = { lat, lon, name: info?.name || `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: info?.sub || '' }; save();
  renderLoc(); drawMarker(); map.setView([lat, lon], 9);
  if (S.mapMode === 'wind') setMapMode('wind', false);
  refresh();
}
function renderLoc() {
  $('#locName').textContent = S.loc ? S.loc.name : 'Kein Standort';
  $('#locSub').textContent = S.loc ? (S.loc.sub || `${fmt(S.loc.lat, 3)}, ${fmt(S.loc.lon, 3)}`) : 'Standort ermitteln oder suchen';
}

// ---------- Aktualisierung ----------
let busy = false;
async function refresh() {
  if (!S.loc || busy) return; busy = true; $('#btnRefresh').classList.add('spin');
  const { lat, lon } = S.loc; offlineHits = 0;
  refreshMapLayers(); renderSun();
  await Promise.allSettled([
    loadCurrent(lat, lon).catch(e => { $('#nowStation').textContent = `Aktuelle Werte nicht abrufbar (${e.message})`; }),
    loadDayText(lat, lon).catch(() => { $('#dayCard').hidden = true; }),
    loadForecast(lat, lon).catch(showForecastError),
    loadWarnings(lat, lon).catch(() => { $('#warnings').innerHTML = '<div class="warn-none">Warnungen derzeit nicht abrufbar</div>'; }),
    loadRadar(lat, lon).then(renderRainHint).catch(() => renderRainHint(null))
  ]);
  $('#offline').hidden = !(offlineHits > 0 || !navigator.onLine);
  busy = false; $('#btnRefresh').classList.remove('spin');
}
let timer;
const schedule = () => { clearInterval(timer); timer = setInterval(refresh, S.intervalMin * 60000); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
window.addEventListener('online', () => refresh());
window.addEventListener('offline', () => { $('#offline').hidden = false; });

// ---------- Einstellungen ----------
function initSettings() {
  const bind = (sel, key, conv = v => v, after) => {
    const el = $(sel);
    if (el.type === 'checkbox') el.checked = S[key]; else el.value = String(S[key] ?? '');
    el.onchange = async () => {
      if (el.type === 'checkbox' && el.checked && (key === 'notify' || key === 'warnNotify')) {
        if (!('Notification' in window) || await Notification.requestPermission() !== 'granted') { el.checked = false; toast('Benachrichtigungen nicht erlaubt.'); return; }
      }
      S[key] = el.type === 'checkbox' ? el.checked : conv(el.value); save(); after?.();
    };
  };
  bind('#setBasemap', 'basemap', v => v, () => setBase(S.basemap));
  const satChanged = () => { if (S.mapMode !== 'wind') setMapMode(S.mapMode, false); updateMapTime(); };
  bind('#setSat', 'sat', v => v, satChanged);
  bind('#setSatDay', 'satDay', v => v.trim(), satChanged);
  bind('#setSatNight', 'satNight', v => v.trim(), satChanged);
  bind('#setInterval', 'intervalMin', Number, schedule);
  bind('#setNotify', 'notify'); bind('#setWarnNotify', 'warnNotify'); bind('#setAuto', 'autoLocate');
  const box = $('#keyFields');
  box.innerHTML = Object.entries(KEY_PROVIDERS).map(([id, p]) => `
    <div class="keyrow">
      <div class="k-head"><b>${esc(p.name)}</b><a class="small" href="${p.url}" target="_blank" rel="noopener">Key holen</a></div>
      <div class="small muted">${esc(p.free)}</div>
      <input type="password" data-prov="${id}" placeholder="API-Key einfügen" autocomplete="off" spellcheck="false">
    </div>`).join('');
  box.querySelectorAll('input[data-prov]').forEach(inp => {
    inp.value = S.keys[inp.dataset.prov] || '';
    inp.onfocus = () => { inp.type = 'text'; }; inp.onblur = () => { inp.type = 'password'; };
    inp.onchange = () => {
      S.keys[inp.dataset.prov] = inp.value.trim(); save();
      for (const k of Object.keys(localStorage)) if (k.startsWith(LS_CACHE)) localStorage.removeItem(k);
      initForecastControls.refill();
      if (currentModel().prov === inp.dataset.prov) reloadForecast();
    };
  });
  $('#btnTestNotify').onclick = async () => {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    if (!(await notify('Test: Regen in ca. 20 min', 'So sieht ein Regenhinweis aus.', 'test', 'test'))) toast('Benachrichtigungen sind nicht erlaubt.');
  };
}

// ---------- PWA ----------
let installEvt = null;
function initPwa() {
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hint = $('#installHint');
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
      setInterval(() => reg.update().catch(() => {}), 60 * 60000);
    }).catch(() => {});
  }
}

// ---------- Start ----------
function init() {
  $('#bkgYear').textContent = `(${YEAR})`;
  $('#appVersion').textContent = `· Version ${APP_VERSION}`;
  $('#btnLocate').innerHTML = I('pin'); $('#btnSearch').innerHTML = I('search'); $('#btnRefresh').innerHTML = I('refresh');
  $('#btnSettings').innerHTML = I('gear'); $('#btnInstall').innerHTML = I('install');
  $('#stationIco').innerHTML = I('station'); $('#stationChevron').innerHTML = I('chevron');
  $('#nowIcon').innerHTML = window.ICONS.weather('unknown');
  initForecastControls(); initSettings(); initMap(); renderLoc(); initPwa();
  $('#btnLocate').onclick = locate; $('#btnSearch').onclick = openSearch; $('#btnRefresh').onclick = refresh;
  $('#btnSettings').onclick = () => { $('#satFound').textContent = `Gefunden: Tag ${SAT.day}, Nacht ${SAT.night} (${SAT.source})`; $('#dlgSettings').showModal(); };
  $('#btnCloseSearch').onclick = () => $('#dlgSearch').close();
  $('#btnStation').onclick = openStationDialog; $('#btnCloseStation').onclick = () => $('#dlgStation').close();
  $('#searchForm').onsubmit = (e) => { e.preventDefault(); doSearch(); };
  $('#tabRadar').onclick = () => setMapMode('radar'); $('#tabSat').onclick = () => setMapMode('sat');
  $('#tabBoth').onclick = () => setMapMode('both'); $('#tabWind').onclick = () => setMapMode('wind');
  discoverSatLayers().then(() => { if (S.mapMode === 'sat' || S.mapMode === 'both') setMapMode(S.mapMode, false); });
  if (S.loc) { drawMarker(); renderSun(); map.setView([S.loc.lat, S.loc.lon], 9); refresh(); }
  if (S.autoLocate || !S.loc) locate();
  schedule();
  setInterval(renderSun, 10 * 60000);
}
let rsT;
window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (lastChart) drawChart(...lastChart); }, 150); });
document.addEventListener('DOMContentLoaded', init);
