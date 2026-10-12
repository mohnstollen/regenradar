# Wetter-App (PWA) – Version 3.2.0

## Neu in 3.2
- DWD-Warnungen ganz oben, nur sichtbar, wenn es Warnungen gibt
- Favoriten: Stern speichert den Ort (inkl. gewählter Station); Ortsname antippen → Liste zum Laden, Umbenennen, Sortieren, Löschen
- Pollenflug (DWD-Gefahrenindex, 8 Arten, 3 Tage, Skala 0–3 in halben Stufen); Pollenarten und Gebiet wählbar
  Außerhalb Deutschlands bzw. wenn der DWD nicht erreichbar ist: Open-Meteo/CAMS (6 Arten, Stufen abgeleitet)

## Installation
Ordnerinhalt ins GitHub-Repo laden, GitHub Pages aktivieren, Seite auf dem Handy öffnen → „App installieren“.
Lokal testen: `python -m http.server 8000` → http://localhost:8000

Leaflet wird von unpkg.com geladen und vom Service Worker für den Offline-Betrieb gespeichert.
