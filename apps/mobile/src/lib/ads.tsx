import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import mobileAds, {
  AdEventType,
  AdsConsent,
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  TestIds,
} from 'react-native-google-mobile-ads';
import {
  canShowBanner,
  canShowInterstitial,
  initialAdState,
  recordExport,
  recordInterstitial,
  startSession,
  type AdState,
  type AppContext,
} from '@lumen/core';

type AdsMode = 'off' | 'test' | 'production';

function resolveMode(): AdsMode {
  const raw = process.env.EXPO_PUBLIC_ADS_MODE;
  if (raw === 'off' || raw === 'test' || raw === 'production') return raw;
  return __DEV__ ? 'test' : 'production';
}

const MODE = resolveMode();

function unitId(kind: 'banner' | 'interstitial'): string | null {
  if (MODE === 'off') return null;
  if (MODE === 'test') return kind === 'banner' ? TestIds.ADAPTIVE_BANNER : TestIds.INTERSTITIAL;
  const ids = {
    banner: Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID,
    }),
    interstitial: Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
    }),
  };
  // Never fall back to test IDs in production: no ID simply means no ad.
  return ids[kind] || null;
}

const STATE_KEY = 'lumen.ads.v1';

interface AdsContextValue {
  /** Ads can be requested (consent gathered, SDK initialised, mode not off). */
  ready: boolean;
  online: boolean;
  nonPersonalized: boolean;
  /** Call after a save/share has fully finished. May show an interstitial. */
  onExportComplete: () => void;
  /** Whether the "Privacy options" entry point must be shown (e.g. GDPR regions). */
  privacyOptionsRequired: boolean;
  showPrivacyOptions: () => Promise<void>;
  mode: AdsMode;
}

const AdsContext = createContext<AdsContextValue | null>(null);

export function AdsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [nonPersonalized, setNonPersonalized] = useState(true);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const [interstitialReady, setInterstitialReady] = useState(false);
  const adState = useRef<AdState | null>(null);
  const interstitial = useRef<InterstitialAd | null>(null);

  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);

  // Restore persisted frequency-cap state and start a new session.
  useEffect(() => {
    AsyncStorage.getItem(STATE_KEY)
      .then((raw) => {
        const parsed: AdState | null = raw ? JSON.parse(raw) : null;
        adState.current = startSession(parsed ?? initialAdState(Date.now()));
        return AsyncStorage.setItem(STATE_KEY, JSON.stringify(adState.current));
      })
      .catch(() => {
        adState.current = initialAdState(Date.now());
      });
  }, []);

  // Consent first, then (iOS) tracking prompt, then SDK init. Failures leave ads off; the app is unaffected.
  useEffect(() => {
    if (MODE === 'off') return;
    let cancelled = false;
    (async () => {
      try {
        const consent = await AdsConsent.gatherConsent();
        if (cancelled) return;
        setPrivacyOptionsRequired(consent.privacyOptionsRequirementStatus === 'REQUIRED');
        if (!consent.canRequestAds) return;
        let personalized = false;
        if (Platform.OS === 'ios') {
          const tracking = await requestTrackingPermissionsAsync();
          personalized = tracking.granted;
        } else {
          const choices = await AdsConsent.getUserChoices();
          personalized = choices.selectPersonalisedAds;
        }
        await mobileAds().initialize();
        if (cancelled) return;
        setNonPersonalized(!personalized);
        setReady(true);
      } catch {
        // No consent form available (offline, misconfigured): stay ad-free this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Preload one interstitial. We never wait on it: if it isn't loaded when allowed, we skip.
  useEffect(() => {
    const id = unitId('interstitial');
    if (!ready || !online || !id) return;
    const ad = InterstitialAd.createForAdRequest(id, { requestNonPersonalizedAdsOnly: nonPersonalized });
    interstitial.current = ad;
    const subs = [
      ad.addAdEventListener(AdEventType.LOADED, () => setInterstitialReady(true)),
      ad.addAdEventListener(AdEventType.ERROR, () => setInterstitialReady(false)),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        setInterstitialReady(false);
        ad.load();
      }),
    ];
    ad.load();
    return () => {
      subs.forEach((unsubscribe) => unsubscribe());
      interstitial.current = null;
      setInterstitialReady(false);
    };
  }, [ready, online, nonPersonalized]);

  const onExportComplete = useCallback(() => {
    const now = Date.now();
    const current = adState.current;
    if (!current) return;
    let next = recordExport(current);
    const env = { adsEnabled: ready && MODE !== 'off', online, interstitialReady };
    if (interstitial.current && canShowInterstitial('export-complete', next, env, now)) {
      interstitial.current.show().catch(() => undefined);
      next = recordInterstitial(next, now);
    }
    adState.current = next;
    AsyncStorage.setItem(STATE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, [ready, online, interstitialReady]);

  const showPrivacyOptions = useCallback(async () => {
    try {
      await AdsConsent.showPrivacyOptionsForm();
    } catch {
      // Form unavailable offline; the settings screen explains this.
    }
  }, []);

  const value = useMemo<AdsContextValue>(
    () => ({ ready, online, nonPersonalized, onExportComplete, privacyOptionsRequired, showPrivacyOptions, mode: MODE }),
    [ready, online, nonPersonalized, onExportComplete, privacyOptionsRequired, showPrivacyOptions],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  const ctx = useContext(AdsContext);
  if (!ctx) throw new Error('useAds must be used inside AdsProvider');
  return ctx;
}

/** Anchored banner for gallery and settings only. Renders nothing when ads are unavailable. */
export function AdBanner({ context }: { context: AppContext }) {
  const { ready, online, nonPersonalized } = useAds();
  const [failed, setFailed] = useState(false);
  const id = unitId('banner');
  if (!id || failed || !canShowBanner(context, { adsEnabled: ready, online })) return null;
  return (
    <View style={styles.banner} accessibilityLabel="Advertisement">
      <BannerAd
        unitId={id}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: nonPersonalized }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', backgroundColor: '#000' },
});
