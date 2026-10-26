# Wetter-App (PWA) – Version 3.9.0

## Neu in 3.9
- Android-App: großes Widget 4×3 mit DWD-Warnung, den nächsten Stunden und den nächsten 5 Tagen

## Neu in 3.8
- Android-App: Startbildschirm-Widgets 2×1 (Symbol, Temperatur, Ort) und 4×2 (zusätzlich Regen in 2 Stunden und
  die nächsten Stunden). Details in `../wetter-android/README.md`.
- Die Web-App übergibt der Android-App zusätzlich die Darstellung (hell/dunkel) für die Widgets.

## Neu in 3.7
- Mond: Auf- und Untergang (die nächsten beiden, mit „morgen“) sowie die aktuelle Mondphase mit beleuchtetem Anteil
  unter den Sonnenzeiten. Beim Antippen bzw. Darüberfahren erscheinen der nächste Voll- und Neumond.
  Die Nachtszene zeigt den Mond in seiner echten Phase, und nur dann, wenn er über dem Horizont steht.
- Einstellungen → Darstellung: Deckkraft der Datenbereiche (20–100 %), damit das Hintergrundbild mehr oder weniger durchscheint
- Einstellungen neu gegliedert: Darstellung, Standort & Aktualisierung, Benachrichtigungen, Karte.
  „App installieren“ erscheint nur noch im Browser, solange die App nicht installiert ist.

## Neu in 3.6
- Hintergrundbild: eine gezeichnete Landschaft (`scene.js`, reines SVG, keine Bilddateien) passend zu
  - Jahreszeit: Frühling mit Blüten und Wiesenblumen, Sommer mit Kornfeld, Herbst mit buntem Laubwald und fallenden
    Blättern, Winter mit kahlen Bäumen. Schnee liegt nur, wenn es gerade schneit.
  - Tageszeit nach Sonnenauf- und -untergang am Ort: Morgenrot, Tag, Abendrot, Nacht mit Mond und Sternen
  - Wetter laut DWD-Station: klar, heiter, bewölkt, Nebel, Regen, Schnee, Gewitter mit Blitzen, Wind, Hitze ab 27 °C.
    Zeigt das Radar Regen am Standort, regnet es auch im Bild.
- Die Karten werden dabei leicht durchscheinend. Abschaltbar unter Einstellungen → Darstellung.
- Vorschau aller Szenen über die Adresse, z. B. `?szene=herbst,tag,klar`, `?szene=winter,nacht,schnee,wind` oder
  `?szene=sommer,abend,heiss`. Mögliche Wörter: frühling/sommer/herbst/winter, morgen/tag/abend/nacht,
  klar/heiter/bewölkt/nebel, regen/schneeregen/schnee/hagel, gewitter/heiß/wind/schneedecke/frost

## Neu in 3.5.1
- Behoben: Am Tag der Zeitumstellung (23 bzw. 25 Stunden) waren Tagesnamen und Tagestrennlinien im Diagramm
  um einen Tag bzw. eine Stunde verschoben, z. B. „Morgen“ und danach nochmals „Mo“. Dasselbe galt für
  „Morgen“ in der 10-Tage-Übersicht und für die Tage beim Pollenflug.

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
