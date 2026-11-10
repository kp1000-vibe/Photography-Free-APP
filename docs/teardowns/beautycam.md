# Teardown: BeautyCam (Meitu) — `com.meitu.meiyancamera`

_Researched 31 October 2026 from public sources only. No APK was downloaded, decompiled or run, and no paid feature was unlocked._

## Why this is a public-evidence teardown, not a decompile

The request was to reverse engineer the app with [REA](https://github.com/morluto/rea). That wasn't done, for these reasons:

- **Getting the app:** Google Play doesn't serve APK files. The options are third-party mirror sites (untrusted downloads) or extracting it with `adb` from an installed copy.
- **REA's rules:** its disclaimer limits use to software you own or are authorized to examine, and excludes "copying proprietary software or reproducing its protected code".
- **This project's brief:** it forbids copying proprietary code or assets, and calls for studying competitors through legitimate public evidence only.
- **Bypassing VIP:** unlocking paid features would mean circumventing a licence check. That is excluded both by REA's disclaimer and by law in most jurisdictions.

Everything below Lumen needs (modes, pricing, data practices, complaints) is observable publicly. Any Lumen equivalent is an independent implementation.

## Snapshot

| | |
|---|---|
| Developer | Meitu Technology Co., Ltd. (Xiamen, China) |
| Platforms | Android (`com.meitu.meiyancamera`), iOS (App Store id 592331499) |
| iOS listing (UK) | 4.8★ from 686 ratings · 13+ · v13.3.90 · 579 MB · iOS 13+ |
| Scale (company claim) | #1 by user scale in China's photo and camera category for 8 consecutive years (QuestMobile 2023). Meitu VIP members across all its apps exceeded 7.2 M (June 2023, +44% YoY). |
| Play listing | Couldn't be read automatically (the page content was truncated); the figures above are from iOS |

## Every mode and tool, with how it's monetised

The App Store description names the features but **does not label which are VIP**. "VIP?" below means it's plausibly paid but not confirmed from a public source. Confirming it needs a hands-on check of the paywall prompts on a device, without bypassing them.

| Area | Mode / tool (per the listing) | Free or VIP | Lumen decision |
|---|---|---|---|
| **Camera styles** | DSLR-style camera (zoom, depth of field, white balance) | Free camera; VIP? for some styles | **Partly have.** Zoom is shipped. Next: a white-balance preset (maps onto `temperature`/`tint`). Simulated depth of field needs segmentation; later. |
| | Digicam look | VIP? | **Adopt, free.** A "Digicam" filter: lifted blacks, cool shadows, slight vignette, using the existing grade parameters plus a grain parameter (new). |
| | Film-camera styles | VIP? | **Have, free.** Lumen's Film filter; can add 2–3 film variants. |
| | Photo Booth (frames and effects) | VIP? | **Later, free.** A 2×2 / 1×4 strip layout made from consecutive captures; frames must be original artwork. |
| **Lighting** | "Vibe Light" low-light selfie light | VIP? | **Adopt, free.** A front-camera screen flash (white screen overlay at capture). Cheap, and big for selfies. |
| **Portrait / beauty** | Portrait styles, AI facial feature enhancement | VIP? | **Adopted the subtle part, free.** Lumen's Portrait filter, plus opt-in skin smoothing (off by default). It finds skin by colour on the GPU, so it needs no face detection and runs live in the viewfinder. |
| | Makeup | VIP? | **Exclude.** Conflicts with the "natural" positioning. |
| | Wrinkle removal, concealer | VIP? | **Adopted the gentle part, free.** Opt-in blemish softening for small dark or red spots on skin, never automatic. No concealer or wrinkle-removal mode. |
| | 3D nose sculpting, face/body reshaping, **AI Slimming** | VIP? | **Exclude permanently.** Face and body reshaping goes against Lumen's PRD non-goals and raises body-image concerns. |
| | Hairstyle and hair-colour change | VIP? | **Exclude.** Generative; off-brand. |
| **AI editing** | AI Removal (objects / obstructions) | VIP? | **Later, free, on-device only.** Needs an inpainting model running locally (no uploads). Research feasibility on mid-range phones. |
| | AI Expansion (extend borders) | VIP? | **Exclude for now.** Generative and needs large models; server processing would break Lumen's no-upload promise. |
| | Smart background removal / cutout, background swap | VIP? | **Adopted, free, on-device.** Background blur and cutout for people in the editor, using a bundled segmentation model (MediaPipe Selfie Segmenter, Apache 2.0). No background swap yet. |
| | HD quality restoration | VIP? | **Exclude for now.** Super-resolution models are heavy; revisit. |
| | AI Effect, AI Wardrobe, AI Nail Art, "painting pet" | VIP? | **Exclude.** Generative novelty, off-brand, and likely server-side. |
| **Filters** | "Vibrant filters" | Mixed (some packs typically VIP) | **Have, free.** All nine Lumen filters with intensity, free. |
| **Video** | Teleprompter | VIP? | **Out of scope (v1).** Lumen v1 is stills only. |
| | Video portrait beautification | VIP? | **Exclude** (reshaping/beauty; video out of scope). |

## Paid tiers (UK App Store, as listed)

| Product | Price |
|---|---|
| VIP Weekly | £4.49 |
| VIP Monthly | £6.99 |
| VIP Quarterly | £10.99 |
| VIP Yearly | £28.49 – £49.99 (several price points listed) |
| SVIP Monthly | £11.99 |

There are two tiers (VIP and SVIP), several durations including a **weekly** plan, and several yearly price points, which suggests A/B-tested or regional pricing. The listing doesn't say which features each tier unlocks.

## Privacy disclosures (iOS label, self-reported by the developer)

- **Used to track you:** Diagnostics.
- **Not linked to you:**
  - Third-party advertising: device ID, diagnostics.
  - Analytics: **photos or videos**, product interaction, crash data.
  - Personalisation: name.
  - App functionality: phone number, **photos or videos**, audio, performance data.

Photos and videos are declared as collected for analytics and app functionality. That's consistent with server-side AI features, and it's the opposite of Lumen's position (photos never leave the device).

## What users complain about (indicative, mostly aggregator sources)

These come from aggregator and review-analysis sites, mostly about Meitu's apps in general, so treat them as signals, not measurements.

- Charges users say they didn't authorise, and free trials converting to annual plans (late 2025 – Feb 2026).
- Hard to cancel; charges after cancellation.
- A "VIP+" tier for watermark removal causing friction.
- In the sibling Meitu app: paying members still seeing ads, and "AI server busy" errors.

## Implications for Lumen

1. **The differentiator holds.** BeautyCam's paid features sit behind weekly-to-yearly subscriptions and generate billing complaints. Lumen's "every feature free, no subscription" is a real contrast. Say it plainly on the website.
2. **Worth building free, in this order:**
   1. Front-camera screen flash ("Vibe Light" equivalent).
   2. Digicam filter plus a grain parameter.
   3. On-device background cutout. *(Done, with background blur.)*
   4. Photo Booth strips.
   5. On-device object removal (research).
3. **Never build:** face or body reshaping, slimming, makeup, generative wardrobe or hair changes, or anything that needs photo uploads.
4. **Privacy messaging:** "Your photos never leave your phone" is a concrete contrast with a competitor that declares photo collection.

## Sources
- [BeautyCam on the UK App Store](https://apps.apple.com/gb/app/id592331499) (features, in-app purchases, privacy label)
- [Meitu press release, 19 Dec 2023](https://www.meitu.com/en/media/407) (rankings, VIP membership, AI features)
- [Meitu press release (7 consecutive years)](https://www.meitu.com/en/media/383)
- [Sikayetvar — Meitu complaints](https://www.sikayetvar.com/en/meitu-us)
- [marlvel.ai — BeautyCam (com.meitu.myxj) review analysis](https://marlvel.ai/apps/com-meitu-myxj/reviews)
- [BeautyCam on the Japanese App Store](https://apps.apple.com/jp/app/beautycam-%E5%86%99%E7%9C%9F%E8%A3%9C%E6%AD%A3-ai%E3%82%A4%E3%83%A9%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%BF%E3%83%BC/id592331499) (developer reply on billing)
- [REA DISCLAIMER](https://github.com/morluto/rea/blob/main/DISCLAIMER.md)
