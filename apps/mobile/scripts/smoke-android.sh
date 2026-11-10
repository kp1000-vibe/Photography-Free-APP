#!/usr/bin/env bash
# Launch smoke test: install the APK on a running emulator, open the app with
# camera permission granted, and fail if the process dies. Writes logcat and
# screenshots to $OUT so a crash can be diagnosed from the CI artifacts.
set -u
APK="$1"
OUT="${2:-smoke-output}"
PKG=app.lumencamera.android
mkdir -p "$OUT"

adb install -r "$APK" || exit 1
adb shell pm grant "$PKG" android.permission.CAMERA
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null

status=0
for i in 1 2 3; do
  sleep 15
  adb exec-out screencap -p > "$OUT/screen-$i.png"
  if ! adb shell pidof "$PKG" >/dev/null; then
    echo "::error::Lumen is not running $((i * 15)) seconds after launch"
    status=1
    break
  fi
done

adb logcat -d > "$OUT/logcat.txt"
echo "----- crash-related log lines -----"
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative  |libc    : Fatal|DEBUG   :|Abort message|SoLoader|UnsatisfiedLink|$PKG" "$OUT/logcat.txt" | tail -n 250
[ "$status" -eq 0 ] && echo "Lumen launched and stayed running."
exit "$status"
