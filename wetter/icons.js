/* Eigene SVG-Icons – unabhängig von Emoji-Schriften des Geräts */
'use strict';
(function () {
  const C = { sun: '#f5b301', moon: '#f2d16b', cloud: '#e9eef5', cloudLine: '#8796a8', dark: '#9aa7b6', rain: '#2f7fff', snow: '#7cc4ff', bolt: '#ffc400', fog: '#9aa7b6' };
  const cloudPath = 'M17 50h31a11 11 0 0 0 1.5-21.9A15 15 0 0 0 20.3 25 12.5 12.5 0 0 0 17 50z';
  const cloud = (dx = 0, dy = 0, s = 1, fill = C.cloud) =>
    `<g transform="translate(${dx} ${dy}) scale(${s})"><path d="${cloudPath}" fill="${fill}" stroke="${C.cloudLine}" stroke-width="2.2" stroke-linejoin="round"/></g>`;
  const sun = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r1 = r + 4, r2 = r + 9;
      rays += `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}" stroke="${C.sun}" stroke-width="3.2" stroke-linecap="round"/>`;
    }
    return `${rays}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.sun}"/>`;
  };
  const moon = (cx, cy, r) => `<path d="M${cx + r * 0.35} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55} a${r * 0.8} ${r * 0.8} 0 0 1 -${r * 0.65} -${r * 1.55}z" fill="${C.moon}" stroke="#c9a93c" stroke-width="1.5"/>`;
  const drops = (n = 3, col = C.rain) => [20, 32, 44].slice(0, n).map(x => `<line x1="${x + 2}" y1="53" x2="${x - 2}" y2="61" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>`).join('');
  const flake = (x, y) => `<g stroke="${C.snow}" stroke-width="2.4" stroke-linecap="round"><line x1="${x}" y1="${y - 4.5}" x2="${x}" y2="${y + 4.5}"/><line x1="${x - 4}" y1="${y - 2.3}" x2="${x + 4}" y2="${y + 2.3}"/><line x1="${x - 4}" y1="${y + 2.3}" x2="${x + 4}" y2="${y - 2.3}"/></g>`;
  const svg = (inner) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

  const WEATHER = {
    'clear-day': svg(sun(32, 32, 13)),
    'clear-night': svg(moon(30, 32, 18)),
    'partly-cloudy-day': svg(sun(40, 22, 10) + cloud(-4, 6, 1)),
    'partly-cloudy-night': svg(moon(40, 20, 11) + cloud(-4, 6, 1)),
    cloudy: svg(cloud(8, -6, 0.85, '#d5dde8') + cloud(-2, 4, 1)),
    fog: svg(cloud(0, -8, 1) + [48, 54, 60].map((y, i) => `<line x1="${10 + i * 3}" y1="${y}" x2="${54 - i * 3}" y2="${y}" stroke="${C.fog}" stroke-width="3" stroke-linecap="round"/>`).join('')),
    wind: svg(`<g fill="none" stroke="${C.dark}" stroke-width="3.5" stroke-linecap="round"><path d="M8 26h30a7 7 0 1 0-7-7"/><path d="M8 36h40a7 7 0 1 1-7 7"/><path d="M8 46h20"/></g>`),
    rain: svg(cloud(0, -8, 1) + drops(3)),
    showers: svg(sun(42, 18, 9) + cloud(-4, -4, 1) + drops(2)),
    sleet: svg(cloud(0, -8, 1) + `<line x1="22" y1="53" x2="18" y2="61" stroke="${C.rain}" stroke-width="3.2" stroke-linecap="round"/>` + flake(38, 56)),
    snow: svg(cloud(0, -8, 1) + flake(22, 55) + flake(40, 56)),
    hail: svg(cloud(0, -8, 1) + [20, 32, 44].map(x => `<circle cx="${x}" cy="56" r="3.2" fill="#b9d9f5" stroke="${C.rain}" stroke-width="1.5"/>`).join('')),
    thunderstorm: svg(cloud(0, -8, 1) + `<path d="M34 42l-9 12h7l-4 9 11-13h-7l4-8z" fill="${C.bolt}" stroke="#c99a00" stroke-width="1.2" stroke-linejoin="round"/>`),
    unknown: svg(cloud(0, 0, 1))
  };

  const ui = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const moonHalf = '<path d="M5.5 17a6.5 6.5 0 0 1 13 0z" fill="#e8e3cf" stroke="#a9a28a" stroke-width="1"/><path d="M8.5 15.2a1.1 1.1 0 1 0 0 .01M14.3 13.6a1.4 1.4 0 1 0 0 .01" stroke="#b9b29a" stroke-width="1"/><path d="M2 20.5h20"/>';
  const sunHalf = '<path d="M5.5 17a6.5 6.5 0 0 1 13 0z" fill="#f5b301" stroke="#e0a000" stroke-width="1"/><path d="M2 20.5h20"/>';
  const starPath = 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z';
  const UI = {
    gps: ui('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    search: ui('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    refresh: ui('<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>'),
    gear: ui('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    install: ui('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
    star: ui(`<path d="${starPath}"/>`),
    starFill: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${starPath}" fill="#ffd43b" stroke="#f59f00" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    edit: ui('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
    trash: ui('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
    up: ui('<path d="M6 15l6-6 6 6"/>'),
    down: ui('<path d="M6 9l6 6 6-6"/>'),
    grip: ui('<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>'),
    ok: ui('<path d="M5 12l5 5 9-10"/>'),
    layout: ui('<rect x="3" y="3" width="18" height="5" rx="1.5"/><rect x="3" y="10" width="18" height="5" rx="1.5"/><rect x="3" y="17" width="18" height="4" rx="1.5"/>'),
    wind: ui('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>'),
    drop: ui('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
    umbrella: ui('<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 1-4 0"/>'),
    cloud: ui('<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>'),
    gauge: ui('<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 13l4-4"/>'),
    warn: ui('<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/>'),
    thermo: ui('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
    check: ui('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'),
    station: ui('<path d="M12 21V10"/><path d="M8 21h8"/><circle cx="12" cy="7" r="2"/><path d="M7.8 3.8a6 6 0 0 0 0 6.4"/><path d="M16.2 3.8a6 6 0 0 1 0 6.4"/>'),
    chevron: ui('<path d="M6 9l6 6 6-6"/>'),
    expand: ui('<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>'),
    collapse: ui('<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>'),
    rainIco: ui('<path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14z"/><path d="M9 17l-1 3"/><path d="M13 17l-1 3"/><path d="M17 17l-1 3"/>'),
    sunrise: ui(sunHalf + '<path d="M12 2.5v6"/><path d="M9.3 5.2L12 2.5l2.7 2.7"/>'),
    sunset: ui(sunHalf + '<path d="M12 2.5v6"/><path d="M9.3 5.8L12 8.5l2.7-2.7"/>'),
    moonrise: ui(moonHalf + '<path d="M12 2.5v6"/><path d="M9.3 5.2L12 2.5l2.7 2.7"/>'),
    moonset: ui(moonHalf + '<path d="M12 2.5v6"/><path d="M9.3 5.8L12 8.5l2.7-2.7"/>'),
    daylen: ui('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    clock: ui('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    flower: ui('<circle cx="12" cy="9" r="2.2"/><path d="M12 6.8a2.6 2.6 0 1 1 2.2-3.9M14.2 9a2.6 2.6 0 1 1 1.4 4.3M12 11.2a2.6 2.6 0 1 1-2.6 3.3M9.8 9a2.6 2.6 0 1 1-1.4-4.3"/><path d="M12 13v8"/><path d="M12 18c-2 0-3.5-1-4-3"/>'),
    map: ui('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
    chart: ui('<path d="M3 20h18"/><path d="M4 16l5-6 4 3 6-8"/>'),
    text: ui('<path d="M4 6h16M4 11h16M4 16h10"/>'),
    calendar: ui('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    bars: ui('<path d="M5 20V14M10 20V8M15 20V11M20 20V5"/>'),
    play: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>`,
    pause: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>`,
    snowflake: ui('<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>'),
    ice: ui('<path d="M3 20h18"/><path d="M6 20l2-4M11 20l2-4M16 20l2-4"/><path d="M12 3v8M8.5 5l7 4M15.5 5l-7 4"/>')
  };

  window.ICONS = { weather: (k) => WEATHER[k] || WEATHER.unknown, ui: (k) => UI[k] || '' };
})();
