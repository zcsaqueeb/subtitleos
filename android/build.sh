#!/usr/bin/env bash
# Builds SubtitleOS-Android.apk without Gradle.
# Needs: BT (Android build-tools dir), ANDROID_JAR, JAVA_HOME, KEYSTORE.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-/tmp/apkbuild}"
rm -rf "$OUT"; mkdir -p "$OUT"/{res/mipmap-xxxhdpi,res/mipmap-xxhdpi,res/mipmap-xhdpi,res/mipmap-hdpi,res/mipmap-mdpi,classes,gen}
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  magick "$HERE/../public/icon-512.png" -resize "${d#*:}x${d#*:}" "$OUT/res/mipmap-${d%%:*}/ic_launcher.png"
done
"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml" --java "$OUT/gen" "$OUT/res.zip"
"$JAVA_HOME/bin/javac" -source 8 -target 8 -nowarn -classpath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$ANDROID_JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:"${KS_PASS:-subtitleos}" --out "$OUT/SubtitleOS.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/SubtitleOS.apk"
echo "Built $OUT/SubtitleOS.apk"
