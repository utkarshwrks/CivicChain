#!/usr/bin/env bash
# build-apk.sh — build the CivicChain Android APK (Capacitor 6) and publish it
# to frontend/public/downloads/CivicChain.apk, where the website's
# "Download APK" buttons point.
#
#   APK_API_URL=https://your-backend.example.com npm run build:apk
#
# APK_API_URL bakes the backend URL into the app. Without it the app asks for
# the server address on first launch (changeable later from the header).
# Needs JDK 17 and the Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

echo "▶ web build for the app (API: ${APK_API_URL:-ask on first launch})"
VITE_API_URL="${APK_API_URL:-}" npx vite build
rm -rf dist/downloads                     # never pack an APK inside the APK
npx cap sync android

echo "▶ gradle assembleRelease"
(cd android && ./gradlew --no-daemon -q assembleRelease)

OUT=android/app/build/outputs/apk/release
APK="$OUT/app-release.apk"
[ -f "$APK" ] || APK="$OUT/app-release-unsigned.apk"
mkdir -p public/downloads
cp "$APK" public/downloads/CivicChain.apk
echo "▶ APK → frontend/public/downloads/CivicChain.apk ($(du -h public/downloads/CivicChain.apk | cut -f1))"

echo "▶ rebuilding the website so it serves the new APK"
npx vite build
