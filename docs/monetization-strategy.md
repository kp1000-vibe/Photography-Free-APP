# Monetization strategy

**Ads only.** The following are permanently excluded:
- subscriptions;
- in-app purchases;
- credits;
- paid filter packs;
- premium controls;
- watermarks.

There's no billing library in the dependency tree. Search `apps/mobile/package.json` for `iap`, `purchases` or `billing` and you'll find nothing.

## Placement rules (enforced in `packages/core/src/ads.ts`, unit-tested)

| Format | Where | Rules |
|---|---|---|
| Anchored adaptive banner | Gallery, Settings | Only if consent allows ads and the device is online. Never on the camera or in the editor. |
| Interstitial | Right after a save or share has **completed** | Only when all of these hold: more than 24 h since install; at least 3 exports since the last one; at least 4 min apart; at most 3 per session; already loaded (we never wait on an ad); online. |
| Rewarded | **Not used** | No optional benefit exists that isn't a core feature, and gating a core feature behind an ad is forbidden. |
| Camera preview | **Never** | — |

- **Offline:** no requests and no placeholders; the app works normally.
- **Load failure:** the banner collapses, and the interstitial is skipped.

## Revenue model

> ⚠️ All numbers below are **assumptions for planning**, not measured or verified ad data. Replace them with real AdMob reports after launch.

**Formula:**

> Daily revenue = DAU × (banner impressions/DAU × fill × banner eCPM + interstitial impressions/DAU × fill × interstitial eCPM) / 1000

| Assumption | Low | Base | High | Reasoning |
|---|---|---|---|---|
| DAU | 2,000 | 10,000 | 50,000 | Arbitrary scenarios |
| Sessions/user/day | 1.5 | 2 | 3 | Camera-app usage is bursty |
| Banner impressions/DAU/day | 0.8 | 1.5 | 2.5 | Banners only in Gallery/Settings |
| Interstitial impressions/DAU/day | 0.05 | 0.15 | 0.3 | Heavily capped (3 exports per ad, 24 h grace) |
| Fill rate | 60% | 80% | 90% | Varies by region and consent |
| Banner eCPM (blended, USD) | $0.15 | $0.50 | $1.20 | Strongly geography-dependent |
| Interstitial eCPM (blended, USD) | $1.50 | $4.00 | $9.00 | Strongly geography-dependent |
| Geographic mix | mostly emerging markets | mixed | mostly North America/Western Europe | Drives eCPM more than any other factor |

**Results (computed from the table):**

| | Low | Base | High |
|---|---|---|---|
| Banner $/day | 0.14 | 6.00 | 135.00 |
| Interstitial $/day | 0.09 | 4.80 | 121.50 |
| **Total $/month (30 d)** | **≈ $7** | **≈ $324** | **≈ $7,695** |
| Revenue per DAU per month | $0.004 | $0.032 | $0.154 |

## Operating costs (list prices, verify before purchase)

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Google Play developer registration | $25 one-time |
| Vercel | Hobby is free but restricted to **non-commercial** use. An ad-supported product's site is commercial, so plan for **Pro (~$20/user/month)**. |
| EAS Build | Free tier has limited monthly builds; paid plans if more are needed |
| Backend / database | $0 (none) |
| Domain (optional) | ~$10–20/year |

The base case roughly covers costs. The low case doesn't. Revenue scales with DAU and with the share of high-eCPM regions.
