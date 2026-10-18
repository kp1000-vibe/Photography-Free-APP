import { FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraDevice, useCameraPermission, usePhotoOutput, type FlashMode } from 'react-native-vision-camera';
import { SkiaCamera, type SkiaCameraRef } from 'react-native-vision-camera-skia';
import { createSynchronizable } from 'react-native-worklets';
import {
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
const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];

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
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [flashOverlay, setFlashOverlay] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Push the selected filter to the frame thread.
  useEffect(() => {
    const params = resolveParams(getFilter(filterId), intensity);
    liveGrade.setBlocking(isNeutral(params) ? null : toSkslUniformArray(params, 0, 0).slice(2));
  }, [filterId, intensity]);

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
      adjustments: { brightness: 0, contrast: 0, saturation: 0, highlights: 0, shadows: 0, warmth: 0 },
      rotation: 0,
      crop: centeredCrop(3, 4, aspect === '3:4' ? null : aspectValue),
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
          <IconButton label="Exposure" onPress={() => setShowExposure((s) => !s)} active={showExposure || exposure !== 0}>
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
              onError={(e) => setCameraError(e.message)}
              onStarted={() => setCameraError(null)}
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
        {focusPoint && <View pointerEvents="none" style={[styles.focusRing, { left: focusPoint.x - 32, top: focusPoint.y - 32 }]} />}
        {flashOverlay && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shutterFlash]} />}
        {countdown > 0 && (
          <View pointerEvents="none" style={styles.center} accessibilityLiveRegion="assertive">
            <Text style={styles.countdown}>{countdown}</Text>
          </View>
        )}
        {cameraError && (
          <View style={[styles.center, styles.errorBox]}>
            <Text style={styles.body}>The camera stopped: {cameraError}</Text>
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
