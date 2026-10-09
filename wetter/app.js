/* Wetter-App (PWA)
 * Aktuell:      Bright Sky /current_weather (nächstgelegene DWD-Station)
 * 12 Stunden:   umschaltbar – DWD MOSMIX (Bright Sky /weather) oder Wettermodelle über Open-Meteo
 * Warnungen:    Bright Sky /alerts (amtliche DWD-Warnungen inkl. Hitze)
 * Radar:        DWD-GeoServer WMS dwd:Niederschlagsradar + Bright Sky /radar (Regen-Hinweis)
 * Satellit:     EUMETSAT View WMS (Meteosat, Echtfarben bzw. Infrarot)
 * Karte:        basemap.de Web Raster (BKG) / OpenStreetMap
 */
'use strict';

// ---------- Konfiguration ----------
const BS = 'https://api.brightsky.dev';
const OM = 'https://api.open-meteo.com/v1/forecast';
const DWD_WMS = 'https://maps.dwd.de/geoserver/dwd/wms';
const DWD_RADAR = 'dwd:Niederschlagsradar';
const SAT_WMS = 'https://view.eumetsat.int/geoserver/wms';
const SAT_VIS = 'msg_fes:rgb_naturalenhncd';
const SAT_IR = 'msg_fes:ir108';
const BKG_WMS = 'https://sgx.geodatenzentrum.de/wms_basemapde';
const YEAR = new Date().getFullYear();
const BKG_ATTR = `© GeoBasis-DE / <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">BKG</a> (${YEAR}) <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>`;
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const LS = 'wetterapp.settings.v1', LS_RAIN = 'wetterapp.rainNotified', LS_WARN = 'wetterapp.warnNotified';

// Wettermodelle für den 12-Stunden-Verlauf
// src: 'bs' = Bright Sky (DWD MOSMIX), 'om' = Open-Meteo mit models=<id>
const MODELS = [
  { key: 'mosmix', src: 'bs', group: 'DWD', name: 'DWD MOSMIX (Standard)', info: 'DWD · statistisch korrigierte Punktvorhersage · stündlich aktualisiert' },
  { key: 'icon_d2', src: 'om', group: 'DWD', name: 'DWD ICON-D2 (2 km)', info: 'DWD · Rohmodell, 2,2 km · alle 3 h neu · bis +48 h' },
  { key: 'icon_seamless', src: 'om', group: 'DWD', name: 'DWD ICON kombiniert', info: 'DWD · ICON-D2 → ICON-EU → ICON global' },
  { key: 'ecmwf_ifs025', src: 'om', group: 'Europa', name: 'ECMWF IFS', info: 'Europäisches Zentrum (ECMWF) · globales Referenzmodell · Open Data seit 10/2025' },
  { key: 'ecmwf_aifs025', src: 'om', group: 'Europa', name: 'ECMWF AIFS (KI-Modell)', info: 'ECMWF · KI-basiertes Modell' },
  { key: 'knmi_harmonie_arome_europe', src: 'om', group: 'Europa', name: 'KNMI Harmonie (NL)', info: 'Niederländischer Wetterdienst · ca. 5,5 km · deckt Deutschland ab' },
  { key: 'meteofrance_seamless', src: 'om', group: 'Europa', name: 'Météo-France ARPEGE/AROME', info: 'Französischer Wetterdienst · AROME nur für Frankreich, Deutschland meist ARPEGE' },
  { key: 'ukmo_seamless', src: 'om', group: 'Weltweit', name: 'UK Met Office', info: 'Britischer Wetterdienst · in Deutschland globales Modell (10 km)' },
  { key: 'gfs_seamless', src: 'om', group: 'Weltweit', name: 'NOAA GFS (USA)', info: 'US-Wetterdienst · globales Modell' },
  { key: 'best_match', src: 'om', group: 'Weltweit', name: 'Open-Meteo „Best Match“', info: 'Open-Meteo wählt automatisch das beste verfügbare Modell' }
];

const DEFAULTS = { loc: null, basemap: 'bm_grau', sat: 'auto', intervalMin: 10, notify: false, warnNotify: true, autoLocate: true, mapMode: 'radar', model: 'mosmix' };
let S = (() => { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { return { ...DEFAULTS }; } })();
const save = () => localStorage.setItem(LS, JSON.stringify(S));

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d });
const hhmm = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const dirName = (deg) => deg == null ? '' : DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const rad = (d) => d * Math.PI / 180;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT;
function toast(m, ms = 3500) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j.reason) msg += ` – ${j.reason}`; } catch { }
    throw new Error(msg);
  }
  return r.json();
}

function sunElevation(lat, lon, date = new Date()) {
  const d = (date - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = rad((357.529 + 0.98560028 * d) % 360), q = (280.459 + 0.98564736 * d) % 360;
  const L = rad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)), e = rad(23.439 - 0.00000036 * d);
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = rad((gmst * 15 + lon) % 360) - ra;
  return Math.asin(Math.sin(rad(lat)) * Math.sin(dec) + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
}

// ---------- Wetter-Icons ----------
const ICON = { 'clear-day': '☀️', 'clear-night': '🌙', 'partly-cloudy-day': '⛅', 'partly-cloudy-night': '☁️', cloudy: '☁️', fog: '🌫️', wind: '💨', rain: '🌧️', sleet: '🌨️', snow: '❄️', hail: '🌨️', thunderstorm: '⛈️' };
const ICON_TXT = { 'clear-day': 'Sonnig', 'clear-night': 'Klar', 'partly-cloudy-day': 'Teilweise bewölkt', 'partly-cloudy-night': 'Teilweise bewölkt', cloudy: 'Bewölkt', fog: 'Nebel', wind: 'Windig', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
const COND = { fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };

// ---------- 1. Aktuelles Wetter (immer DWD-Station) ----------
async function loadCurrent(lat, lon) {
  const d = await getJSON(`${BS}/current_weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`);
  const c = d.weather, src = (d.sources || []).find(s => s.id === c.source_id) || d.sources?.[0];
  $('#nowIcon').textContent = ICON[c.icon] || '❔';
  $('#nowTemp').textContent = `${fmt(c.temperature)} °C`;
  $('#nowDesc').textContent = COND[c.condition] || ICON_TXT[c.icon] || 'trocken';
  const wind = c.wind_speed_10 ?? c.wind_speed_30 ?? c.wind_speed_60;
  const wdir = c.wind_direction_10 ?? c.wind_direction_30 ?? c.wind_direction_60;
  const gust = c.wind_gust_speed_10 ?? c.wind_gust_speed_30 ?? c.wind_gust_speed_60;
  const precip = c.precipitation_60 ?? c.precipitation_30 ?? c.precipitation_10;
  $('#nowDetails').innerHTML = [
    wind != null && `💨 <b>${fmt(wind, 0)} km/h</b> ${dirName(wdir)}${gust != null ? `, Böen ${fmt(gust, 0)}` : ''}`,
    c.relative_humidity != null && `💧 <b>${fmt(c.relative_humidity, 0)} %</b>`,
    precip != null && `🌧️ <b>${fmt(precip)} mm</b>/h`,
    c.cloud_cover != null && `☁️ <b>${fmt(c.cloud_cover, 0)} %</b>`,
    c.pressure_msl != null && `⏲️ <b>${fmt(c.pressure_msl, 0)} hPa</b>`
  ].filter(Boolean).join('');
  const dist = src?.distance != null ? ` · ${fmt(src.distance / 1000, 0)} km entfernt` : '';
  $('#nowStation').textContent = `DWD-Station ${src?.station_name ?? '–'}${dist} · gemessen ${hhmm(new Date(c.timestamp))}`;
}

// ---------- 2. 12-Stunden-Verlauf (Modell umschaltbar) ----------
const currentModel = () => MODELS.find(m => m.key === S.model) || MODELS[0];

async function loadForecastMosmix(lat, lon) {
  const now = new Date(); now.setMinutes(0, 0, 0);
  const to = new Date(now.getTime() + 13 * 3600000);
  const d = await getJSON(`${BS}/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&date=${now.toISOString()}&last_date=${to.toISOString()}&tz=Europe/Berlin`);
  return (d.weather || []).map(w => ({
    t: new Date(w.timestamp).getTime(), temp: w.temperature, mm: w.precipitation ?? 0, sun: w.sunshine
  }));
}

async function loadForecastOpenMeteo(lat, lon, model) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    hourly: 'temperature_2m,precipitation,sunshine_duration',
    models: model, timezone: 'auto', timeformat: 'unixtime', forecast_days: '2'
  });
  const d = await getJSON(`${OM}?${q}`);
  const h = d.hourly; if (!h?.time) return [];
  // Open-Meteo hängt bei manchen Abfragen den Modellnamen an (z. B. temperature_2m_icon_d2)
  const col = (name) => h[name] ?? h[`${name}_${model}`] ?? [];
  const T = col('temperature_2m'), P = col('precipitation'), SD = col('sunshine_duration');
  return h.time.map((t, i) => ({
    t: t * 1000, temp: T[i], mm: P[i] ?? 0,
    sun: SD[i] == null ? null : SD[i] / 60     // Sekunden → Minuten
  }));
}

async function loadForecast(lat, lon) {
  const m = currentModel();
  $('#modelInfo').textContent = m.info;
  $('#chartInfo').textContent = 'Lade Vorhersage …';
  let rows = m.src === 'bs' ? await loadForecastMosmix(lat, lon) : await loadForecastOpenMeteo(lat, lon, m.key);
  const start = new Date(); start.setMinutes(0, 0, 0);
  rows = rows.filter(r => r.temp != null && r.t >= start.getTime()).sort((a, b) => a.t - b.t).slice(0, 13);
  if (rows.length < 2) throw new Error(`${m.name} liefert für diesen Ort keine Daten`);
  drawChart(rows, m);
}

function drawChart(rows, model) {
  const W = 640, PADL = 40, PADR = 26, n = rows.length;
  const TOP = 22, TH = 130, XL = TOP + TH + 18;
  const RAIN_Y = XL + 14, RAIN_H = 38;
  const SUN_Y = RAIN_Y + RAIN_H + 22, SUN_H = 26;
  const H = SUN_Y + SUN_H + 18;
  const step = (W - PADL - PADR) / (n - 1);
  const x = (i) => PADL + i * step;
  const temps = rows.map(r => r.temp);
  let tmin = Math.floor(Math.min(...temps) - 1), tmax = Math.ceil(Math.max(...temps) + 1);
  if (tmax - tmin < 6) { const m = (tmax + tmin) / 2; tmin = Math.floor(m - 3); tmax = Math.ceil(m + 3); }
  const y = (t) => TOP + TH - (t - tmin) / (tmax - tmin) * TH;

  let svg = '';
  const tickStep = (tmax - tmin) > 14 ? 5 : (tmax - tmin) > 7 ? 2 : 1;
  for (let t = Math.ceil(tmin / tickStep) * tickStep; t <= tmax; t += tickStep) {
    svg += `<line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${y(t)}" y2="${y(t)}"/>`
      + `<text class="rowlbl" x="${PADL - 6}" y="${y(t) + 3}" text-anchor="end">${t}°</text>`;
  }
  const pts = rows.map((r, i) => [x(i), y(r.temp)]);
  const path = pts.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const p0 = pts[i - 1], cx = (p0[0] + p[0]) / 2;
    return `C${cx},${p0[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }).join(' ');
  svg += `<path class="tarea" d="${path} L${x(n - 1)},${TOP + TH} L${x(0)},${TOP + TH} Z"/>`;
  svg += `<path class="tline" d="${path}"/>`;

  const iMin = temps.indexOf(Math.min(...temps)), iMax = temps.indexOf(Math.max(...temps));
  rows.forEach((r, i) => {
    if (i % 3 === 0 || i === iMin || i === iMax) {
      svg += `<circle class="tdot" cx="${x(i)}" cy="${y(r.temp)}" r="3.5"/>`
        + `<text class="tlbl" x="${x(i)}" y="${y(r.temp) - 9}">${fmt(r.temp, 0)}°</text>`;
    }
    if (i % 3 === 0) {
      svg += `<line class="grid" x1="${x(i)}" x2="${x(i)}" y1="${TOP}" y2="${TOP + TH}"/>`
        + `<text class="xlbl" x="${x(i)}" y="${XL}">${i === 0 ? 'jetzt' : new Date(r.t).getHours() + ' Uhr'}</text>`;
    }
  });

  svg += `<text class="rowlbl" x="0" y="${RAIN_Y - 3}">Niederschlag (mm)</text>`;
  const rmax = Math.max(1, ...rows.map(r => r.mm));
  const bw = Math.min(step * 0.7, 30);
  rows.forEach((r, i) => {
    if (i === 0) return;
    const cx = x(i) - step / 2, h = r.mm > 0 ? Math.max(2, r.mm / rmax * RAIN_H) : 0;
    svg += `<line class="grid" x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${RAIN_Y + RAIN_H}" y2="${RAIN_Y + RAIN_H}"/>`;
    if (h) svg += `<rect class="rbar" x="${cx - bw / 2}" y="${RAIN_Y + RAIN_H - h}" width="${bw}" height="${h}" rx="2"/>`
      + `<text class="rval" x="${cx}" y="${RAIN_Y + RAIN_H - h - 3}">${fmt(r.mm)}</text>`;
  });

  const hasSun = rows.some(r => r.sun != null);
  svg += `<text class="rowlbl" x="0" y="${SUN_Y - 3}">Sonnenschein (min)${hasSun ? '' : ' – vom Modell nicht geliefert'}</text>`;
  rows.forEach((r, i) => {
    if (i === 0) return;
    const cx = x(i) - step / 2, m = Math.min(60, r.sun ?? 0), h = m > 0 ? Math.max(2, m / 60 * SUN_H) : 0;
    svg += `<line class="grid" x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${SUN_Y + SUN_H}" y2="${SUN_Y + SUN_H}"/>`;
    if (h) svg += `<rect class="sbar" x="${cx - bw / 2}" y="${SUN_Y + SUN_H - h}" width="${bw}" height="${h}" rx="2"/>`;
    if (m >= 1) svg += `<text class="sval" x="${cx}" y="${SUN_Y + SUN_H + 12}">${fmt(m, 0)}</text>`;
  });

  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${svg}</svg>`;
  const rain = rows.slice(1).reduce((a, r) => a + (r.mm || 0), 0);
  const sun = rows.slice(1).reduce((a, r) => a + Math.min(60, r.sun || 0), 0);
  const sunTxt = !hasSun ? '–' : sun >= 60 ? `${fmt(sun / 60, 1)} h` : `${fmt(sun, 0)} min`;
  $('#chartInfo').textContent = `Summe 12 h: ${fmt(rain)} mm Niederschlag · ${sunTxt} Sonne · Min ${fmt(Math.min(...temps), 0)}° / Max ${fmt(Math.max(...temps), 0)}° · ${model.name.replace(' (Standard)', '')}`;
}

function initModelSelect() {
  const sel = $('#modelSelect');
  const groups = {};
  for (const m of MODELS) (groups[m.group] ||= []).push(m);
  sel.innerHTML = Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map(m => `<option value="${m.key}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
  sel.value = currentModel().key;
  sel.onchange = () => {
    S.model = sel.value; save();
    if (S.loc) loadForecast(S.loc.lat, S.loc.lon).catch(showForecastError);
  };
}
function showForecastError(e) {
  $('#chart').innerHTML = '';
  $('#chartInfo').textContent = `Vorhersage nicht abrufbar (${e.message}). Bitte anderes Modell wählen.`;
}

// ---------- 3. Warnungen ----------
const sevRank = (s) => ({ minor: 1, moderate: 2, severe: 3, extreme: 4 }[s] || 0);
async function loadWarnings(lat, lon) {
  const d = await getJSON(`${BS}/alerts?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&tz=Europe/Berlin`);
  const list = (d.alerts || []).sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const box = $('#warnings'); box.innerHTML = '';
  const place = d.location?.name ? ` für ${d.location.name}` : '';
  if (!list.length) { box.innerHTML = `<div class="warn-none">✅ Keine amtlichen DWD-Warnungen${esc(place)}</div>`; return; }
  const dt = (s) => s ? new Date(s).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  for (const a of list) {
    const heat = /HITZE/i.test(a.event_de || '') || /HITZE/i.test(a.headline_de || '');
    const el = document.createElement('div');
    el.className = `warn ${heat ? 'heat' : (a.severity || 'minor')}`;
    el.innerHTML = `<div class="w-title">${heat ? '🌡️' : '⚠️'} ${esc(a.headline_de || a.event_de)}</div>`
      + `<div class="w-time">${esc(dt(a.onset))}${a.expires ? ' – ' + esc(dt(a.expires)) : ''}${esc(place)} · antippen für Details</div>`
      + `<div class="w-det">${esc(a.description_de)}${a.instruction_de ? '\n\n' + esc(a.instruction_de) : ''}</div>`;
    el.onclick = () => el.classList.toggle('open');
    box.appendChild(el);
  }
  if (S.warnNotify) {
    let seen; try { seen = JSON.parse(localStorage.getItem(LS_WARN) || '[]'); } catch { seen = []; }
    for (const a of list) {
      const id = a.alert_id || a.id; if (!id || seen.includes(id)) continue;
      if (await notify(`⚠️ ${a.headline_de || a.event_de}`, a.description_de || '', `warn-${id}`)) seen.push(id);
    }
    localStorage.setItem(LS_WARN, JSON.stringify(seen.slice(-50)));
  }
}

// ---------- 4. Karte: Radar & Satellit ----------
let map, marker, radarLayer, satLayer, activeBase = null;
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
function initMap() {
  map = L.map('map', { maxZoom: 14 }).setView([49.6, 11.0], 8);
  setBase(S.basemap, false);
  map.attributionControl.addAttribution('Radar: <a href="https://www.dwd.de/" target="_blank" rel="noopener">DWD</a>');
  radarLayer = L.tileLayer.wms(DWD_WMS, { layers: DWD_RADAR, format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, opacity: 0.8, zIndex: 20 });
  satLayer = L.tileLayer.wms(SAT_WMS, { layers: satLayerName(), format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, opacity: 0.85, zIndex: 10, attribution: 'Satellit © <a href="https://www.eumetsat.int/" target="_blank" rel="noopener">EUMETSAT</a>' });
  satLayer.on('tileerror', () => { if (!satLayer._warned) { satLayer._warned = true; toast('Satellitenbild derzeit nicht abrufbar.'); } });
  map.on('contextmenu', (e) => {
    const div = document.createElement('div'), b = document.createElement('button');
    div.innerHTML = `<div style="margin-bottom:.4rem">${fmt(e.latlng.lat, 4)}, ${fmt(e.latlng.lng, 4)}</div>`;
    b.textContent = 'Als Standort setzen';
    b.onclick = async () => { map.closePopup(); setLocation(e.latlng.lat, e.latlng.lng, await reverseGeocode(e.latlng.lat, e.latlng.lng)); };
    div.appendChild(b); L.popup().setLatLng(e.latlng).setContent(div).openOn(map);
  });
  setMapMode(S.mapMode, false);
}
function satLayerName() {
  if (S.sat === 'vis') return SAT_VIS;
  if (S.sat === 'ir') return SAT_IR;
  const p = S.loc || { lat: 50, lon: 10 };
  return sunElevation(p.lat, p.lon) > 5 ? SAT_VIS : SAT_IR;
}
function setMapMode(mode, persist = true) {
  S.mapMode = mode; if (persist) save();
  ['Radar', 'Sat', 'Both'].forEach(k => $('#tab' + k).classList.toggle('active', { Radar: 'radar', Sat: 'sat', Both: 'both' }[k] === mode));
  const showR = mode !== 'sat', showS = mode !== 'radar';
  if (showR) radarLayer.addTo(map); else map.removeLayer(radarLayer);
  if (showS) { satLayer.setParams({ layers: satLayerName() }, true); satLayer.addTo(map); } else map.removeLayer(satLayer);
  $('#mapTitle').textContent = mode === 'radar' ? 'Regenradar' : mode === 'sat' ? 'Satellitenbild' : 'Radar & Satellit';
  $('#radarLegend').style.display = showR ? '' : 'none';
  updateMapTime();
}
let radarTime = null;
function updateMapTime() {
  const parts = [];
  if (S.mapMode !== 'sat') parts.push(`Radar ${radarTime ? hhmm(radarTime) : 'aktuell'}`);
  if (S.mapMode !== 'radar') parts.push(`Satellit ${satLayerName() === SAT_VIS ? 'Echtfarben' : 'Infrarot'} (ca. 15 min Verzug)`);
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
  if (!marker) marker = L.marker(ll).addTo(map); else marker.setLatLng(ll);
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
  const q = new URLSearchParams({
    lat: lat.toFixed(4), lon: lon.toFixed(4), distance: String((NEAR_KM + 2) * 1000),
    date: new Date(now - 15 * 60000).toISOString(), last_date: new Date(now + 125 * 60000).toISOString(),
    format: 'DecompressionStream' in window ? 'compressed' : 'plain'
  });
  const d = await getJSON(`${BS}/radar?${q}`);
  const recs = (d.radar || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!recs.length) throw new Error('keine Radardaten');
  let w, h, le = null; const frames = [];
  for (const r of recs) {
    let data; const p = r.precipitation_5;
    if (Array.isArray(p)) { h = p.length; w = p[0].length; data = new Uint16Array(w * h); for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) data[yy * w + xx] = p[yy][xx] ?? 0; }
    else {
      const b = await inflate(p); if (le === null) le = bad(u16(b, true)) <= bad(u16(b, false)); data = u16(b, le);
      if (d.bbox) { h = d.bbox[2] - d.bbox[0] + 1; w = d.bbox[3] - d.bbox[1] + 1; } else w = h = Math.round(Math.sqrt(data.length));
    }
    if (data.length !== w * h) throw new Error('unerwartetes Radar-Gitter');
    frames.push({ t: new Date(r.timestamp).getTime(), data });
  }
  let px = (w - 1) / 2, py = (h - 1) / 2;
  if (d.latlon_position && typeof d.latlon_position.x === 'number') {
    px = d.latlon_position.x; py = d.latlon_position.y;
    if (d.bbox && (px >= w || py >= h)) { px -= d.bbox[1]; py -= d.bbox[0]; }
  }
  return analyzeRadar({ frames, w, h, px, py }, lon);
}
function analyzeRadar(R, lon) {
  const { w, h, px, py } = R, rot = lon - 10;
  const st = R.frames.map(f => {
    let loc = 0, minD = Infinity, minB = null;
    for (let yy = Math.max(0, Math.floor(py - NEAR_KM)); yy <= Math.min(h - 1, Math.ceil(py + NEAR_KM)); yy++)
      for (let xx = Math.max(0, Math.floor(px - NEAR_KM)); xx <= Math.min(w - 1, Math.ceil(px + NEAR_KM)); xx++) {
        const dx = xx - px, dy = py - yy, dist = Math.hypot(dx, dy); if (dist > NEAR_KM) continue;
        const v = f.data[yy * w + xx]; if (v >= 2500) continue;
        if (dist <= LOC_KM && v > loc) loc = v;
        if (v >= RAIN_RAW && dist < minD) { minD = dist; minB = (Math.atan2(dx, dy) * 180 / Math.PI + rot + 360) % 360; }
      }
    return { t: f.t, loc, minD: isFinite(minD) ? minD : null, minB };
  });
  const now = Date.now(); let ni = 0; st.forEach((s, i) => { if (s.t <= now + 60000) ni = i; });
  const cur = st[ni]; let eta = null, until = null;
  if (cur.loc < RAIN_RAW) { for (let i = ni + 1; i < st.length; i++) if (st[i].loc >= RAIN_RAW) { eta = Math.max(0, Math.round((st[i].t - now) / 60000)); break; } }
  else { for (let i = ni + 1; i < st.length; i++) if (st[i].loc < RAIN_RAW) { until = Math.round((st[i].t - now) / 60000); break; } }
  return { t: cur.t, atLoc: cur.loc >= RAIN_RAW, mmh: cur.loc * 0.12, eta, until, minD: cur.minD, minB: cur.minB };
}
function renderRainHint(r) {
  const el = $('#rainHint');
  radarTime = r?.t || null; updateMapTime();
  if (!r) { el.className = 'rainhint small'; el.textContent = ''; return; }
  if (r.atLoc) {
    el.className = 'rainhint small danger';
    el.textContent = `🌧️ Es regnet am Standort (ca. ${fmt(r.mmh)} mm/h)` + (r.until != null ? ` – laut Radarvorhersage vorbei in ~${r.until} min` : ' – hält laut Radarvorhersage über 2 h an');
  } else if (r.eta != null) {
    el.className = 'rainhint small danger';
    el.textContent = `🌂 Regen erreicht den Standort in ca. ${r.eta} min (gegen ${hhmm(Date.now() + r.eta * 60000)})`;
    rainNotify(`Regen in ca. ${r.eta} min`, `Laut DWD-Radarvorhersage gegen ${hhmm(Date.now() + r.eta * 60000)}.`);
  } else if (r.minD != null) {
    el.className = 'rainhint small warn';
    el.textContent = `🌦️ Regen ${fmt(r.minD, 0)} km ${dirName(r.minB)} – laut Radarvorhersage nicht am Standort in den nächsten 2 h`;
  } else {
    el.className = 'rainhint small ok';
    el.textContent = `✅ Kein Regen im Umkreis von ${NEAR_KM} km – auch in den nächsten 2 h nicht erwartet`;
  }
}
async function rainNotify(title, body) {
  const last = Number(localStorage.getItem(LS_RAIN) || 0);
  if (Date.now() - last < 60 * 60000) return;
  if (await notify(`🌂 ${title}`, body, 'rain')) localStorage.setItem(LS_RAIN, String(Date.now()));
}
async function notify(title, body, tag) {
  const allowed = tag === 'rain' ? S.notify : S.warnNotify;
  if (!allowed || !('Notification' in window) || Notification.permission !== 'granted') return false;
  const o = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag, renotify: true };
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
  S.loc = { lat, lon, name: info?.name || `${fmt(lat, 3)}, ${fmt(lon, 3)}`, sub: info?.sub || '' }; save();
  renderLoc(); drawMarker(); map.setView([lat, lon], 9); refresh();
}
function renderLoc() {
  $('#locName').textContent = S.loc ? S.loc.name : 'Kein Standort';
  $('#locSub').textContent = S.loc ? (S.loc.sub || `${fmt(S.loc.lat, 3)}, ${fmt(S.loc.lon, 3)}`) : 'Standort ermitteln oder suchen';
}

// ---------- Aktualisierung ----------
let busy = false;
async function refresh() {
  if (!S.loc || busy) return; busy = true; $('#btnRefresh').textContent = '⏳';
  const { lat, lon } = S.loc;
  refreshMapLayers();
  await Promise.allSettled([
    loadCurrent(lat, lon).catch(e => { $('#nowStation').textContent = `Aktuelle Werte nicht abrufbar (${e.message})`; }),
    loadForecast(lat, lon).catch(showForecastError),
    loadWarnings(lat, lon).catch(() => { $('#warnings').innerHTML = '<div class="warn-none">Warnungen derzeit nicht abrufbar</div>'; }),
    loadRadar(lat, lon).then(renderRainHint).catch(() => renderRainHint(null))
  ]);
  busy = false; $('#btnRefresh').textContent = '↻';
}
let timer;
const schedule = () => { clearInterval(timer); timer = setInterval(refresh, S.intervalMin * 60000); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

// ---------- Einstellungen ----------
function initSettings() {
  const bind = (sel, key, conv = v => v, after) => {
    const el = $(sel);
    if (el.type === 'checkbox') el.checked = S[key]; else el.value = String(S[key]);
    el.onchange = async () => {
      if (el.type === 'checkbox' && el.checked && (key === 'notify' || key === 'warnNotify')) {
        if (!('Notification' in window) || await Notification.requestPermission() !== 'granted') { el.checked = false; toast('Benachrichtigungen nicht erlaubt.'); return; }
      }
      S[key] = el.type === 'checkbox' ? el.checked : conv(el.value); save(); after?.();
    };
  };
  bind('#setBasemap', 'basemap', v => v, () => setBase(S.basemap));
  bind('#setSat', 'sat', v => v, () => { satLayer.setParams({ layers: satLayerName() }); updateMapTime(); });
  bind('#setInterval', 'intervalMin', Number, schedule);
  bind('#setNotify', 'notify'); bind('#setWarnNotify', 'warnNotify'); bind('#setAuto', 'autoLocate');
}

// ---------- Start ----------
function init() {
  $('#bkgYear').textContent = `(${YEAR})`;
  initModelSelect(); initSettings(); initMap(); renderLoc();
  $('#modelInfo').textContent = currentModel().info;
  $('#btnLocate').onclick = locate; $('#btnSearch').onclick = openSearch; $('#btnRefresh').onclick = refresh;
  $('#btnSettings').onclick = () => $('#dlgSettings').showModal();
  $('#btnCloseSearch').onclick = () => $('#dlgSearch').close();
  $('#searchForm').onsubmit = (e) => { e.preventDefault(); doSearch(); };
  $('#tabRadar').onclick = () => setMapMode('radar'); $('#tabSat').onclick = () => setMapMode('sat'); $('#tabBoth').onclick = () => setMapMode('both');
  if (S.loc) { drawMarker(); map.setView([S.loc.lat, S.loc.lon], 9); refresh(); }
  if (S.autoLocate || !S.loc) locate();
  schedule();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
