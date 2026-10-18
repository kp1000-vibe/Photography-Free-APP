# Design system

**UI reference:** the screenshot you supplied, a tight photo grid with "Live Photo" pills, using copyright-free images that change daily. Lumen keeps its layout ideas and does not copy assets:
- **Mobile Gallery:** a 3-column grid with 2 px gaps.
- **Website:** a 2–4 column masonry with 4 px gaps, and a translucent dark pill badge that shows the filter name and intensity (a spinner while grading).

## Tokens

| Token | Mobile (always dark) | Web light | Web dark |
|---|---|---|---|
| bg | `#0B0B0C` | `#F6F4EF` | `#0B0B0C` |
| surface | `#161618` | `#FFFFFF` | `#161618` |
| surface raised | `#222225` | `#ECE9E2` | `#222225` |
| text | `#F4F2EE` | `#17161A` | `#F4F2EE` |
| muted | `#9A978F` | `#5F5C55` | `#A19E96` |
| accent | `#F2B84B` (warm lantern amber) | `#B97A12` text / `#F2B84B` fill | `#F2B84B` |
| radius | 8 / 12 / 20 / pill | 8 / 14 / pill | same |
| spacing | 4, 8, 12, 16, 24, 32 | 16 px gutter (24 px ≥ 768 px) | same |
| touch target | 48 pt minimum | 46 px buttons | same |
| type | 12 caption, 14 label, 16 body, 22 title | system stack, clamp() headings | same |

Sources:
- Mobile: `apps/mobile/src/theme.ts`.
- Web: CSS custom properties in `apps/web/app/globals.css`, with dark-mode overrides via `prefers-color-scheme` and `[data-theme]`.

## Screen inventory

| Screen | Platform | States |
|---|---|---|
| Camera | mobile | permission gate (undetermined / denied / restricted), starting, live, countdown, saving, error, notice |
| Gallery | mobile | skeleton, empty, grid, importing, import error; banner ad |
| Editor | mobile | loading, not found, Filters / Adjust / Crop tabs, comparing, exporting, saved / permission / error messages, discard dialog |
| Settings | mobile | ad status, privacy options (conditional), links; banner ad |
| Home | web | gallery skeleton, gallery grading → graded, compare, WebGL unsupported → original |
| Try the filters | web | idle, starting, running, denied, unavailable; captured photo |
| Privacy / Terms / Support / 404 | web | static |

## Principles
- The shutter is the primary action: the largest control, centred.
- There's one slider at a time, placed above the tray, never over the viewfinder.
- Glyphs are text-based (no icon font). Every control has an accessibility label, and sliders are `adjustable` with increment and decrement.
- Motion is limited to fades (`motion.fast` 120 ms) and respects `prefers-reduced-motion` on the web.
