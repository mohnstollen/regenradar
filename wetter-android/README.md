# Wetter-App als Android-APK

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
- **Auch bei geschlossener App:** `CheckService` prüft etwa alle 15 Minuten über Bright Sky auf neue
  DWD-Warnungen und auf Regen am zuletzt angezeigten Ort (`/alerts` und `/radar`, gleiche Schwellen wie in
  `app.js`). Den genauen Zeitpunkt legt Android fest, im Energiesparmodus kann es später werden.
- Doppelte Meldungen verhindert die App selbst: Jede Warnung kommt nur einmal, der Regenhinweis höchstens
  einmal pro Stunde, egal ob er aus der offenen App oder aus der Hintergrundprüfung stammt.

## Widgets

Auf dem Startbildschirm gibt es zwei Widgets (lange auf den Startbildschirm tippen → Widgets → Wetter):

- **Wetter klein (2×1):** Wettersymbol, Temperatur, Ort
- **Wetter mit Regen und Stunden (4×2):**
  - aktuelle Temperatur mit Beschreibung und gefühlter Temperatur
  - Tageshöchst- und -tiefstwert
  - Hinweis aus dem DWD-Radar für die nächsten 2 Stunden
  - fünf Vorhersagezeitpunkte im 2-Stunden-Abstand, mit Regenwahrscheinlichkeit

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
