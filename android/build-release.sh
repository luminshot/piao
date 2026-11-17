#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${JAVA_HOME:-}" ]]; then
  ANDROID_STUDIO_JBR='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
  if [[ -x "$ANDROID_STUDIO_JBR/bin/java" ]]; then
    export JAVA_HOME="$ANDROID_STUDIO_JBR"
  else
    printf '未找到 JDK；请安装 Android Studio 或设置 JAVA_HOME。\n' >&2
    exit 2
  fi
fi
export PATH="$JAVA_HOME/bin:$PATH"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT ANDROID_HOME="$ANDROID_SDK_ROOT"
KEYSTORE="$HOME/.android/keystores/com.luminshot.piao-release.p12"
SERVICE='com.luminshot.piao.release-signing'
ALIAS='xiaopiaolai'

if [[ ! -f "$KEYSTORE" ]]; then
  printf '发布签名文件不存在：%s\n' "$KEYSTORE" >&2
  exit 2
fi
STORE_PASSWORD="$(/usr/bin/security find-generic-password -a 'com.luminshot.piao' -s "$SERVICE" -w)"
if [[ -z "$STORE_PASSWORD" ]]; then
  printf 'macOS 钥匙串中找不到发布签名密码。\n' >&2
  exit 2
fi

export XPL_RELEASE_STORE_FILE="$KEYSTORE"
export XPL_RELEASE_STORE_PASSWORD="$STORE_PASSWORD"
export XPL_RELEASE_KEY_ALIAS="$ALIAS"
export XPL_RELEASE_KEY_PASSWORD="$STORE_PASSWORD"
unset STORE_PASSWORD
cd "$ROOT"
exec ./gradlew :app:bundleRelease :app:assembleRelease "$@"
