#!/usr/bin/env bash
# Baut aus der PWA in ../wetter eine signierte APK – ohne Gradle, nur mit den Android-Build-Tools.
#   Ubuntu/Debian: apt install android-sdk-build-tools dalvik-exchange apksigner zipalign
#   Als Android-API 34 (Ressourcen und Java) dient Robolectrics android-all – wird einmalig von Maven Central geladen (~140 MB).
#   Signierschlüssel: $KEYSTORE (Standard ~/.android/wetter.jks, wird bei Bedarf erzeugt), Passwort $KEYSTORE_PASS
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_ALL_VERSION=14-robolectric-10818077
ANDROID_ALL_SHA1=94b1490a891e9be559aa35c87cd8a0c163f32d83
ANDROID_ALL=${ANDROID_ALL:-$HOME/.cache/wetter-android/android-all-$ANDROID_ALL_VERSION.jar}
KEYSTORE=${KEYSTORE:-$HOME/.android/wetter.jks}
KEYSTORE_PASS=${KEYSTORE_PASS:-wetter-app}
WEB=../wetter
OUT=build

VERSION=$(sed -n "s/^const APP_VERSION = '\([0-9.]*\)'.*/\1/p" "$WEB/app.js")
IFS=. read -r MA MI PA <<< "$VERSION"
VERSION_CODE=$((MA * 10000 + MI * 100 + ${PA:-0}))
echo "Wetter $VERSION (versionCode $VERSION_CODE)"

rm -rf "$OUT"
mkdir -p "$OUT"/{assets/www,res/mipmap-xxxhdpi,gen,classes}

if [ ! -f "$ANDROID_ALL" ]; then
  mkdir -p "$(dirname "$ANDROID_ALL")"
  curl -fL --retry 4 -o "$ANDROID_ALL.part" \
    "https://repo1.maven.org/maven2/org/robolectric/android-all/$ANDROID_ALL_VERSION/android-all-$ANDROID_ALL_VERSION.jar"
  echo "$ANDROID_ALL_SHA1  $ANDROID_ALL.part" | sha1sum -c --quiet
  mv "$ANDROID_ALL.part" "$ANDROID_ALL"
fi

# Web-Dateien und Icon
cp -r "$WEB"/. "$OUT/assets/www/"
rm -f "$OUT/assets/www/README.md"
cp -r res/. "$OUT/res/"
cp "$WEB/icons/icon-192.png" "$OUT/res/mipmap-xxxhdpi/ic_launcher.png"

# Ressourcen
aapt2 compile --dir "$OUT/res" -o "$OUT/res.zip"
aapt2 link -I "$ANDROID_ALL" --manifest AndroidManifest.xml --version-code "$VERSION_CODE" --version-name "$VERSION" \
  -A "$OUT/assets" --java "$OUT/gen" -o "$OUT/unsigned.apk" "$OUT/res.zip"

# Java -> Dex (android-all nur zum Kompilieren, nicht in der APK)
javac --release 8 -Xlint:-options -encoding UTF-8 -cp "$ANDROID_ALL" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
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
