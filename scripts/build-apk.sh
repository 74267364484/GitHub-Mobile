#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"
npx tsc --noEmit
npm run build

rm -rf "$ROOT/android/app/src/main/assets/www"
mkdir -p "$ROOT/android/app/src/main/assets/www"
cp -a dist/. "$ROOT/android/app/src/main/assets/www/"
cp src/data/hosts.json "$ROOT/android/app/src/main/assets/hosts.json"

export JAVA_HOME="${OCTODECK_JAVA_HOME:-/root/.local/share/mise/installs/java/17.0.20+101}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JDK 17 not found at $JAVA_HOME" >&2
  exit 1
fi
if [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  echo "Android SDK 35 not found at $ANDROID_HOME" >&2
  exit 1
fi

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/android/local.properties"

KEYSTORE="$ROOT/android/keystore/github-mobile-debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  echo "Signing keystore not found: $KEYSTORE" >&2
  echo "The repository ships a fixed debug keystore so APK updates keep the same signature." >&2
  exit 1
fi

TOKEN_VALUE=""
if [ -f "$ROOT/.env.local" ]; then
  TOKEN_VALUE="$(grep -E '^GITHUB_TOKEN=' "$ROOT/.env.local" | head -1 | cut -d= -f2- || true)"
fi
if [ -z "$TOKEN_VALUE" ]; then
  TOKEN_VALUE="${GITHUB_TOKEN:-}"
fi
if [ -n "$TOKEN_VALUE" ] && grep -RqF "$TOKEN_VALUE" "$ROOT/android/app/src/main/assets" 2>/dev/null; then
  echo "Refusing to build: a GitHub token was found in Android assets." >&2
  exit 1
fi

GRADLE="${GRADLE_BIN:-}"
if [ -z "$GRADLE" ]; then
  if [ -x /opt/gradle-8.11.1/bin/gradle ]; then
    GRADLE=/opt/gradle-8.11.1/bin/gradle
  else
    GRADLE="$ROOT/android/gradlew"
  fi
fi

cd "$ROOT/android"
"$GRADLE" --no-daemon :app:testDebugUnitTest :app:assembleDebug

cp -f app/build/outputs/apk/debug/app-debug.apk "$ROOT/GitHubMobile-1.6.2.apk"
echo
echo "APK: $ROOT/GitHubMobile-1.6.2.apk"
ls -lh "$ROOT/GitHubMobile-1.6.2.apk"
