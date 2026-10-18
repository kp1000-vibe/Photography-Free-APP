# Technical architecture

```
lumen/
├── packages/core      Pure TypeScript: filter definitions, grading maths (CPU reference),
│                      GLSL/SkSL shader source, editor state + undo/redo, ad policy. Unit-tested.
├── apps/mobile        Expo SDK 58 / React Native 0.88 app (iOS + Android), Expo Router
└── apps/web           Next.js 16 (App Router, Cache Components) website, deployed to Vercel
```

There is **no backend**. The website's only server code is a cached, allow-listed image proxy (`/photos/[id]/[w]/[h]`). It exists because Picsum doesn't send CORS headers, and WebGL needs same-origin pixels.

## Architecture decision record (ADR-0001)

**Status:** accepted, 18 October 2026.

### Why Expo + React Native + Vision Camera 5 + Skia
- **One TypeScript codebase for iOS and Android.** The filter maths, editor state and ad rules live in `@lumen/core` and are shared with the website.
- **Live filtering is possible.** `react-native-vision-camera` 5.2 (Nitro modules) streams frames to `react-native-vision-camera-skia`. Its `SkiaCamera` gives us a GPU texture per frame, and we draw it through our own SkSL runtime effect. The plugin documents this exact pattern (frame texture → shader → canvas). If this couldn't hold frame rate on a target device, the fallback would be a custom native pipeline (Metal / OpenGL ES): the shader is already GLSL-compatible, so only the host code would change.
- **Expo config plugins and CNG.** `ios/` and `android/` are generated, permissions are declared in `app.json`, and EAS builds iOS without a Mac. This matters because development happened on Windows.
- **Rejected alternatives:**
  - `expo-camera`: it has no frame-processor and Skia path, so it can't do live filters.
  - Fully native Swift + Kotlin: two codebases, slower to ship.
  - Flutter: no shared code with the Next.js website.

### How real-time filters work
1. `packages/core/src/shader.ts` holds **one** grading function, written in the GLSL subset that is also valid SkSL. It covers exposure, highlights/shadows, contrast, temperature/tint, split toning, saturation/vibrance, mono mix, fade and vignette.
2. The camera screen pushes the resolved uniform array to the frame thread with a `react-native-worklets` Synchronizable. The `onFrame` worklet reads it with a non-blocking `getDirty()`, builds the shader with the frame texture as a child, and draws.
3. "Original" (neutral parameters) skips the shader entirely.
4. `packages/core/src/grade.ts` is a line-for-line CPU port that the unit tests use to check behaviour:
   - identity at intensity 0;
   - bounds;
   - mono gives equal channels;
   - warm/cool direction;
   - matte lifts blacks;
   - vignette.

   A test also checks that the uniform array order matches the shader's declarations.

### How image quality is maintained
- The camera captures at the photo output's default target (4:3 UHD) to a file, and the original is **copied unchanged** into app storage.
- Export always starts from that original:
  1. `expo-image-manipulator` bakes in EXIF orientation, then rotates, crops and resizes (only when downscaling for High/Share) into a **lossless PNG** intermediate.
  2. Skia grades it on an offscreen GPU surface.
  3. A single JPEG encode follows: 95% for Full, 90% for High, 85% for Share.

  That means at most one lossy generation after the camera's own encode.
- If a full-size GPU surface can't be allocated, it falls back to a 4096 px long edge instead of failing.
- **Known loss:** re-encoding drops the camera's EXIF metadata (capture time, lens). Carrying EXIF over is on the roadmap. The original in app storage keeps it.

### How ads are integrated
`react-native-google-mobile-ads` 17, wrapped by `AdsProvider`:
1. Gather UMP consent.
2. On iOS, request App Tracking Transparency.
3. Initialise the SDK.
4. Preload one interstitial.

Whether an ad may appear is decided only by the pure, tested `@lumen/core/ads` policy. Development and preview builds use Google's official test IDs. Production reads unit IDs from `EXPO_PUBLIC_ADMOB_*` and shows **no ad** if they are missing; it never falls back to test IDs.

### Shared vs platform-specific code
| Shared (`@lumen/core`) | Native modules (through libraries, no hand-written native code) | Web only |
|---|---|---|
| Filters, shader source, CPU grading, editor state, undo/redo, crop maths, export sizes, ad policy | Camera (Vision Camera), GPU rendering (Skia), file system, photo library, image manipulator, sharing, haptics, AdMob, ATT | WebGL renderer, daily gallery, image proxy |

### What can't be done reliably on the web
- Full-resolution stills: `getUserMedia` gives video frames, typically up to 1080p.
- Flash and torch: `torch` exists only in some Chromium builds.
- Optical zoom selection, exposure compensation and tap to focus: inconsistent `MediaTrackCapabilities`.
- Saving into the photo library.
- Background processing.

The web page is therefore a **demo** of the filters, not a replacement for the app, and it says so on the page.

## Data and privacy flow
Everything happens on the device:
- **Library index:** AsyncStorage.
- **Originals:** `Paths.document/originals`.
- **Exports:** cache, plus Photos.

Network traffic from the app is AdMob only. See [privacy-and-security.md](privacy-and-security.md).
