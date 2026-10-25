# Wetter-App (PWA) – Version 3.5.0

## Neu in 3.5
- Darstellung hell, dunkel oder wie System (Einstellungen → Darstellung). Der Einrichtungsassistent fragt beim ersten Start danach.
- Android-App (`../wetter-android`): native Benachrichtigungen und Hintergrundprüfung auf Warnungen und Regen

## Neu in 3.4
- Entfernt: Luftqualität (UBA), alle Modelle außer DWD und ECMWF, Anbieter mit API-Key
- Neu: Abschnitt „Regen in 2 Stunden“ (Regenhinweis + 5-Minuten-Diagramm aus dem DWD-Radar)
- Neu: Radar-Animation auf der Karte (−1 h bis +2 h, 10-Minuten-Schritte, DWD-WMS mit TIME)
- Neu: 10-Tage-Übersicht (DWD MOSMIX)
- Diagramm: gefühlte Temperatur und Taupunkt (ein-/ausblendbar), Regenwahrscheinlichkeit
  (fehlt sie im Modell, wird sie aus DWD MOSMIX ergänzt)
- Winterhinweise unter der Textprognose: Schneefallgrenze, Glättegefahr, Frost (ICON-D2, nächste 30 h)

## Modelle
DWD ICON-D2, ICON-EU, ICON kombiniert, MOSMIX · ECMWF IFS, AIFS (über Open-Meteo bzw. Bright Sky)

Lokal testen: `python -m http.server 8000` → http://localhost:8000
