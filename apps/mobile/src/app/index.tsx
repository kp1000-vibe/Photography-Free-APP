import { FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraDevice, useCameraPermission, usePhotoOutput, type FlashMode, type TargetVideoPixelFormat } from 'react-native-vision-camera';
import { SkiaCamera, type SkiaCameraRef } from 'react-native-vision-camera-skia';
import { createSynchronizable } from 'react-native-worklets';
import {
  NO_ADJUSTMENTS,
  NO_BACKGROUND,
  centeredCrop,
  getFilter,
  isNeutral,
  resolveParams,
  toSkslUniformArray,
  type EditState,
} from '@lumen/core';
import { FilterTray } from '../components/FilterTray';
import { IconButton } from '../components/IconButton';
import { Slider } from '../components/Slider';
import { renderEdit, saveToPhotos } from '../lib/export';
import { addPhoto, toFileUri, updatePhoto, useLibrary } from '../lib/library';
import { gradeEffect } from '../lib/skiaGrade';
import { colors, radius, space, type } from '../theme';

/** Shared with the camera frame thread: grading uniforms (without size), or null for no filter. */
const liveGrade = createSynchronizable<number[] | null>(null);
const framePaint = Skia.Paint();

const ASPECTS = [
  { id: '3:4', value: 3 / 4 },
  { id: '1:1', value: 1 },
  { id: '4:5', value: 4 / 5 },
] as const;
type AspectId = (typeof ASPECTS)[number]['id'];

const TIMERS = [0, 3, 10] as const;

/**
 * Frame formats to try for the live preview, fastest first. Android's
 * zero-copy GPU format ('native') is not supported for frame analysis on
 * every phone; when the camera refuses it we fall back to YUV, then RGB.
 */
const PIXEL_FORMATS: readonly TargetVideoPixelFormat[] = Platform.OS === 'android' ? ['native', 'yuv', 'rgb'] : ['yuv'];
const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];

/** Opt-in skin retouching; both start at 0 and nothing is applied until the user asks. */
const SKIN = [
  { key: 'smooth', label: 'Smooth' },
  { key: 'blemish', label: 'Blemish' },
] as const;
type SkinKey = (typeof SKIN)[number]['key'];

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const permission = useCameraPermission();
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(position);
  const camera = useRef<SkiaCameraRef>(null);
  const { items } = useLibrary();

  const [countdown, setCountdown] = useState(0);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    countdownTimer.current = null;
    setCountdown(0);
  }, []);

  // Pause the camera (and any running timer) when the screen or app is in the background.
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        cancelCountdown();
      };
    }, [cancelCountdown]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
      if (s !== 'active') cancelCountdown();
    });
    return () => sub.remove();
  }, [cancelCountdown]);

  const [filterId, setFilterId] = useState('natural');
  const [intensity, setIntensity] = useState(getFilter('natural').defaultIntensity);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [torch, setTorch] = useState(false);
  const [grid, setGrid] = useState(false);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [aspect, setAspect] = useState<AspectId>('3:4');
  const [zoom, setZoom] = useState(1);
  const [exposure, setExposure] = useState(0);
  const [showExposure, setShowExposure] = useState(false);
  const [skin, setSkin] = useState<Record<SkinKey, number>>({ smooth: 0, blemish: 0 });
  const [skinKey, setSkinKey] = useState<SkinKey>('smooth');
  const [showSkin, setShowSkin] = useState(false);
  const skinOn = skin.smooth > 0 || skin.blemish > 0;
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [flashOverlay, setFlashOverlay] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const pixelFormat = PIXEL_FORMATS[formatIndex]!;
  // Whether the camera has started at least once with the current format.
  const startedWithFormat = useRef(false);
  const onCameraError = useCallback(
    (e: { message: string }) => {
      if (!startedWithFormat.current && formatIndex < PIXEL_FORMATS.length - 1) {
        // This phone rejected the frame format: try the next one quietly.
        setFormatIndex((i) => Math.min(i + 1, PIXEL_FORMATS.length - 1));
        return;
      }
      setCameraError(e.message);
    },
    [formatIndex],
  );
  useEffect(() => {
    startedWithFormat.current = false;
  }, [formatIndex]);

  // Push the selected filter and skin retouching to the frame thread.
  useEffect(() => {
    const params = resolveParams(getFilter(filterId), intensity, { ...NO_ADJUSTMENTS, smooth: skin.smooth, blemish: skin.blemish });
    liveGrade.setBlocking(isNeutral(params) ? null : toSkslUniformArray(params, 0, 0).slice(2));
  }, [filterId, intensity, skin]);

  const photoOutput = usePhotoOutput({ qualityPrioritization: 'balanced' });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  const previewHeight = Math.round((width * 4) / 3);
  const aspectValue = ASPECTS.find((a) => a.id === aspect)!.value;
  const visibleHeight = Math.min(previewHeight, Math.round(width / aspectValue));
  const maskHeight = (previewHeight - visibleHeight) / 2;

  const zoomStops = useMemo(() => {
    if (!device) return [1];
    return [1, 2, 3].filter((z) => z >= device.minZoom && z <= device.maxZoom);
  }, [device]);
  const exposureRange = device?.supportsExposureBias
    ? { min: Math.max(-2, device.minExposureBias), max: Math.min(2, device.maxExposureBias) }
    : null;

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((n) => (n === message ? null : n)), 3000);
  };

  const flipCamera = () => {
    setPosition((p) => (p === 'back' ? 'front' : 'back'));
    setZoom(1);
    setTorch(false);
    setExposure(0);
  };

  const onTapPreview = async (x: number, y: number) => {
    setFocusPoint({ x, y });
    setTimeout(() => setFocusPoint(null), 900);
    try {
      await camera.current?.focusTo({ x, y });
    } catch {
      // Device may not support focus metering; the ring still gives feedback.
    }
  };

  const capture = async () => {
    const edit: EditState = {
      filterId,
      intensity,
      adjustments: { ...NO_ADJUSTMENTS, smooth: skin.smooth, blemish: skin.blemish },
      rotation: 0,
      crop: centeredCrop(3, 4, aspect === '3:4' ? null : aspectValue),
      background: { ...NO_BACKGROUND },
    };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setFlashOverlay(true);
    setTimeout(() => setFlashOverlay(false), 120);

    let file: { filePath: string };
    try {
      file = await photoOutput.capturePhotoToFile({ flashMode: device?.hasFlash ? flash : 'off', enableShutterSound: true }, {});
    } catch {
      showNotice('Couldn’t take the photo. Try again.');
      return;
    }

    // Processing happens in the background so the shutter is immediately ready again.
    setPending((n) => n + 1);
    try {
      const item = await addPhoto(toFileUri(file.filePath), edit);
      const rendered = await renderEdit(item.originalUri, edit, 'full');
      await updatePhoto(item.id, { exportedUri: rendered.uri });
      const result = await saveToPhotos(rendered.uri);
      if (!result.saved) {
        showNotice(result.reason === 'permission' ? 'Saved in Lumen. Allow Photos access to save to your library.' : 'Saved in Lumen, but not to Photos.');
      }
    } catch {
      showNotice('Photo kept in Lumen, but the filter couldn’t be applied.');
    } finally {
      setPending((n) => n - 1);
    }
  };


  const onShutter = () => {
    if (countdownTimer.current) {
      cancelCountdown();
      return;
    }
    if (timer === 0) {
      capture();
      return;
    }
    let left: number = timer;
    setCountdown(left);
    countdownTimer.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
        return;
      }
      cancelCountdown();
      capture();
    }, 1000);
  };

  if (!permission.hasPermission) {
    return <PermissionGate status={permission.status} onRequest={permission.requestPermission} />;
  }

  const lastPhoto = items[0];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <IconButton
          label={`Flash ${flash}`}
          onPress={() => setFlash(FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length]!)}
          disabled={!device?.hasFlash}
          active={flash !== 'off'}
        >
          {flash === 'off' ? 'Flash off' : flash === 'auto' ? 'Flash auto' : 'Flash on'}
        </IconButton>
        {device?.hasTorch && (
          <IconButton label={torch ? 'Torch on' : 'Torch off'} onPress={() => setTorch((t) => !t)} active={torch}>
            Torch
          </IconButton>
        )}
        <IconButton label={`Timer ${timer === 0 ? 'off' : `${timer} seconds`}`} onPress={() => setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]!)} active={timer > 0}>
          {timer === 0 ? 'Timer' : `${timer}s`}
        </IconButton>
        <IconButton label={`Aspect ratio ${aspect}`} onPress={() => setAspect(ASPECTS[(ASPECTS.findIndex((a) => a.id === aspect) + 1) % ASPECTS.length]!.id)}>
          {aspect}
        </IconButton>
        <IconButton label={grid ? 'Hide grid' : 'Show grid'} onPress={() => setGrid((g) => !g)} active={grid}>
          Grid
        </IconButton>
        {exposureRange && (
          <IconButton
            label="Exposure"
            onPress={() => {
              setShowExposure((s) => !s);
              setShowSkin(false);
            }}
            active={showExposure || exposure !== 0}
          >
            ±EV
          </IconButton>
        )}
      </View>

      <View style={{ width, height: previewHeight }}>
        {device ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => onTapPreview(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            accessibilityLabel="Camera preview. Tap to focus."
          >
            <SkiaCamera
              ref={camera}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={focused && appActive}
              outputs={outputs}
              zoom={zoom}
              exposure={exposureRange ? exposure : undefined}
              torchMode={torch ? 'on' : 'off'}
              enablePreviewSizedOutputBuffers
              key={pixelFormat}
              pixelFormat={pixelFormat}
              onError={onCameraError}
              onStarted={() => {
                startedWithFormat.current = true;
                setCameraError(null);
              }}
              onFrame={(frame, render) => {
                'worklet';
                render(({ canvas, frameTexture }) => {
                  const grade = liveGrade.getDirty();
                  if (grade === null) {
                    canvas.drawImage(frameTexture, 0, 0);
                    return;
                  }
                  const source = frameTexture.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
                  const uniforms = [frameTexture.width(), frameTexture.height()].concat(grade);
                  framePaint.setShader(gradeEffect.makeShaderWithChildren(uniforms, [source]));
                  canvas.drawImage(frameTexture, 0, 0, framePaint);
                });
                frame.dispose();
              }}
            />
          </Pressable>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.muted}>Starting camera…</Text>
          </View>
        )}

        {maskHeight > 0 && (
          <>
            <View pointerEvents="none" style={[styles.mask, { top: 0, height: maskHeight }]} />
            <View pointerEvents="none" style={[styles.mask, { bottom: 0, height: maskHeight }]} />
          </>
        )}
        {grid && (
          <View pointerEvents="none" style={[styles.grid, { top: maskHeight, height: visibleHeight }]}>
            <View style={[styles.gridLineV, { left: '33.33%' }]} />
            <View style={[styles.gridLineV, { left: '66.66%' }]} />
            <View style={[styles.gridLineH, { top: '33.33%' }]} />
            <View style={[styles.gridLineH, { top: '66.66%' }]} />
          </View>
        )}
        <Pressable
          style={[styles.skinToggle, { top: maskHeight + space.md }]}
          onPress={() => {
            setShowSkin((s) => !s);
            setShowExposure(false);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Skin retouching, ${skinOn ? 'on' : 'off'}`}
          accessibilityState={{ expanded: showSkin }}
        >
          <Text style={[styles.pillText, (showSkin || skinOn) && styles.zoomTextActive]}>Skin</Text>
        </Pressable>
        {focusPoint && <View pointerEvents="none" style={[styles.focusRing, { left: focusPoint.x - 32, top: focusPoint.y - 32 }]} />}
        {flashOverlay && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shutterFlash]} />}
        {countdown > 0 && (
          <View pointerEvents="none" style={styles.center} accessibilityLiveRegion="assertive">
            <Text style={styles.countdown}>{countdown}</Text>
          </View>
        )}
        {cameraError && (
          <View style={[styles.center, styles.errorBox]}>
            <Text style={styles.body}>The camera couldn’t start on this phone.</Text>
            <Text style={styles.muted} numberOfLines={3}>
              {cameraError.split('\n')[0]}
            </Text>
            <Pressable
              style={styles.secondary}
              onPress={() => {
                setCameraError(null);
                setFormatIndex(0);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.previewFooter} pointerEvents="box-none">
          {pending > 0 && (
            <View style={styles.pill} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.pillText}>Saving…</Text>
            </View>
          )}
          {notice && (
            <View style={styles.pill} accessibilityLiveRegion="polite">
              <Text style={styles.pillText}>{notice}</Text>
            </View>
          )}
          {zoomStops.length > 1 && (
            <View style={styles.zoomRow}>
              {zoomStops.map((z) => (
                <Pressable
                  key={z}
                  onPress={() => setZoom(z)}
                  style={[styles.zoomChip, zoom === z && styles.zoomChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Zoom ${z}x`}
                  accessibilityState={{ selected: zoom === z }}
                >
                  <Text style={[styles.zoomText, zoom === z && styles.zoomTextActive]}>{z}×</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.sm }]}>
        {showExposure && exposureRange ? (
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>EV</Text>
            <View style={{ flex: 1 }}>
              <Slider
                value={exposure}
                min={exposureRange.min}
                max={exposureRange.max}
                origin={0}
                step={0.1}
                onChange={setExposure}
                accessibilityLabel="Exposure compensation"
                formatValue={(v) => `${v.toFixed(1)} EV`}
              />
            </View>
          </View>
        ) : showSkin ? (
          <View style={styles.sliderRow}>
            {SKIN.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setSkinKey(s.key)}
                style={[styles.skinChip, skinKey === s.key && styles.skinChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}, ${Math.round(skin[s.key] * 100)} percent`}
                accessibilityState={{ selected: skinKey === s.key }}
              >
                <Text style={[styles.pillText, skinKey !== s.key && styles.skinChipTextIdle]}>
                  {s.label}
                  {skin[s.key] > 0 ? ' •' : ''}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }}>
              <Slider
                key={skinKey}
                value={skin[skinKey]}
                onChange={(v) => setSkin((prev) => ({ ...prev, [skinKey]: v }))}
                accessibilityLabel={`${SKIN.find((s) => s.key === skinKey)!.label} skin retouching`}
                formatValue={(v) => `${Math.round(v * 100)} percent`}
              />
            </View>
          </View>
        ) : filterId !== 'original' ? (
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>{getFilter(filterId).name}</Text>
            <View style={{ flex: 1 }}>
              <Slider value={intensity} onChange={setIntensity} accessibilityLabel={`${getFilter(filterId).name} intensity`} formatValue={(v) => `${Math.round(v * 100)} percent`} />
            </View>
          </View>
        ) : (
          <View style={styles.sliderRow} />
        )}

        <FilterTray
          selectedId={filterId}
          onSelect={(id) => {
            setFilterId(id);
            setIntensity(getFilter(id).defaultIntensity);
            Haptics.selectionAsync().catch(() => undefined);
          }}
        />

        <View style={styles.shutterRow}>
          <Pressable
            style={styles.thumb}
            onPress={() => router.push('/gallery')}
            accessibilityRole="button"
            accessibilityLabel="Open gallery"
          >
            {lastPhoto ? (
              <Image source={{ uri: lastPhoto.exportedUri ?? lastPhoto.originalUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={styles.thumbText}>Gallery</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onShutter}
            disabled={!device}
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
            accessibilityRole="button"
            accessibilityLabel={countdown > 0 ? 'Cancel timer' : timer > 0 ? `Take photo in ${timer} seconds` : 'Take photo'}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <IconButton label={position === 'back' ? 'Switch to front camera' : 'Switch to back camera'} onPress={flipCamera} style={styles.flip}>
            Flip
          </IconButton>
        </View>
      </View>
    </View>
  );
}

function PermissionGate({ status, onRequest }: { status: string; onRequest: () => Promise<boolean> }) {
  const insets = useSafeAreaInsets();
  const blocked = status === 'denied' || status === 'restricted';
  return (
    <View style={[styles.root, styles.gate, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <StatusBar style="light" />
      <Text style={styles.brand}>Lumen</Text>
      <Text style={styles.title}>Natural filters, live in the viewfinder.</Text>
      <Text style={styles.body}>
        Lumen needs the camera to show the live preview and take photos. Your photos are processed on this phone and never uploaded.
      </Text>
      {blocked ? (
        <>
          <Text style={styles.muted}>
            Camera access is turned off. {status === 'restricted' ? 'It may be limited by device restrictions.' : 'You can turn it on in Settings.'}
          </Text>
          <Pressable style={styles.primary} onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={styles.primaryText}>Open Settings</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.primary} onPress={onRequest} accessibilityRole="button">
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      )}
      <Pressable style={styles.secondary} onPress={() => router.push('/gallery')} accessibilityRole="button">
        <Text style={styles.secondaryText}>Edit a photo from your library instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: space.sm },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  mask: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.overlay },
  grid: { position: 'absolute', left: 0, right: 0 },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.5)' },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.5)' },
  focusRing: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: colors.accent },
  shutterFlash: { backgroundColor: '#000', opacity: 0.6 },
  countdown: { fontSize: 96, fontWeight: '200', color: colors.text },
  errorBox: { backgroundColor: colors.scrim, padding: space.xl },
  previewFooter: { position: 'absolute', left: 0, right: 0, bottom: space.md, alignItems: 'center', gap: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.scrim, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, maxWidth: '90%' },
  pillText: { ...type.caption, color: colors.text },
  zoomRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.scrim, borderRadius: radius.pill, padding: 4 },
  zoomChip: { minWidth: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  zoomChipActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  zoomText: { ...type.caption, color: colors.text },
  zoomTextActive: { color: colors.accent },
  skinToggle: { position: 'absolute', right: space.md, minWidth: 48, height: 44, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  skinChip: { height: 40, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  skinChipActive: { backgroundColor: colors.surfaceRaised },
  skinChipTextIdle: { color: colors.textMuted },
  controls: { flex: 1, justifyContent: 'flex-end', gap: space.sm },
  sliderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md, minHeight: 44 },
  sliderLabel: { ...type.caption, color: colors.textMuted, width: 64 },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, marginTop: space.sm },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  thumbText: { ...type.caption, color: colors.textMuted, fontSize: 10 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.text },
  flip: { width: 52 },
  gate: { paddingHorizontal: space.xl, gap: space.lg, justifyContent: 'center' },
  brand: { ...type.label, color: colors.accent, letterSpacing: 2, textTransform: 'uppercase' },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text },
  muted: { ...type.body, color: colors.textMuted },
  primary: { backgroundColor: colors.accent, borderRadius: radius.pill, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  primaryText: { ...type.label, color: colors.accentText },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...type.label, color: colors.text },
});
