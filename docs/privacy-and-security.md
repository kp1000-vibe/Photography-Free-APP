# Privacy and security

## Data inventory (mobile app)

| Data | Where | Leaves the device? |
|---|---|---|
| Original photos | App document directory | No |
| Exported photos | App cache, plus the system photo library (if the user allows) | No (unless the user shares) |
| Edit state, library index | AsyncStorage | No |
| Ad frequency-cap counters | AsyncStorage | No |
| Advertising ID, IP, device info | Collected by the Google Mobile Ads SDK | Yes, to Google, subject to consent |

There are no first-party analytics, no crash reporting and no accounts.

## Permissions

| Platform | Permission | Requested when | Notes |
|---|---|---|---|
| iOS/Android | Camera | On the camera screen, after an explanation | Recovery path to Settings |
| iOS | Photo library add (`NSPhotoLibraryAddUsageDescription`) | First save | Write-only request (`requestPermissionsAsync(true)`) |
| iOS/Android | Image picker | User taps "Edit a photo from library" | The system picker needs no library permission |
| iOS | Tracking (ATT) | After UMP consent | Declining gives non-personalised ads |
| Android | `RECORD_AUDIO`, `ACCESS_FINE_LOCATION` | **Blocked** in `app.json` | — |

## Consent and regulations
- **Google UMP consent form:** `AdsConsent.gatherConsent()`. It is shown where required (EEA, UK, Switzerland). No ad requests are made until `canRequestAds`.
- **Privacy options entry point:** shown in Settings when `privacyOptionsRequirementStatus === REQUIRED`.
- **Children:** not directed at children. Before production, configure `tagForChildDirectedTreatment` and `tagForUnderAgeOfConsent` to match the store age rating.
- **Store disclosures to fill in:**
  - Apple privacy nutrition label: "Identifiers – Device ID" and "Usage Data – Advertising Data", both used for third-party advertising and linked to tracking only if ATT is granted.
  - Google Play Data safety: "Device or other IDs" collected and shared for advertising.

## Website
- No cookies and no analytics.
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, and a `Permissions-Policy` that allows camera only for the site itself.
- The image proxy accepts only numeric ids and the fixed tile sizes, so it can't be used as an open proxy.
- The camera demo processes video locally. Captures are blob URLs that never leave the browser.

## Secrets
- No secrets exist in either app.
- AdMob app and unit IDs are public identifiers, set via `EXPO_PUBLIC_*` variables.
- `.env*` files are git-ignored. Only `.env.example` files with empty values are committed.
- Signing credentials are managed by EAS, not stored in the repo.

## Checks run
- **Dependency audit:** `npm audit` reports advisories in transitive dev and build-tool dependencies (Expo CLI, ESLint tooling). They are tracked in the README status table. None ship in the website's client bundle; still to triage before release.
- **Secret scan:** `git grep` for key, token and private-key patterns before the first commit. Result recorded in the README.
