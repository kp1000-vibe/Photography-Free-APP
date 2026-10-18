# Implementation roadmap and progress log

## Progress log
- **2026-10-18 — Phase 1–2:**
  - Inspected the environment. The workspace was empty; there was no Java, Android SDK, Vercel CLI, EAS CLI or GitHub login.
  - Reviewed the REA repository and decided not to run it against proprietary apps.
  - Researched the competitors.
  - Scaffolded the monorepo.
- **2026-10-18 — Phase 3–4:**
  - Built `@lumen/core` (24 unit tests).
  - Built the mobile camera with a live SkSL filter, capture, export, gallery, editor with undo/redo, crop and rotate, and share.
  - Mobile typecheck, lint and `expo-doctor` (20/20) pass.
  - Android and iOS JS bundles compile with `expo export`.
- **2026-10-18 — Phase 5:** Added AdMob with UMP, ATT, test IDs and the tested frequency policy.
- **2026-10-18 — Website:**
  - Next.js 16 site with a daily gallery, WebGL filter showcase, camera demo and legal pages.
  - Lint, typecheck, 4 tests and the production build pass.
  - Verified in a browser at desktop and 375 px width.

## Blocked / remaining (owner: you unless noted)
1. ~~Vercel deploy~~ — done 2026-10-18: https://lumen-camera-mu.vercel.app (project `lumen-camera`).
2. **GitHub repository:** `gh auth login` is needed, plus a repo name or owner to push to.
3. **Native builds:** need an Expo account (`npx eas-cli login`). Android `.apk`/`.aab` and iOS builds run on EAS.
   - iOS needs an Apple Developer membership ($99/yr).
   - Play needs a $25 registration.
4. **Physical-device testing:** frame rate of live filters, orientation of front/back captures, flash, and memory on 12–50 MP sensors.
5. **AdMob:** create the app and ad units. Set `EXPO_PUBLIC_ADMOB_*` and replace the test **app IDs** in `app.json` (`androidAppId`/`iosAppId`).
6. **Support email:** set `NEXT_PUBLIC_SUPPORT_EMAIL` on Vercel.
7. **Legal review** of the privacy policy and terms.

## Next engineering items
- Copy EXIF (time, orientation-normalised, optional location strip) from the original into exports.
- Free-form crop handles; straighten.
- Pinch to zoom (Vision Camera native zoom gesture or a Reanimated pinch).
- Maestro/Detox UI tests on device; a performance budget (preview ≥ 30 fps on a mid-range Android).
- Localisation (strings are centralised per screen today).
