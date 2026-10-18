# Feature comparison and matrix

**Legend:** ✓ = yes, ✗ = no, ~ = partial, ? = not verified. Competitor cells come from [competitive-analysis.md](competitive-analysis.md).

| Capability | Snapseed | Retrica | Open Camera | **Lumen v0.1** |
|---|---|---|---|---|
| Live filters in the viewfinder | ~ (built-in camera on iPhone; filter-live behaviour ?) | ✓ | ✗ (colour effects only) | ✓ GPU shader |
| Filter intensity control | ✓ in editor | ✗ (a user-review complaint) | n/a | ✓ in camera and editor |
| Re-edit after capture | ✓ | ? | ✗ | ✓ (original kept) |
| Manual exposure / ISO / white balance | ✗ | ✗ | ✓ | ~ exposure compensation only |
| Flash, torch, zoom, timer, grid | ? | ~ | ✓ | ✓ |
| Crop / rotate | ✓ | ? | crop guides | ✓ (preset ratios, 90° rotate) |
| Undo / redo | ✓ | ? | n/a | ✓ |
| RAW | ✓ (editing DNG) | ✗ | ✓ | ✗ |
| Ads | none | yes | none in app | yes, rule-limited |
| Paid tier | none | Premium subscription | none | **none (forbidden)** |
| Platforms | iOS, Android | iOS, Android | Android | iOS, Android, web demo |

## Matrix

| # | Feature | Decision | Why | iOS | Android | Web | Native code needed |
|---|---|---|---|---|---|---|---|
| 1 | Live filters in the preview | **Adopt (core)** | The Retrica hook | ✓ | ✓ | ✓ demo | Vision Camera + Skia (native modules) |
| 2 | Intensity slider on every filter | **Improve** | Fixes a Retrica complaint | ✓ | ✓ | ✓ | no |
| 3 | Subtle, natural filter library | **Differentiate** | Positioning | ✓ | ✓ | ✓ | no (shared shader) |
| 4 | Same shader for preview and export | **Differentiate** | What you see is what you get | ✓ | ✓ | ✓ | Skia |
| 5 | Keep the original and re-edit | **Adopt** (Snapseed pattern) | Trust, non-destructive editing | ✓ | ✓ | ✗ | file system |
| 6 | Flash, torch, zoom, timer, grid, aspect | **Adopt** | Baseline camera expectations | ✓ | ✓ | ~ | camera |
| 7 | Exposure compensation, tap to focus | **Adopt** | Useful, low clutter | ✓ | ✓ | ✗ | camera |
| 8 | Full manual ISO/shutter/WB | **Exclude (v1)** | Clutter; device-dependent | ? | ? | ✗ | Camera2 / AVFoundation |
| 9 | RAW capture | **Exclude (v1)** | Can't promise across devices | ? | ? | ✗ | native |
| 10 | Face reshaping / beauty | **Exclude** | Against the "natural" positioning | — | — | — | — |
| 11 | Subscriptions / IAP / watermark | **Exclude (forbidden)** | Product promise | — | — | — | — |
| 12 | Strict ad-placement rules in code | **Differentiate** | Trust | ✓ | ✓ | n/a | AdMob SDK |
| 13 | Daily photo showcase on the website | **Differentiate** | Discovery; shows the filters | n/a | n/a | ✓ | no |
| 14 | Free-form drag crop | **Improve later** | v0.1 ships preset ratios | — | — | — | — |
| 15 | Video | **Exclude (v1)** | Scope | — | — | — | — |
