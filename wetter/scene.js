/* Hintergrundszene – Landschaft nach Jahreszeit, Tageszeit und Wetter, komplett als SVG gezeichnet (keine Bilddateien).
 * window.SCENE.svg(state) liefert das SVG, state = {
 *   season: 'spring' | 'summer' | 'autumn' | 'winter',  phase: 'dawn' | 'day' | 'dusk' | 'night',
 *   sky: 'clear' | 'partly' | 'cloudy' | 'fog',  precip: null | 'rain' | 'sleet' | 'snow' | 'hail',
 *   storm, hot, windy, snowCover, frost: boolean,  moon: null | Mondphase 0–1 (0 Neumond, 0,5 Vollmond), wenn er über dem Horizont steht }
 * Animationen (Wolken, Regen, Schnee, Laub, Blitz) stehen als .sc-* in style.css.
 */
(() => {
  const W = 1200, H = 1600, HORIZON = 1060;
  let uid = 0;   // eindeutige Verlaufs-IDs – beim Überblenden liegen zwei Szenen gleichzeitig im Dokument

  // Fester Zufall: gleiche Szene bei jedem Zeichnen, nur der Zustand ändert sie
  const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const f = (n) => Math.round(n * 10) / 10;

  // ---------- Farben ----------
  const SKY = {
    day: { clear: ['#2a78d6', '#a9d6f7'], partly: ['#4686cf', '#b8d6ee'], cloudy: ['#7e8c9a', '#bcc6cf'], fog: ['#b9c1c7', '#e1e5e8'], storm: ['#39424e', '#6c7783'] },
    hot: { clear: ['#1b6ad4', '#d3ebf8'] },
    dawn: { clear: ['#3e5b9c', '#f7b98d'], partly: ['#4d6299', '#f0b694'], cloudy: ['#5f6878', '#b9a59a'], fog: ['#8f97a3', '#d9cfc8'], storm: ['#2e3542', '#5e6270'] },
    dusk: { clear: ['#27397a', '#f28a58'], partly: ['#34417a', '#e8946a'], cloudy: ['#4c5363', '#a88d80'], fog: ['#7d8592', '#c9b8ad'], storm: ['#262c38', '#55545c'] },
    night: { clear: ['#060d26', '#1d3263'], partly: ['#0b1430', '#26375e'], cloudy: ['#12171f', '#2b333e'], fog: ['#1e242c', '#3a434d'], storm: ['#0b0e13', '#242a33'] }
  };
  // Licht über der Landschaft: Nacht dunkelblau, Dämmerung warm, trüb grau
  const LIGHT = {
    dawn: ['#ff9a55', 0.16, '#1c2348', 0.22], dusk: ['#ff7a40', 0.2, '#1c2348', 0.3],
    night: ['#08102e', 0.62], cloudy: ['#5f6a75', 0.2], storm: ['#262d36', 0.42], fog: ['#c9d0d6', 0.3]
  };
  const SEASON = {
    spring: { far: '#8db7a6', hill: '#79b061', hill2: '#5f9c4b', meadow: ['#86c85d', '#5b9e40'], crowns: ['#7cc45a', '#93d46c', '#69b14b', '#a3d977'], blossom: ['#f7c3d6', '#fde4ee', '#fbeef3', '#f3a9c4'], flowers: ['#ffd84d', '#ffffff', '#e86aa6', '#9f7be0', '#ff8a5c'] },
    summer: { far: '#7fa6a0', hill: '#5f9a48', hill2: '#4a873a', meadow: ['#74ad4f', '#4f8a36'], crowns: ['#2f7d32', '#3d8f3a', '#4f9c40', '#2a6e2e'], field: ['#ecc862', '#d7a843'] },
    autumn: { far: '#9aa7a6', hill: '#a9a24e', hill2: '#8f9a3e', meadow: ['#b5b04f', '#86913b'], crowns: ['#e0662c', '#f2a33a', '#c9402f', '#f5c542', '#b5542a', '#e88a2e', '#9a9a3a'], leaves: ['#e0662c', '#f2a33a', '#c9402f', '#f5c542', '#b5542a'] },
    winter: { far: '#a7b4bf', hill: '#8f9a7f', hill2: '#7b8869', meadow: ['#93a07f', '#717e5f'], crowns: ['#2c5a3f'] }
  };
  const SNOW = { far: '#e6ecf3', hill: '#f1f5f9', hill2: '#e3eaf2', meadow: ['#f6f9fc', '#dde6ef'] };

  // ---------- Mond ----------
  // Beleuchteter Teil: Außenrand als Halbkreis, Schattengrenze als Halbellipse (zunehmend rechts hell, abnehmend links – Nordhalbkugel)
  function moonLit(phase, cx, cy, R) {
    const waxing = phase < 0.5, k = waxing ? phase * 2 : (1 - phase) * 2;   // 0 = neu, 1 = voll
    const rx = Math.abs(1 - 2 * k) * R, gibbous = k > 0.5;
    const d = `M${f(cx)} ${f(cy - R)} A${R} ${R} 0 0 1 ${f(cx)} ${f(cy + R)} A${f(rx)} ${R} 0 0 ${gibbous ? 1 : 0} ${f(cx)} ${f(cy - R)} Z`;
    return d;   // abnehmend: Spiegelung per transform in moon()
  }
  function moon(phase, cx, cy, R, lit, dark) {
    const waxing = phase < 0.5, tr = waxing ? '' : ` transform="translate(${f(2 * cx)} 0) scale(-1 1)"`;
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${R}" fill="${dark}"/><path d="${moonLit(phase, cx, cy, R)}" fill="${lit}"${tr}/>`;
  }
  const moonIcon = (phase) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${moon(phase, 12, 12, 9, '#f2d16b', 'rgba(140,150,165,.35)')}<circle cx="12" cy="12" r="9" fill="none" stroke="#a9a28a" stroke-width="1"/></svg>`;

  // ---------- Formen ----------
  const ridge = (r, y0, amp, n) => {   // Hügelkamm als geglätteter Pfad
    const pts = []; for (let i = 0; i <= n; i++) pts.push([i * (W + 200) / n - 100, y0 - amp * (0.35 + 0.65 * r())]);
    let d = `M-100 ${H} L${pts[0][0]} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0_] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; d += ` Q${x0} ${f(y0_)} ${mx} ${f((y0_ + y1) / 2)}`; }
    return { d: d + ` L${W + 100} ${H} Z`, at: (x) => { const t = (x + 100) / ((W + 200) / n), i = Math.max(0, Math.min(n - 1, Math.floor(t))), u = t - i; return pts[i][1] * (1 - u) + pts[i + 1][1] * u; } };
  };
  const cloud = (x, y, s, fill, op) => `<g opacity="${op}" fill="${fill}"><ellipse cx="${x}" cy="${y}" rx="${f(s * 1.1)}" ry="${f(s * 0.42)}"/><circle cx="${f(x - s * 0.45)}" cy="${f(y - s * 0.18)}" r="${f(s * 0.38)}"/><circle cx="${f(x + s * 0.05)}" cy="${f(y - s * 0.38)}" r="${f(s * 0.5)}"/><circle cx="${f(x + s * 0.55)}" cy="${f(y - s * 0.16)}" r="${f(s * 0.36)}"/></g>`;
  function decid(r, x, y, s, cols, bare, frost) {
    const tw = s * 0.11, trunk = `<path d="M${f(x - tw / 2)} ${y} L${f(x - tw / 3)} ${f(y - s * 0.62)} L${f(x + tw / 3)} ${f(y - s * 0.62)} L${f(x + tw / 2)} ${y} Z" fill="#5a4535"/>`;
    if (bare) {
      let br = ''; const c = frost ? '#d9e2ea' : '#5a4535';
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.9, L = s * (0.35 + r() * 0.35), by = y - s * (0.35 + r() * 0.3); br += `<path d="M${f(x)} ${f(by)} q${f(Math.cos(a) * L * 0.4)} ${f(Math.sin(a) * L * 0.6)} ${f(Math.cos(a) * L)} ${f(Math.sin(a) * L)}" stroke="${c}" stroke-width="${f(Math.max(2, s * 0.03))}" fill="none" stroke-linecap="round"/>`; }
      return `<g>${trunk}${br}</g>`;
    }
    const cy = y - s * 0.78; let crown = '';
    for (let i = 0; i < 5; i++) crown += `<circle cx="${f(x + (r() - 0.5) * s * 0.55)}" cy="${f(cy + (r() - 0.5) * s * 0.35)}" r="${f(s * (0.26 + r() * 0.12))}" fill="${pick(r, cols)}"/>`;
    crown += `<circle cx="${f(x - s * 0.1)}" cy="${f(cy - s * 0.16)}" r="${f(s * 0.16)}" fill="#fff" opacity=".12"/>`;
    return `<g>${trunk}${crown}</g>`;
  }
  function conifer(x, y, s, col, snow) {
    let g = `<rect x="${f(x - s * 0.04)}" y="${f(y - s * 0.18)}" width="${f(s * 0.08)}" height="${f(s * 0.18)}" fill="#4a3a2c"/>`;
    for (let i = 0; i < 3; i++) {
      const top = y - s * (0.55 + i * 0.28), base = y - s * (0.12 + i * 0.26), hw = s * (0.34 - i * 0.08);
      g += `<path d="M${f(x)} ${f(top)} L${f(x + hw)} ${f(base)} L${f(x - hw)} ${f(base)} Z" fill="${col}"/>`;
      if (snow) g += `<path d="M${f(x)} ${f(top)} L${f(x + hw * 0.55)} ${f(top + (base - top) * 0.55)} L${f(x + hw * 0.15)} ${f(top + (base - top) * 0.45)} L${f(x - hw * 0.2)} ${f(top + (base - top) * 0.58)} L${f(x - hw * 0.55)} ${f(top + (base - top) * 0.55)} Z" fill="#f4f8fc"/>`;
    }
    return `<g>${g}</g>`;
  }

  // ---------- Szene ----------
  function svg(st) {
    const id = `sc${++uid}`;
    let r = rng(1);   // jede Ebene mit eigenem Startwert – Bäume usw. bleiben stehen, wenn sich das Wetter ändert
    const season = SEASON[st.season] || SEASON.summer, snowy = !!st.snowCover;
    const P = snowy ? { ...season, ...SNOW } : season;
    const skyKey = st.storm ? 'storm' : st.sky;
    const skyCols = (st.phase === 'day' && st.hot && st.sky === 'clear' ? SKY.hot.clear : null) || SKY[st.phase][skyKey] || SKY.day.clear;
    const night = st.phase === 'night', low = st.phase === 'dawn' || st.phase === 'dusk';
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">`;
    o += `<defs><linearGradient id="${id}Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyCols[0]}"/><stop offset="${f(HORIZON / H)}" stop-color="${skyCols[1]}"/></linearGradient>`
      + `<radialGradient id="${id}Glow"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".25" stop-color="#ffe08a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id}LowGlow"><stop offset="0" stop-color="#ffd08a" stop-opacity=".9"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id}Fog"><stop offset="0" stop-color="#eef1f3" stop-opacity=".85"/><stop offset="1" stop-color="#eef1f3" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id}Meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.meadow[0]}"/><stop offset="1" stop-color="${P.meadow[1]}"/></linearGradient></defs>`;
    o += `<rect width="${W}" height="${H}" fill="url(#${id}Sky)"/>`;

    // Sterne und Mond / Sonne
    const clearish = st.sky === 'clear' || st.sky === 'partly';
    if (night && clearish && !st.precip) {
      let stars = ''; for (let i = 0; i < 90; i++) stars += `<circle cx="${f(r() * W)}" cy="${f(r() * HORIZON * 0.8)}" r="${f(0.8 + r() * 1.8)}" fill="#fff" opacity="${f(0.35 + r() * 0.6)}"/>`;
      o += `<g class="sc-stars">${stars}</g>`;
      if (st.moon != null && Math.min(st.moon, 1 - st.moon) > 0.03) {
        const full = 1 - Math.abs(0.5 - st.moon) * 2;   // Lichtschein wächst mit der Phase
        o += `<circle cx="820" cy="300" r="190" fill="#f3efe0" opacity="${f(0.03 + 0.07 * full)}"/>${moon(st.moon, 820, 300, 70, '#f3efe0', 'rgba(20,30,60,.35)')}`;
      }
    } else if (!night && !st.precip && st.sky !== 'fog' && st.sky !== 'cloudy' && !st.storm) {
      if (low) {
        const sx = st.phase === 'dawn' ? 330 : 870;
        o += `<circle cx="${sx}" cy="${HORIZON - 150}" r="380" fill="url(#${id}LowGlow)" opacity="${st.sky === 'clear' ? 0.9 : 0.6}"/><circle cx="${sx}" cy="${HORIZON - 150}" r="62" fill="#ffd9a0"/>`;
      } else {
        const sr = st.hot ? 105 : 80;
        o += `<circle cx="840" cy="300" r="${sr * 5}" fill="url(#${id}Glow)" opacity="${st.sky === 'clear' ? 1 : 0.7}"/><circle cx="840" cy="300" r="${sr}" fill="#fff4c4"/>`;
      }
    }

    // Wolken
    const nCl = st.storm ? 9 : { clear: 1, partly: 4, cloudy: 8, fog: 3 }[st.sky] ?? 3;
    const clFill = night ? (st.sky === 'cloudy' || st.storm ? '#2d3540' : '#3a4560') : st.storm ? '#4e5864' : st.sky === 'cloudy' || st.precip ? '#d5dce3' : low ? '#ffe2cc' : '#ffffff';
    let clouds = ''; r = rng(2);
    for (let i = 0; i < nCl; i++) {
      const s = 110 + r() * 150, x = r() * (W + 200) - 100, y = 140 + r() * (st.sky === 'cloudy' || st.storm ? 620 : 520);
      clouds += `<g class="sc-cloud" style="--d:${f(70 + r() * 80)}s;--dx:${f(80 + r() * 160)}px">${cloud(f(x), f(y), s, clFill, f(st.sky === 'cloudy' || st.storm ? 0.95 : 0.8 + r() * 0.2))}</g>`;
    }
    if (st.sky === 'cloudy' || st.storm || st.precip) clouds = `<rect y="0" width="${W}" height="420" fill="${clFill}" opacity="${night ? 0.5 : 0.55}"/>` + clouds;
    o += `<g>${clouds}</g>`;

    // Landschaft
    let land = ''; r = rng(3);
    const far = ridge(r, HORIZON - 20, 190, 7), mid = ridge(r, HORIZON + 90, 120, 9), near = ridge(r, HORIZON + 230, 70, 6);
    land += `<path d="${far.d}" fill="${P.far}"/>`;
    if (!snowy && st.season === 'winter') land += `<path d="${far.d}" fill="#fff" opacity=".25" transform="translate(0 -2)"/>`;
    land += `<path d="${mid.d}" fill="${P.hill}"/>`;
    // Waldsaum auf dem mittleren Hügel
    const trees = []; r = rng(4);
    for (let x = -60; x < W + 60; x += 38 + r() * 34) {
      const y = mid.at(x) + 14 + r() * 26, s = 80 + r() * 70;
      const con = st.season === 'winter' ? r() < 0.55 : r() < 0.22;
      trees.push([y, con ? conifer(x, y, s * 1.1, st.season === 'winter' ? '#2c5a3f' : '#2f6b43', snowy)
        : decid(r, x, y, s, st.season === 'spring' && r() < 0.35 ? P.blossom : P.crowns, st.season === 'winter', st.frost && !snowy)]);
    }
    land += trees.sort((a, b) => a[0] - b[0]).map(t => t[1]).join('');
    land += `<path d="${near.d}" fill="${P.hill2}"/>`;
    // Sommer: Kornfeld im Vordergrund
    if (st.season === 'summer' && !snowy) {
      const fy = HORIZON + 300;
      land += `<path d="M-100 ${H} L-100 ${fy + 40} Q300 ${fy - 10} 650 ${fy + 30} T${W + 100} ${fy + 20} L${W + 100} ${H} Z" fill="${st.hot ? P.field[0] : P.field[1]}"/>`;
      let rows = ''; for (let i = 0; i < 9; i++) rows += `<path d="M${-100 + i * 40} ${H} Q${300 + i * 60} ${fy + 120} ${650 + i * 10} ${fy + 45}" stroke="#c8963a" stroke-width="3" fill="none" opacity=".35"/>`;
      land += rows;
    } else {
      land += `<path d="M-100 ${H} L-100 ${HORIZON + 330} Q350 ${HORIZON + 280} 700 ${HORIZON + 320} T${W + 100} ${HORIZON + 300} L${W + 100} ${H} Z" fill="url(#${id}Meadow)"/>`;
    }
    // Vordergrund-Bäume links und rechts
    r = rng(5);
    // (Hochformat zeigt etwa x 200–1000, Querformat die volle Breite)
    land += st.season === 'winter' ? conifer(250, H - 30, 300, '#24503a', snowy) + decid(r, 990, H - 20, 290, P.crowns, true, st.frost && !snowy)
      : decid(r, 240, H - 25, 290, st.season === 'spring' ? P.blossom.concat(P.crowns) : P.crowns, false) + decid(r, 1000, H - 15, 260, P.crowns, false);
    // Blumen, Laub am Boden
    if (!snowy && (st.season === 'spring' || st.season === 'autumn')) {
      const cols = st.season === 'autumn' ? P.leaves : P.flowers, n = st.season === 'autumn' ? 70 : 90;
      r = rng(6);
      for (let i = 0; i < n; i++) { const y = HORIZON + 360 + r() * (H - HORIZON - 360); land += `<circle cx="${f(r() * W)}" cy="${f(y)}" r="${f(3 + (y - HORIZON) / 90 + r() * 2)}" fill="${pick(r, cols)}"/>`; }
    }
    o += `<g>${land}</g>`;

    // Licht (Tageszeit, Bewölkung)
    const light = night ? LIGHT.night : low ? LIGHT[st.phase] : st.storm ? LIGHT.storm : st.sky === 'cloudy' || st.precip ? LIGHT.cloudy : null;
    if (light) {   // weich von oben einblenden, damit keine Kante im Himmel entsteht
      o += `<linearGradient id="${id}Light" x1="0" y1="0" x2="0" y2="1"><stop offset="${f((HORIZON - 420) / H)}" stop-color="${light[0]}" stop-opacity="0"/><stop offset="${f((HORIZON - 60) / H)}" stop-color="${light[0]}" stop-opacity="${light[1]}"/></linearGradient>`;
      o += `<rect width="${W}" height="${H}" fill="url(#${id}Light)"/>`;
      if (light[2]) o += `<rect width="${W}" height="${H}" fill="${light[2]}" opacity="${light[3]}"/>`;
    }

    // Nebel
    r = rng(7);
    if (st.sky === 'fog') {
      let fog = `<rect width="${W}" height="${H}" fill="${night ? '#3a434d' : '#e3e7ea'}" opacity=".35"/>`;
      for (let i = 0; i < 6; i++) fog += `<ellipse class="sc-fog" style="--d:${f(40 + r() * 40)}s" cx="${f(r() * W)}" cy="${f(HORIZON - 80 + i * 90)}" rx="${f(500 + r() * 300)}" ry="${f(70 + r() * 50)}" fill="url(#${id}Fog)" opacity="${night ? 0.35 : 0.9}"/>`;
      o += `<g>${fog}</g>`;
    }

    // Niederschlag – zwei gleich große Felder übereinander, nach unten verschoben (nahtlose Schleife)
    const field = (n, mk) => { let a = ''; for (let i = 0; i < n; i++) a += mk(f(r() * (W + 300) - 150), f(r() * H), r()); return a; };
    if (st.precip === 'rain' || st.precip === 'hail' || st.precip === 'sleet' || st.storm) {
      const drops = field(st.storm ? 140 : 90, (x, y, q) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${f(y + 38 + q * 26)}" stroke="${night ? '#9fb3c8' : '#e8f1fa'}" stroke-width="${f(2 + q * 1.5)}" stroke-linecap="round" opacity="${f(0.35 + q * 0.4)}"/>`);
      o += `<g transform="skewX(${st.windy ? -16 : -6})"><g class="sc-fall" style="--d:${st.storm ? 0.6 : 0.85}s">${drops}<g transform="translate(0 -${H})">${drops}</g></g></g>`;
    }
    if (st.precip === 'snow' || st.precip === 'sleet') {
      const flakes = field(st.precip === 'snow' ? 120 : 50, (x, y, q) => `<circle cx="${x}" cy="${y}" r="${f(3 + q * 5)}" fill="#fff" opacity="${f(0.55 + q * 0.4)}"/>`);
      o += `<g class="sc-sway"><g class="sc-fall" style="--d:${st.windy ? 7 : 11}s">${flakes}<g transform="translate(0 -${H})">${flakes}</g></g></g>`;
    }
    // Herbst: fallende Blätter (ohne Regen)
    if (st.season === 'autumn' && !st.precip && !snowy) {
      let lv = ''; const n = st.windy ? 16 : 9;
      for (let i = 0; i < n; i++) lv += `<g class="sc-leaf" style="--d:${f(9 + r() * 9)}s;--delay:-${f(r() * 18)}s;--x:${f(r() * W)}px;--dx:${f((st.windy ? 260 : 90) + r() * 120)}px"><path d="M0 -12 C10 -6 10 6 0 12 C-10 6 -10 -6 0 -12 Z" fill="${pick(r, P.leaves)}"/></g>`;
      o += `<g>${lv}</g>`;
    }
    // Gewitter: Blitz und Aufhellen
    if (st.storm) o += `<g class="sc-flash"><rect width="${W}" height="${H}" fill="#fff" opacity=".55"/><path d="M640 160 L590 420 L650 420 L560 760 L700 360 L640 360 L700 160 Z" fill="#fffbe0"/></g>`;
    return o + '</svg>';
  }

  window.SCENE = { svg, moonIcon };
})();
