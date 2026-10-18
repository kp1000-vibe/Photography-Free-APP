# Lumen

**Beautiful photos. Natural filters. No subscription. No paywall. Free forever, supported by ads.**

Lumen is a camera app for iOS and Android. It shows subtle, natural filters live in the viewfinder, and its editor keeps the original so you can re-edit later. A Next.js website covers product discovery, support, the legal pages and an in-browser filter demo.

| Path | What |
|---|---|
| [`packages/core`](packages/core) | Shared TypeScript: filters, grading shader (SkSL/GLSL) plus a CPU reference, editor history, ad policy |
| [`apps/mobile`](apps/mobile) | Expo SDK 58 / React Native 0.88 app: Vision Camera 5 + Skia live filters, editor, AdMob |
| [`apps/web`](apps/web) | Next.js 16 website, daily copyright-free photo gallery, WebGL camera demo |
| [`docs/`](docs) | Research, PRD, architecture (ADR), monetisation, privacy, roadmap, design system |

## Quick start

```bash
npm install                      # core + web
npm test                         # core unit tests
npm run dev -w web               # http://localhost:3000
cd apps/mobile && npm install
npx eas-cli build --profile development --platform android   # needs an Expo account
```

Expo Go **won't work**: Vision Camera, Skia and AdMob are native modules, so use a development build. Copy `apps/mobile/.env.example` and `apps/web/.env.example` to `.env` as needed. Development builds use Google's test ads.

## Status

Checked on 18 October 2026, on Windows 11 with Node 24. Statuses are PASS, FAIL, BLOCKED or NOT TESTED.

| Criterion | Status | Evidence |
|---|---|---|
| Android app builds | **BLOCKED** | JS bundle compiles (`expo export --platform android`, 4.8 MB Hermes). The native build needs an EAS login; there's no Android SDK or Java locally. |
| iOS app builds | **BLOCKED** | JS bundle compiles (`expo export --platform ios`). The native build needs an EAS login and an Apple Developer account. |
| Camera preview on physical devices | NOT TESTED | No device available |
| Live filters applied before capture | NOT TESTED on device | Implemented as an SkSL shader in `SkiaCamera.onFrame`. The same shader math is verified in a browser via WebGL (graded pixels differ from originals). |
| Captured photos can be edited and exported | NOT TESTED on device | Editor and export pipeline implemented; typecheck and lint pass |
| Orientation and quality validated | NOT TESTED | EXIF orientation baked in via the image manipulator; needs device checks for front and back cameras |
| Core features free | PASS | No billing SDK in dependencies; nothing is gated |
| No subscription / IAP | PASS | Same as above |
| Test ads in development | NOT TESTED at runtime | Test IDs wired in (`TestIds`, Google sample app IDs); requires a device build |
| Production ad config documented | PASS | [monetization-strategy.md](docs/monetization-strategy.md), `.env.example` |
| Ads never interrupt capture or unsaved work | PASS (logic) | 3 ad-policy test cases (placement by screen, grace period, export count, interval, session cap, readiness, offline) in `packages/core/test/core.test.ts` |
| Permissions and privacy disclosures | PASS (config) | `app.json` usage strings, blocked mic and location, UMP + ATT flow, `/privacy` page |
| Core and editing workflows tested | PASS (unit) / NOT TESTED (device) | 24 core + 4 web unit tests pass; manual device test plan below |
| Website builds and passes checks | PASS | `next build`, ESLint, `tsc`, vitest all green |
| Website deployed to Vercel | **PASS** | https://lumen-camera-mu.vercel.app — Vercel project `lumen-camera` (root `apps/web`); all routes return 200, proxy rejects unlisted sizes (404), canonical/OG/sitemap use the production domain, security headers present, gallery graded live in a browser (checked 18 Oct 2026) |
| GitHub repo with source | **PASS** | https://github.com/kp1000-vibe/Photography-Free-APP (`main`) |
| Release artifacts / build instructions | PASS (instructions) | See Releasing below |
| Store publication requirements listed | PASS | See Releasing below |

Also checked:
- `expo-doctor`: 20/20.
- Secret pattern scan: no matches.
- `npm audit --omit=dev`: web 0 vulnerabilities. Mobile reports advisories in Expo and React Native build tooling (Metro, `node-forge`, `braces`, `xcode`, `uuid`), not fixed with `--force` because that would break SDK pinning. Triage before release.

### Manual device test plan
1. Fresh install → camera permission prompt → deny → recovery screen → Settings → allow → preview.
2. For each filter: the preview changes; intensity at 0% matches Original; captures are saved to Photos with the same look.
3. Front camera capture: check the orientation and mirroring of the saved photo.
4. Flash auto/on, torch, zoom 1×/2×, exposure ±2, tap to focus, 10 s timer (cancel too), 1:1 and 4:5 crops.
5. Editor: adjust, crop, rotate, undo/redo, hold to compare, Save (Full, High, Share), Share sheet, and back with unsaved changes.
6. Airplane mode: capture, edit and save all work; no ads and no errors.
7. After 3 exports (with the 24 h grace period shortened for testing), a test interstitial appears only after the save completes.

## Releasing

### Android
```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build --profile preview --platform android      # installable APK (test ads)
npx eas-cli build --profile production --platform android   # AAB for Play
```
For Play:
- Register a developer account ($25).
- Create the app `app.lumencamera.android`.
- Complete Data safety (device IDs used for advertising) and the content rating.
- Declare that the app contains ads.
- Upload the AAB to internal testing.

### iOS
```bash
npx eas-cli build --profile production --platform ios       # EAS manages signing
npx eas-cli submit --platform ios
```
Needs:
- An Apple Developer Program membership ($99/yr).
- Bundle id `app.lumencamera.ios`.
- The App Privacy label (Identifiers and advertising data used for third-party advertising) and the ATT prompt (already configured).

### Before production
- Create the AdMob app and units.
- Replace the test **app IDs** in `apps/mobile/app.json`.
- Set the `EXPO_PUBLIC_ADMOB_*` environment variables in EAS.
- Set the support email.
- Have the legal pages reviewed.

### Website
Live at https://lumen-camera-mu.vercel.app. Redeploy from the repo root (the Vercel project's Root Directory is `apps/web`, so `@lumen/core` is uploaded too):
```bash
npx vercel deploy --prod
``` Vercel Hobby is for non-commercial use, so an ad-supported product should use Pro.

## License
[MIT](LICENSE). This covers the source code only. The Lumen name and app icon are not licensed as trademarks, and the gallery photos on the website belong to their Unsplash photographers.
