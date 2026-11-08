#!/usr/bin/env bash
# Builds a signed Play Store bundle (SubtitleOS.aab) without Gradle.
# Needs: BT (build-tools dir), ANDROID_JAR, JAVA_HOME, KEYSTORE, BUNDLETOOL.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-/tmp/aabbuild}"
rm -rf "$OUT"; mkdir -p "$OUT"/{classes,gen,module/manifest,module/dex}
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p "$OUT/res/mipmap-${d%%:*}"
  magick "$HERE/../public/icon-512.png" -resize "${d#*:}x${d#*:}" "$OUT/res/mipmap-${d%%:*}/ic_launcher.png"
done
"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/res.zip"
"$BT/aapt2" link --proto-format -o "$OUT/base.zip" -I "$ANDROID_JAR" \
  --manifest "$HERE/AndroidManifest.xml" --java "$OUT/gen" "$OUT/res.zip"
"$JAVA_HOME/bin/javac" --release 11 -nowarn -classpath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name '*.java') 2>/dev/null || \
"$JAVA_HOME/bin/javac" -source 8 -target 8 -nowarn -classpath "$ANDROID_JAR" -d "$OUT/classes" $(find "$HERE/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$ANDROID_JAR" --output "$OUT/module/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/module" && unzip -q ../base.zip && mv AndroidManifest.xml manifest/ && zip -qr ../base-module.zip manifest dex res resources.pb)
"$JAVA_HOME/bin/java" -jar "$BUNDLETOOL" build-bundle --modules="$OUT/base-module.zip" --output="$OUT/unsigned.aab"
cp "$OUT/unsigned.aab" "$OUT/SubtitleOS.aab"
"$JAVA_HOME/bin/jarsigner" -keystore "$KEYSTORE" -storepass "${KS_PASS:-subtitleos}" "$OUT/SubtitleOS.aab" subtitleos >/dev/null
"$JAVA_HOME/bin/jarsigner" -verify "$OUT/SubtitleOS.aab" | tail -1
echo "Built $OUT/SubtitleOS.aab"
