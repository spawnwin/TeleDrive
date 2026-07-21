#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://135.106.173.99/api}"

cd "$ROOT/client"
if [[ ! -d android ]]; then
  npx expo prebuild --platform android
fi

# Ensure HTTP cleartext is allowed for the VPS API.
mkdir -p android/app/src/main/res/xml
cp "$ROOT/client/config/network_security_config.xml" android/app/src/main/res/xml/network_security_config.xml
MANIFEST="android/app/src/main/AndroidManifest.xml"
if ! grep -q 'networkSecurityConfig' "$MANIFEST"; then
  sed -i 's|<application |<application android:usesCleartextTraffic="true" android:networkSecurityConfig="@xml/network_security_config" |' "$MANIFEST"
fi

cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
mkdir -p "$ROOT/dist"
cp app/build/outputs/apk/release/app-release.apk "$ROOT/dist/rubezh-tyl-pobedy-debug.apk"
echo "APK: $ROOT/dist/rubezh-tyl-pobedy-debug.apk"
