#!/usr/bin/env bash
# Baut aus der PWA in ../wetter eine signierte APK – ohne Gradle, nur mit den Android-Build-Tools.
#   Ubuntu/Debian: apt install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange apksigner zipalign
#   Signierschlüssel: $KEYSTORE (Standard ~/.android/wetter.jks, wird bei Bedarf erzeugt), Passwort $KEYSTORE_PASS
set -euo pipefail
cd "$(dirname "$0")"

SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
ANDROID_JAR=${ANDROID_JAR:-$SDK/platforms/android-23/android.jar}
KEYSTORE=${KEYSTORE:-$HOME/.android/wetter.jks}
KEYSTORE_PASS=${KEYSTORE_PASS:-wetter-app}
WEB=../wetter
OUT=build

VERSION=$(sed -n "s/^const APP_VERSION = '\([0-9.]*\)'.*/\1/p" "$WEB/app.js")
IFS=. read -r MA MI PA <<< "$VERSION"
VERSION_CODE=$((MA * 10000 + MI * 100 + ${PA:-0}))
echo "Wetter $VERSION (versionCode $VERSION_CODE)"

rm -rf "$OUT"
mkdir -p "$OUT"/{assets/www,res/mipmap-xxxhdpi,gen,stubs,classes}

# Web-Dateien und Icon
cp -r "$WEB"/. "$OUT/assets/www/"
rm -f "$OUT/assets/www/README.md"
cp -r res/. "$OUT/res/"
cp "$WEB/icons/icon-192.png" "$OUT/res/mipmap-xxxhdpi/ic_launcher.png"

# Ressourcen
aapt2 compile --dir "$OUT/res" -o "$OUT/res.zip"
aapt2 link -I "$ANDROID_JAR" --manifest AndroidManifest.xml --version-code "$VERSION_CODE" --version-name "$VERSION" \
  -A "$OUT/assets" --java "$OUT/gen" -o "$OUT/unsigned.apk" "$OUT/res.zip"

# Java -> Dex (Stubs nur zum Kompilieren, nicht in der APK)
JAVAC="javac -source 8 -target 8 -bootclasspath $ANDROID_JAR -Xlint:-options -encoding UTF-8"
$JAVAC -d "$OUT/stubs" $(find stubs -name '*.java')
$JAVAC -cp "$OUT/stubs" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q unsigned.apk classes.dex)

# Ausrichten und signieren
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" -alias wetter \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Wetter-App" 2>/dev/null
  echo "Neuer Signierschlüssel: $KEYSTORE (für Updates aufbewahren!)"
fi
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --out "wetter-$VERSION.apk" "$OUT/aligned.apk"
rm -f "wetter-$VERSION.apk.idsig"
apksigner verify "wetter-$VERSION.apk"
echo "Fertig: $(pwd)/wetter-$VERSION.apk"
