# Product requirements — Lumen v0.1

**Positioning:** "Beautiful photos. Natural filters. No subscription. No paywall. Free forever, supported by ads."

## Goals
- G1. Live, natural-looking filters in the viewfinder on iOS and Android.
- G2. What you see is what you get: the same shader for preview and full-resolution output.
- G3. Every feature is free. Ads are the only revenue and never interrupt shooting or editing.
- G4. Private by default: no account, no uploads, no first-party analytics.

## Non-goals (v0.1)
Video, RAW, manual ISO/shutter/white balance, face or body reshaping and makeup, cloud sync, social feed, user accounts.

## Requirements and status

| ID | Requirement | Status in code |
|---|---|---|
| C1 | Camera opens directly; fast start | Done (`apps/mobile/src/app/index.tsx`) |
| C2 | Front/back switch | Done |
| C3 | Flash (off/auto/on) and torch where the device supports them | Done, gated on `device.hasFlash`/`hasTorch` |
| C4 | Zoom stops (1×/2×/3× within device range) | Done |
| C5 | Exposure compensation, clamped to ±2 EV and the device range | Done, gated on `supportsExposureBias` |
| C6 | Tap to focus with a focus ring | Done (`SkiaCameraRef.focusTo`) |
| C7 | Grid, timer (3s/10s, cancellable), aspect 3:4/1:1/4:5 | Done |
| C8 | Permission explanation, denied/restricted recovery | Done |
| C9 | Capture, processing and save status | Done ("Saving…" pill, notices) |
| F1 | Nine filter families plus Original; each with preview and intensity | Done (`packages/core/src/filters.ts`) |
| F2 | GPU live preview, no per-frame CPU work on full-resolution frames | Done (SkSL runtime effect on the frame texture) |
| F3 | Full-resolution export from the untouched original | Done (`apps/mobile/src/lib/export.ts`) |
| E1 | Recent captures grid; import from library | Done |
| E2 | Filter change after capture; six adjustments | Done |
| E3 | Crop (preset ratios) and rotate | Done; free-form crop is a later item |
| E4 | Undo/redo; before/after | Done |
| E5 | Save a copy; quality Full/High/Share; share sheet | Done |
| E6 | Storage, permission and memory errors handled gracefully | Done (messages; downscale fallback) |
| M1 | No IAP/subscription/credits/watermark | Done; no billing SDK in the dependency tree |
| M2 | Banner in Gallery/Settings only; interstitial only after export, capped | Done (`packages/core/src/ads.ts`, unit-tested) |
| M3 | Consent (UMP), iOS ATT, non-personalised fallback | Done (`apps/mobile/src/lib/ads.tsx`) |
| M4 | Test ads in development; ads can be disabled | Done (`EXPO_PUBLIC_ADS_MODE`) |
| W1 | Website: landing, features, filter showcase, privacy, terms, support, store links | Done (`apps/web`) |
| W2 | Daily-changing, freely licensed gallery photos (from the UI reference) | Done (`apps/web/lib/daily.ts`) |
| W3 | In-browser camera demo with fallback | Done (`apps/web/app/camera`) |

## Acceptance criteria
See the Definition of Done table in the [README](../README.md#status).

## Skin retouching (added after v1 scope)

Opt-in skin smoothing and blemish softening, free like everything else. Both are sliders that start at 0, in the camera (the Skin button on the viewfinder) and in the editor (the Skin tab). Nothing is applied unless the user moves a slider. Skin is found by colour on the GPU, so there is no face detection, no model download and no upload. Face and body reshaping stay out of scope.

## Background blur and cutout (added after v1 scope)

In the editor's Background tab: Original, Blur (with a strength slider) or Cutout. A 250 KB model bundled with the app finds the person on the device; the photo is never uploaded and it works offline. Blur exports as a JPEG. Cutout exports as a PNG with a transparent background. If no person is found the photo is left as it is and the editor says so. It is for people fairly close to the camera, not pets or objects, and it is not in the live viewfinder yet.
