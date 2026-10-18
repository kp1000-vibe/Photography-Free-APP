/**
 * Ad placement rules. Ads are the only revenue source, so these rules are the
 * contract that keeps them from getting in the way of taking photos.
 */

export type AppContext =
  | 'camera' // live preview, capture, timer countdown
  | 'editor' // unsaved edits may exist
  | 'export-complete' // a save/share just finished
  | 'gallery'
  | 'settings'
  | 'onboarding';

export interface AdPolicyConfig {
  /** Minimum time between interstitials. */
  minIntervalMs: number;
  /** Completed exports needed before each interstitial. */
  exportsPerInterstitial: number;
  /** Cap per app session. */
  maxPerSession: number;
  /** No interstitials in the first N ms after first install. */
  gracePeriodMs: number;
}

export const DEFAULT_AD_POLICY: AdPolicyConfig = {
  minIntervalMs: 4 * 60_000,
  exportsPerInterstitial: 3,
  maxPerSession: 3,
  gracePeriodMs: 24 * 60 * 60_000,
};

export interface AdState {
  installedAt: number;
  lastInterstitialAt: number | null;
  interstitialsThisSession: number;
  exportsSinceInterstitial: number;
}

export function initialAdState(now: number): AdState {
  return { installedAt: now, lastInterstitialAt: null, interstitialsThisSession: 0, exportsSinceInterstitial: 0 };
}

export interface AdEnvironment {
  /** False in development/test builds or when the user has not given consent to request ads. */
  adsEnabled: boolean;
  online: boolean;
  /** An interstitial has already finished loading. Never block waiting for one. */
  interstitialReady: boolean;
}

/** Banners only on screens without camera controls or unsaved work. */
export function canShowBanner(context: AppContext, env: Pick<AdEnvironment, 'adsEnabled' | 'online'>): boolean {
  return env.adsEnabled && env.online && (context === 'gallery' || context === 'settings');
}

export function recordExport(s: AdState): AdState {
  return { ...s, exportsSinceInterstitial: s.exportsSinceInterstitial + 1 };
}

export function canShowInterstitial(
  context: AppContext,
  s: AdState,
  env: AdEnvironment,
  now: number,
  cfg: AdPolicyConfig = DEFAULT_AD_POLICY,
): boolean {
  if (!env.adsEnabled || !env.online || !env.interstitialReady) return false;
  // Only at the natural pause right after a finished export.
  if (context !== 'export-complete') return false;
  if (now - s.installedAt < cfg.gracePeriodMs) return false;
  if (s.interstitialsThisSession >= cfg.maxPerSession) return false;
  if (s.exportsSinceInterstitial < cfg.exportsPerInterstitial) return false;
  if (s.lastInterstitialAt !== null && now - s.lastInterstitialAt < cfg.minIntervalMs) return false;
  return true;
}

export function recordInterstitial(s: AdState, now: number): AdState {
  return {
    ...s,
    lastInterstitialAt: now,
    interstitialsThisSession: s.interstitialsThisSession + 1,
    exportsSinceInterstitial: 0,
  };
}

/** Called on app launch: the per-session counter resets, the rest persists. */
export function startSession(s: AdState): AdState {
  return { ...s, interstitialsThisSession: 0 };
}
