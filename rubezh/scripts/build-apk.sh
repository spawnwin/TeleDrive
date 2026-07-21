#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

cd "$ROOT/client"
if [[ ! -d android ]]; then
  npx expo prebuild --platform android
fi
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon
mkdir -p "$ROOT/dist"
cp app/build/outputs/apk/debug/app-debug.apk "$ROOT/dist/rubezh-tyl-pobedy-debug.apk"
echo "APK: $ROOT/dist/rubezh-tyl-pobedy-debug.apk"
