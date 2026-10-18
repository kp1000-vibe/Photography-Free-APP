# Competitive analysis

_Researched 18 October 2026. Sources are listed at the end; anything not backed by a source is marked as our own assessment._

## Method and limits

- **Evidence used:** public store listings, official websites, press reviews, and published user reviews.
- **Not done:** hands-on device testing of the competitor apps (no test devices were available in this environment), traffic or revenue measurement, and decompilation.
- **Reverse-engineering repository:** the requested tool, [morluto/rea](https://github.com/morluto/rea) (MIT), is an MCP server/CLI for inspecting binaries, APKs and JS apps the user is authorised to analyse. Its Android path needs Java 17+ and a separately supplied JADX MCP JAR; neither was installed. More importantly, decompiling Snapseed or Retrica would not help a clean-room product and conflicts with the brief's "never copy proprietary source" rule and REA's own [DISCLAIMER](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) (no copying proprietary code). REA was therefore **not run against any competitor app**. Open Camera is open source (GPL-3.0), so its behaviour can be studied from its public documentation; no GPL code was copied into Lumen.

## Reference apps

### Snapseed (Google) — iOS, Android
- **Model:** free; no ads, no in-app purchases (per multiple 2026 reviews).
- **Recent:** major 4.0 update in May 2026 (Android 2.22 → 4.0, iOS 3.20 → 4.0). iOS added film-inspired looks (Bloom, Halation); Android redesigned the slider/carousel layout. Snapseed also has a built-in camera on iPhone, batch editing, masking and RAW DNG support.
- **Strengths to learn from:** high-quality, precise adjustments; no paywall; edits are re-editable.
- **Gaps (our assessment):** an editor first; its strengths are post-capture, not a live-filter viewfinder. Its long update gaps (about two years between 2.22 and 4.0) show the risk of depending on a free product with no revenue.

### Retrica (Venticake) — iOS, Android
- **Model:** free with ads; a **Retrica Premium** subscription removes ads (App Store listing). Some filters have historically been sold as in-app purchases.
- **Core feature:** a large set of filters applied **live to the viewfinder**. A past Android Central review reported no slowdown with filters on.
- **Recurring complaints in public reviews:**
  - Users who bought the earlier one-time "Pro" upgrade were later asked to subscribe to remove ads.
  - Filters are too strong and there's no intensity slider.
- **Lessons:** live filters are the hook. Paywall changes destroy trust, so make filters adjustable and subtle.

### Open Camera (Mark Harman) — Android only
- **Model:** free and open source (GPL-3.0+). There are no third-party ads in the app (the website has ads).
- **Features:** manual scene/white-balance/ISO/exposure controls, timer, grid, crop guides, HDR, panorama, Camera2 manual controls, RAW, focus peaking, histogram, and an option to strip EXIF.
- **Lessons:** be transparent, offer real controls and respect privacy. The UI is dense and control-heavy, which is a deliberate trade-off for power users.

## Market gap Lumen targets

No reference app combines all of the following:

1. Subtle, natural live filters with an intensity slider.
2. The same look applied at full resolution after capture, and re-editable later.
3. Every feature free, with a written, enforced rule set for where ads may appear.

## Sources
- [TechGenyz — Snapseed 4 Android update](https://techgenyz.com/snapseed-4-android-update-new-photo-editing-features/)
- [PCBuildAdvisor — fully free photo editing apps for iPhone](https://www.pcbuildadvisor.com/?p=5130)
- [Amateur Photographer — Snapseed free on iOS and Android](https://amateurphotographer.com/?p=139395)
- [Retrica on the App Store](https://apps.apple.com/app/id577423493)
- [Justuseapp — Retrica user reviews](https://justuseapp.com/en/app/577423493/retrica-original-filter-camera/reviews)
- [Android Central — Retrica review](https://www.androidcentral.com/retrica-review)
- [Softpedia — Retrica for Android](https://mobile.softpedia.com/android/Retrica-Android-Review-667.html)
- [AppBrain — Retrica](https://www.appbrain.com/app/retrica/com.venticake.retrica)
- [Open Camera official site](https://opencamera.org.uk/)
- [morluto/rea README and DISCLAIMER](https://github.com/morluto/rea)
