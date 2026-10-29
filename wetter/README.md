# Wetter-App (PWA) – Version 3.15.0

## Neu in 3.15
- Android-App: Einstellungen → App (weiter oben) mit installierter Version und Knopf „Nach Updates suchen“. Gibt es
  eine neuere Version, erscheinen ihre Neuerungen und „Jetzt herunterladen“ (fester Release-Link).
- Beim Start prüft die App einmal am Tag auf eine neue Version und weist einmal je Version darauf hin
- Widget „Temperaturverlauf 12 h“ heißt jetzt „Temperaturverlauf“ (Zeitraum wählbar)

## Neu in 3.14
- Android-App: Kombi-Widget „Wetter mit Temperaturverlauf“ (4×3) – aktuelle Temperatur und Beschreibung, DWD-Warnung,
  darunter der Temperaturverlauf mit Sonne, Regenwahrscheinlichkeit und Wind
- Diagramm-Widgets: Zeitraum 12, 24 oder 48 Stunden, Auswahl beim Hinzufügen und über „Widget bearbeiten“

## Neu in 3.13
- Android-App: zwei Diagramm-Widgets mit dem Temperaturverlauf der nächsten 12 Stunden (DWD ICON-D2), gezeichnet wie
  das Diagramm der App: „Temperaturverlauf 12 h“ und „Temperaturverlauf mit Sonne und Regen“ (zusätzlich je Stunde
  Sonnenschein und Regenwahrscheinlichkeit aus DWD MOSMIX)

## Neu in 3.12.1
- Android-App, Tagesvorhersage: genauer Wecker statt eines ungenauen; Wecker werden bei jedem Öffnen der App neu gestellt
- Statusanzeige (nächste und letzte Meldung mit Ergebnis) und Knopf „jetzt testen“ in den Einstellungen
- Hinweis für Xiaomi/Redmi/Poco: Autostart erlauben, Akku „Keine Einschränkungen“ – mit Knöpfen zu den Einstellungen

## Neu in 3.12
- Android-App: Tagesvorhersage als Benachrichtigung – abends für morgen (Standard 20:00 Uhr) und/oder morgens für heute
  (Standard 6:30 Uhr), Uhrzeit frei wählbar. Inhalt: Textprognose aus DWD ICON-D2 mit Winterhinweisen und den
  DWD-Warnungen für den Tag. Ort: zuletzt per GPS ermittelter Standort oder ein Favorit. Auch im Einrichtungsassistenten.

## Neu in 3.11
- Benachrichtigungen lassen sich schon im Einrichtungsassistenten beim ersten Start festlegen, in der Android-App
  mit Regen-Umkreis, Mindeststärke und Unwettern im Umkreis. Wer schon installiert hat, sieht den Assistenten einmal.
- Android-App: fester Download-Link auf die neueste Version (GitHub-Release `wetter.apk`), auch unter Einstellungen → App

## Neu in 3.10
- Android-App: Regen-Benachrichtigung mit Umkreis (5–50 km), Mindeststärke, Zugrichtung und Ankunftszeit,
  aktualisiert bei 30 und 10 Minuten
- Android-App: Unwetter (rot/violett) im Umkreis von 25–100 km mit Entfernung und Richtung, dazu Meldungen, wenn
  Unwetterwarnungen aufgehoben werden (auch am eigenen Ort)

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
