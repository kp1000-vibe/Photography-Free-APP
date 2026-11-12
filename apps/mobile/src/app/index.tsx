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
import { Icon, type IconName } from '../components/Icon';
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
  { key: 'smooth', label: 'Smooth', icon: 'smooth' },
  { key: 'blemish', label: 'Blemish', icon: 'blemish' },
] as const;

type Panel = 'beauty' | 'filters';
const PANELS: { id: Panel; label: string }[] = [
  { id: 'beauty', label: 'Beauty' },
  { id: 'filters', label: 'Filters' },
];
const FLASH_ICON: Record<FlashMode, IconName> = { off: 'flashOff', on: 'flashOn', auto: 'flashAuto' };
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
  const [panel, setPanel] = useState<Panel>('filters');
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
        <TopButton
          icon={FLASH_ICON[flash]}
          label={`Flash ${flash}`}
          onPress={() => setFlash(FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length]!)}
          disabled={!device?.hasFlash}
          active={flash !== 'off'}
        />
        {device?.hasTorch && <TopButton icon="torch" label={torch ? 'Torch on' : 'Torch off'} onPress={() => setTorch((t) => !t)} active={torch} />}
        <TopButton
          icon="timer"
          label={`Timer ${timer === 0 ? 'off' : `${timer} seconds`}`}
          onPress={() => setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]!)}
          active={timer > 0}
          badge={timer > 0 ? `${timer}s` : undefined}
        />
        <Pressable
          onPress={() => setAspect(ASPECTS[(ASPECTS.findIndex((a) => a.id === aspect) + 1) % ASPECTS.length]!.id)}
          style={styles.topBtn}
          accessibilityRole="button"
          accessibilityLabel={`Aspect ratio ${aspect}`}
        >
          <View style={styles.aspectChip}>
            <Text style={styles.aspectText}>{aspect}</Text>
          </View>
        </Pressable>
        <TopButton icon="grid" label={grid ? 'Hide grid' : 'Show grid'} onPress={() => setGrid((g) => !g)} active={grid} />
        {exposureRange && (
          <TopButton icon="exposure" label="Exposure" onPress={() => setShowExposure((s) => !s)} active={showExposure || exposure !== 0} />
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
            <View style={styles.modeRow} accessibilityRole="tablist">
              {PANELS.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    setPanel(m.id);
                    setShowExposure(false);
                    Haptics.selectionAsync().catch(() => undefined);
                  }}
                  style={[styles.mode, panel === m.id && styles.modeActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: panel === m.id }}
                >
                  <Icon name={m.id} size={18} color={panel === m.id ? colors.accent : colors.textMuted} />
                  <Text style={[styles.modeText, panel === m.id && styles.modeTextActive]}>{m.label}</Text>
                  {m.id === 'beauty' && skinOn && <View style={styles.modeDot} />}
                </Pressable>
              ))}
            </View>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.sm }]}>
        <View style={styles.panel}>
          {showExposure && exposureRange ? (
            <View style={styles.sliderRow}>
              <Icon name="exposure" size={20} color={colors.textMuted} />
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
              <Text style={styles.sliderValue}>{exposure > 0 ? '+' : ''}{exposure.toFixed(1)}</Text>
            </View>
          ) : panel === 'beauty' ? (
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{SKIN.find((k) => k.key === skinKey)!.label}</Text>
              <View style={{ flex: 1 }}>
                <Slider
                  key={skinKey}
                  value={skin[skinKey]}
                  onChange={(v) => setSkin((prev) => ({ ...prev, [skinKey]: v }))}
                  accessibilityLabel={`${SKIN.find((k) => k.key === skinKey)!.label} skin retouching`}
                  formatValue={(v) => `${Math.round(v * 100)} percent`}
                />
              </View>
              <Text style={styles.sliderValue}>{Math.round(skin[skinKey] * 100)}</Text>
            </View>
          ) : filterId !== 'original' ? (
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{getFilter(filterId).name}</Text>
              <View style={{ flex: 1 }}>
                <Slider value={intensity} onChange={setIntensity} accessibilityLabel={`${getFilter(filterId).name} intensity`} formatValue={(v) => `${Math.round(v * 100)} percent`} />
              </View>
              <Text style={styles.sliderValue}>{Math.round(intensity * 100)}</Text>
            </View>
          ) : (
            <View style={styles.sliderRow} />
          )}

          {panel === 'beauty' ? (
            <View style={styles.toolRow}>
              {SKIN.map((k) => {
                const selected = skinKey === k.key;
                const on = skin[k.key] > 0;
                return (
                  <Pressable
                    key={k.key}
                    onPress={() => {
                      setSkinKey(k.key);
                      setShowExposure(false);
                      Haptics.selectionAsync().catch(() => undefined);
                    }}
                    style={styles.tool}
                    accessibilityRole="button"
                    accessibilityLabel={`${k.label}, ${Math.round(skin[k.key] * 100)} percent`}
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.toolCircle, selected && styles.toolCircleSelected]}>
                      <Icon name={k.icon} size={26} color={selected || on ? colors.accent : colors.text} />
                    </View>
                    <Text style={[styles.toolLabel, (selected || on) && styles.toolLabelActive]}>{k.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setSkin({ smooth: 0, blemish: 0 })}
                disabled={!skinOn}
                style={[styles.tool, !skinOn && styles.toolDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Turn off skin retouching"
              >
                <View style={styles.toolCircle}>
                  <Icon name="reset" size={24} />
                </View>
                <Text style={styles.toolLabel}>Off</Text>
              </Pressable>
            </View>
          ) : (
            <FilterTray
              selectedId={filterId}
              onSelect={(id) => {
                setFilterId(id);
                setIntensity(getFilter(id).defaultIntensity);
                setShowExposure(false);
                Haptics.selectionAsync().catch(() => undefined);
              }}
            />
          )}
        </View>

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
              <Icon name="gallery" size={24} color={colors.textMuted} />
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
          <Pressable
            onPress={flipCamera}
            style={({ pressed }) => [styles.flip, pressed && styles.shutterPressed]}
            accessibilityRole="button"
            accessibilityLabel={position === 'back' ? 'Switch to front camera' : 'Switch to back camera'}
          >
            <Icon name="flip" size={26} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TopButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed, disabled && styles.toolDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
    >
      <Icon name={icon} size={24} color={active ? colors.accent : colors.text} />
      {badge && <Text style={styles.topBadge}>{badge}</Text>}
    </Pressable>
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
  topBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  topBtnPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  topBadge: { position: 'absolute', bottom: 2, fontSize: 10, fontWeight: '700', color: colors.accent },
  aspectChip: { borderWidth: 1.6, borderColor: colors.text, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  aspectText: { fontSize: 12, fontWeight: '700', color: colors.text },
  panel: { justifyContent: 'flex-end', gap: space.sm },
  sliderValue: { ...type.caption, color: colors.text, width: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  toolRow: { flexDirection: 'row', justifyContent: 'center', gap: space.xxl, paddingHorizontal: space.lg, height: 84 },
  tool: { alignItems: 'center', gap: 6 },
  toolDisabled: { opacity: 0.35 },
  toolCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  toolCircleSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  toolLabel: { ...type.caption, color: colors.textMuted },
  toolLabelActive: { color: colors.text },
  modeRow: { flexDirection: 'row', backgroundColor: colors.scrim, borderRadius: radius.pill, padding: 3, gap: 2 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: space.lg, borderRadius: radius.pill },
  modeActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  modeText: { ...type.label, color: colors.textMuted, letterSpacing: 0.3 },
  modeTextActive: { color: colors.accent },
  modeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  controls: { flex: 1, justifyContent: 'flex-end', gap: space.sm },
  sliderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md, minHeight: 44 },
  sliderLabel: { ...type.caption, color: colors.textMuted, width: 64 },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, marginTop: space.sm },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.text },
  flip: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
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
