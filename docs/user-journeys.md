# User journeys

## 1. First launch → first photo
1. The app opens straight to the camera. There is no onboarding carousel.
2. If camera permission is undetermined, a single explanation screen offers **Allow camera**.
3. The preview starts with the **Natural** filter at 80%.
4. The user taps the shutter. There is a haptic and a shutter blink, and the shutter is ready again immediately.
5. In the background the photo is graded and saved:
   - The original is copied into app storage.
   - The full-resolution graded JPEG is rendered.
   - Photos add-only permission is requested once, and the photo is saved to Photos (into a "Lumen" album where allowed).
   - A "Saving…" pill shows while this runs.

**Failure paths:**
- Photos permission denied: "Saved in Lumen. Allow Photos access…"
- Capture fails: a message appears and the shutter stays available.

## 2. Camera permission denied → recovery
The gate screen explains why the camera is needed and offers:
- **Open Settings**.
- **Edit a photo from your library instead**, which uses the system picker and needs no library permission.

Permission is re-checked when the app returns to the foreground.

## 3. Choosing and tuning a filter before capture
1. The user swipes the filter tray. Each swatch is rendered with that filter's real shader.
2. They tap a filter. The preview updates on the next frame.
3. The intensity slider above the tray adjusts strength. VoiceOver/TalkBack users get an adjustable control with increment and decrement.

## 4. Re-editing later
1. The user opens Gallery (the last-photo thumbnail) and picks a photo.
2. The editor loads the **original** and the previous edit state.
3. They work in the Filters, Adjust and Crop tabs:
   - **Filters:** filter plus intensity.
   - **Adjust:** brightness, contrast, saturation, highlights, shadows, warmth.
   - **Crop:** preset ratios and 90° rotate.
4. Undo/redo records each committed change. Press and hold the preview to compare with the original.
5. **Save** at Full, High or Share quality writes a new copy to Photos.
6. **Share** opens the native share sheet with a Share-quality JPEG.
7. Leaving with unsaved changes asks "Discard edits?". The Android back button is intercepted, and the iOS swipe-back gesture is disabled on the editor.

## 5. Ads (post-export only)
After a save or share completes, the ad policy may allow an interstitial, but only when all of these hold:
- More than 24 hours have passed since install.
- At least 3 exports have happened since the last interstitial.
- It has been at least 4 minutes since the last interstitial.
- Fewer than 3 interstitials have shown this session.
- An ad is already loaded.
- The device is online.
- Consent allows ad requests.

Banners appear only in Gallery and Settings. Nothing is ever shown on the camera or in the editor.

## 6. Website visitor
1. The visitor lands on the home page and sees today's gallery: 12 photos that change daily, each graded live in the browser with a Lumen filter, with a hold-to-compare control.
2. They read the features, the filter list and how the app stays free.
3. **Try the filters** opens the in-browser camera demo (with explicit permission) and lets them download a graded photo.
4. Store buttons show "coming soon" until the store URLs are configured.
