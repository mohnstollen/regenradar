# Wetter-App als Android-APK

**Download der neuesten Version:** https://github.com/mohnstollen/regenradar/releases/latest/download/wetter.apk

Der Link zeigt immer auf das neueste Release. Der Workflow `.github/workflows/release-apk.yml` legt es automatisch an,
sobald eine neue `wetter-<version>.apk` auf `main` landet. Ein manueller Start ist unter Actions → „APK
veröffentlichen“ → „Run workflow“ möglich. Die APK installiert sich als Update über eine vorhandene Version.

Diese WebView-Hülle packt die PWA aus `../wetter` in eine APK. Die Web-Dateien liegen in der APK
und werden unter `https://appassets.androidplatform.net/` ausgeliefert. Das ist ein sicherer Kontext,
deshalb funktionieren GPS, `localStorage` und der Service Worker mit dem Offline-Speicher.

- Mindestens Android 7.0 (API 24), targetSdk 34
- GPS: Beim ersten „Mein Standort“ fragt Android nach der Berechtigung
- Externe Links (Quellen, Lizenzen) öffnen sich im Browser
- Die Zurück-Taste schließt offene Dialoge, danach wird die App beendet
- Hell/Dunkel folgt der Einstellung „Darstellung“ der Web-App. Bei „Wie System“ gilt der Systemmodus von Android.

## Benachrichtigungen

Android-WebViews kennen keine Web-Benachrichtigungen. `app.js` erkennt die App deshalb am User-Agent
(`WetterApp-Android/…`) und schickt Benachrichtigungen über eine Brücke an Android
(`prompt('wetterapp:[…]')`). Die App nimmt diese Aufrufe nur von der eigenen Herkunft an, nicht aus
eingebetteten Seiten wie Windy.

- Kanäle „Regen in Kürze“ und „DWD-Warnungen“, beide einzeln in den Android-Einstellungen abschaltbar
- Ab Android 13 fragt die App beim Einschalten in den Einstellungen nach der Berechtigung
- **Auch bei geschlossener App:** `CheckService` prüft etwa alle 15 Minuten am zuletzt angezeigten Ort.
  Den genauen Zeitpunkt legt Android fest, im Energiesparmodus kann es später werden.
- **Regen im Anmarsch** (`RainAlert`):
  - Gemeldet wird Regen, der jetzt im eingestellten Umkreis (5–50 km) liegt und den Standort laut
    DWD-Radarvorhersage (2 h) erreicht. Beispiel: „Mäßiger Regen nähert sich aus Westen und erreicht Dich in
    ca. 30 min (18:30 Uhr).“
  - Stärke nach DWD: leicht unter 2,5 mm/h, mäßig bis 10 mm/h, stark darüber, gemessen in den ersten 30 Minuten
    am Standort. Auf Wunsch wird erst ab mäßigem oder starkem Regen gemeldet.
  - Die Zugrichtung ergibt sich aus der Verschiebung der Regenfläche zwischen jetzt und der Vorhersage für +30 min.
  - Eine Benachrichtigung je Regengebiet. Sie wird bei ≤ 30 und ≤ 10 Minuten aktualisiert, solange Regen im
    Anmarsch ist, prüft die App dafür etwa alle 5 Minuten. Zieht der Regen doch vorbei, verschwindet die
    Meldung. Beginnt es zu regnen, ebenfalls.
- **DWD-Warnungen für den Ort** (Bright Sky `/alerts`): alle Stufen, jede Warnung einmal. Bei Unwettern
  (rot/violett) kommt zusätzlich eine Meldung, wenn die Warnung aufgehoben ist.
- **Unwetter im Umkreis** (`StormAlert`): Warnungen der Stufen Unwetter und extremes Unwetter für Landkreise
  im Umkreis von 25–100 km aus dem DWD-Geodienst (WFS `dwd:Warnungen_Landkreise`), mit Entfernung und Richtung,
  z. B. „Landkreis Forchheim, 15 km nördlich, bis 20:00 Uhr“. Ist die Warnung nicht mehr aktiv, wird dieselbe
  Benachrichtigung durch „Aufgehoben: …“ ersetzt. Das eigene Gebiet meldet bereits die Ortswarnung.
- Die Web-App meldet in der Android-App keinen Regen mehr selbst; das übernimmt die App mit den Optionen oben.

## Widgets

Auf dem Startbildschirm gibt es drei Widgets (lange auf den Startbildschirm tippen → Widgets → Wetter):

- **Wetter klein (2×1):** Wettersymbol, Temperatur, Ort
- **Wetter mit Regen und Stunden (4×2):**
  - aktuelle Temperatur mit Beschreibung und gefühlter Temperatur
  - Tageshöchst- und -tiefstwert
  - Hinweis aus dem DWD-Radar für die nächsten 2 Stunden
  - fünf Vorhersagezeitpunkte im 2-Stunden-Abstand, mit Regenwahrscheinlichkeit
- **Wetter mit Warnungen und 5 Tagen (4×3):** wie 4×2, dazu
  - die wichtigste aktuelle DWD-Warnung in ihrer Warnfarbe (mit Anzahl weiterer Warnungen)
  - die nächsten 5 Tage mit Symbol, Höchst-/Tiefstwert und Niederschlag (Tageswerte wie in der 10-Tage-Übersicht)
  - Mit Warnung braucht es etwa 240 dp Höhe. Wird es auf einem Startbildschirm unten knapp, das Widget auf 4×4 ziehen.

Die Widgets zeigen den zuletzt in der App angezeigten Ort. Antippen öffnet die App. Die Daten holt
`CheckService` von Bright Sky, solange ein Widget existiert, etwa alle 15 Minuten. Nach einem Ortswechsel
in der App oder beim Hinzufügen eines Widgets geschieht das sofort. Die Widgets übernehmen Hell/Dunkel aus
der App. Bei „Wie System“ folgen sie dem Systemmodus.

Die Wettersymbole der Widgets (`res/drawable-nodpi/wx_*.png`) entstehen aus `../wetter/icons.js`.
Ändern sich die Symbole, erzeugt `node tools/render-icons.js` sie neu (braucht Playwright).

## Bauen

```sh
sudo apt install android-sdk-build-tools dalvik-exchange apksigner zipalign
./build.sh
```

Das Skript braucht kein Gradle und kein Android Studio. Als Android-API 34 für Ressourcen und Java lädt es
beim ersten Lauf Robolectrics `android-all` von Maven Central (~140 MB, mit SHA-1-Prüfung, zwischengespeichert
in `~/.cache/wetter-android`). Das Ergebnis ist `wetter-<version>.apk`; die
Version kommt aus `APP_VERSION` in `wetter/app.js`. Signiert wird mit `$KEYSTORE`
(Standard: `~/.android/wetter.jks`). Gibt es den Schlüssel noch nicht, wird er neu erzeugt. Für Updates
über eine installierte Version muss die APK mit **demselben** Schlüssel signiert sein.
