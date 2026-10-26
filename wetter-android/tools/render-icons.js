// Wandelt die Wettersymbole aus ../wetter/icons.js in PNGs für das Widget um (res/drawable-nodpi/wx_*.png).
// Nur nötig, wenn sich die Symbole ändern:  node tools/render-icons.js   (braucht Playwright mit Chromium)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const KEYS = ['clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night', 'cloudy', 'fog', 'wind', 'rain', 'sleet', 'snow', 'hail', 'thunderstorm', 'unknown'];
const SIZE = 144;
(async () => {
  const root = path.join(__dirname, '..'), out = path.join(root, 'res/drawable-nodpi');
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
  await p.setContent('<body style="margin:0;background:transparent"></body>');
  await p.addScriptTag({ content: fs.readFileSync(path.join(root, '../wetter/icons.js'), 'utf8') });
  for (const k of KEYS) {
    await p.evaluate(([k, s]) => { document.body.innerHTML = window.ICONS.weather(k); const v = document.body.firstElementChild; v.setAttribute('width', s); v.setAttribute('height', s); v.style.display = 'block'; }, [k, SIZE]);
    await p.screenshot({ path: path.join(out, `wx_${k.replace(/-/g, '_')}.png`), omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
  }
  await b.close();
  console.log(`${KEYS.length} Symbole nach ${out}`);
})();
