# Wetter-App (PWA) – Version 3.1.0

## Neu in 3.1
- Zeitachse passt sich der Bildschirmbreite an (Stunden- und Tageszeile getrennt)
- Modellzeile zeigt angezeigtes Modell, Modelllauf und Abrufzeit (statt Rückfall-Hinweis)
- Wind im Diagramm: Pfeil (Zugrichtung) + mittlere Geschwindigkeit, Böen ab 60 km/h
- Sonnenauf-/-untergang und Tageslänge (für gewählte Station bzw. Standort)
- Textprognose für heute (ab 20 Uhr: morgen) aus DWD ICON-D2

## Installation
1. Ordnerinhalt ins GitHub-Repo laden, GitHub Pages aktivieren.
2. Seite auf dem Handy öffnen → „App installieren“ (Android) bzw. Safari → Teilen → „Zum Home-Bildschirm“.
3. Lokal testen: `python -m http.server 8000` → http://localhost:8000

## Datenquellen
| Bereich | Quelle |
|---|---|
| Aktuelle Werte | Bright Sky `/current_weather` (nächste oder gewählte DWD-Station) |
| Textprognose | Open-Meteo, Modell `icon_d2` (Rückfall `icon_seamless`) |
| Verlauf | Open-Meteo (ICON-D2 Standard u. a.), DWD MOSMIX (Bright Sky), Anbieter mit API-Key |
| Modelllauf | Open-Meteo-Modellstatus `/data/<modell>/static/meta.json` |
| Sonne | lokal berechnet (Sonnenaufgangsgleichung, ±1–2 min) |
| Warnungen | Bright Sky `/alerts` |
| Radar / Satellit / Wind | DWD-GeoServer, EUMETSAT (MTG), Windy-Einbettung |
| Karte | basemap.de (BKG) / OpenStreetMap |
