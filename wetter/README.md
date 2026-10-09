# Wetter-App (PWA) – Version 3.0.0

## Installation
1. Ordnerinhalt in ein GitHub-Repo hochladen (z. B. `wetter`), GitHub Pages aktivieren (Branch `main`, Ordner `/`).
2. `https://<user>.github.io/wetter/` auf dem Handy öffnen → „App installieren“ (Android/Chrome)
   bzw. Safari → Teilen → „Zum Home-Bildschirm“ (iPhone).
3. Lokal testen: `python -m http.server 8000` → http://localhost:8000

Nach einem Update erscheint in der App „Neue App-Version verfügbar – Neu laden“.

## Datenquellen
| Bereich | Quelle |
|---|---|
| Aktuelle Werte | Bright Sky `/current_weather` (nächste oder gewählte DWD-Station, Auswahl über `/sources`) |
| Verlauf 12 h – 10 Tage | Open-Meteo (ICON-D2 = Standard, ICON, ECMWF, KNMI, Météo-France, UKMO, GFS), DWD MOSMIX (Bright Sky) |
| Rückfall | Reicht ein Modell nicht weit genug oder schlägt der Abruf fehl → DWD MOSMIX |
| Anbieter mit API-Key | OpenWeatherMap, WeatherAPI.com, Tomorrow.io, Pirate Weather, meteoblue |
| Warnungen | Bright Sky `/alerts` (amtliche DWD-Warnungen) |
| Regenradar | DWD-GeoServer WMS `dwd:Niederschlagsradar`, Regen-Hinweis über Bright Sky `/radar` |
| Satellit | EUMETSAT View WMS, MTG: `mtg_fd:rgb_truecolour` (Tag), Infrarot (Nacht, automatisch aus dem Katalog) |
| Wind | Windy.com-Einbettung (embed.windy.com) |
| Karte | basemap.de (BKG) / OpenStreetMap |

## Dateien
- `index.html`, `style.css`, `app.js` – App
- `icons.js` – eigene SVG-Icons (keine Emojis mehr)
- `sw.js` – Service Worker (offline, Updates)
- `manifest.webmanifest`, `icons/` – PWA
- `vendor/leaflet/` – Leaflet 1.9.3 lokal (BSD-2-Lizenz)
