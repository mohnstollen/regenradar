# Wetter-App als Android-APK

Diese WebView-Hülle packt die PWA aus `../wetter` in eine APK. Die Web-Dateien liegen in der APK
und werden unter `https://appassets.androidplatform.net/` ausgeliefert. Das ist ein sicherer Kontext,
deshalb funktionieren GPS, `localStorage` und der Service Worker mit dem Offline-Speicher.

- Mindestens Android 7.0 (API 24), targetSdk 34
- GPS: Beim ersten „Mein Standort“ fragt Android nach der Berechtigung
- Externe Links (Quellen, Lizenzen) öffnen sich im Browser
- Die Zurück-Taste schließt offene Dialoge, danach wird die App beendet
- Hinweis: Android-WebViews kennen keine Web-Benachrichtigungen (`Notification`), deshalb gibt es in der APK
  keine Unwetter-Benachrichtigungen. Die Warnungen erscheinen weiterhin in der App.

## Bauen

```sh
sudo apt install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange apksigner zipalign
./build.sh
```

Das Skript braucht kein Gradle und kein Android Studio. Das Ergebnis ist `wetter-<version>.apk`; die
Version kommt aus `APP_VERSION` in `wetter/app.js`. Signiert wird mit `$KEYSTORE`
(Standard: `~/.android/wetter.jks`). Gibt es den Schlüssel noch nicht, wird er neu erzeugt. Für Updates
über eine installierte Version muss die APK mit **demselben** Schlüssel signiert sein.
