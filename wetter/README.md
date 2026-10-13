# Wetter-App (PWA) – Version 3.3.0

## Neu in 3.3
- Startseiten-Assistent (beim ersten Start und nach diesem Update): Abschnitte an-/abwählen und per Ziehen oder Pfeilen sortieren;
  später unter Einstellungen → Startseite änderbar. Abgewählte Abschnitte laden keine Daten.
- Textprognose und Diagramm zeigen nur noch den Modelllauf (ohne bekannten Lauf: Datenstand)
- Luftqualität der nächstgelegenen aktiven Messstelle (Umweltbundesamt, Air Data API v3, Rückfall v2):
  PM10, PM2,5, NO2, O3 mit Einstufung nach dem Luftqualitätsindex des UBA
- Quellen & Lizenzen am Seitenende standardmäßig eingeklappt

## Installation
Ordnerinhalt ins GitHub-Repo laden, GitHub Pages aktivieren, Seite auf dem Handy öffnen → „App installieren“.
Lokal testen: `python -m http.server 8000` → http://localhost:8000
