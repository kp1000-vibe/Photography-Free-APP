import { Canvas, Fill, Group, ImageShader, Rect, Shader, useImage } from '@shopify/react-native-skia';
import { ImageManipulator } from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  EXPORT_QUALITY,
  NEUTRAL,
  canRedo,
  canUndo,
  centeredCrop,
  createHistory,
  editParams,
  getFilter,
  push,
  redo,
  rotateClockwise,
  sameEdit,
  toUniforms,
  undo,
  type Adjustments,
  type EditState,
  type ExportQuality,
  type History,
} from '@lumen/core';
import { FilterTray } from '../../components/FilterTray';
import { IconButton } from '../../components/IconButton';
import { Slider } from '../../components/Slider';
import { useAds } from '../../lib/ads';
import { renderEdit, renderGeometry, saveToPhotos } from '../../lib/export';
import { getPhoto, removePhoto, updatePhoto, useLibrary, type LibraryItem } from '../../lib/library';
import { gradeEffect } from '../../lib/skiaGrade';
import { colors, radius, space, type } from '../../theme';

type Tab = 'filters' | 'adjust' | 'crop';

const ADJUSTMENTS: { key: keyof Adjustments; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'warmth', label: 'Warmth' },
];

const CROPS: { id: string; label: string; aspect: number | null }[] = [
  { id: 'original', label: 'Original', aspect: null },
  { id: '1:1', label: '1:1', aspect: 1 },
  { id: '4:5', label: '4:5', aspect: 4 / 5 },
  { id: '3:4', label: '3:4', aspect: 3 / 4 },
  { id: '16:9', label: '16:9', aspect: 16 / 9 },
  { id: '9:16', label: '9:16', aspect: 9 / 16 },
];

const PREVIEW_LONG_EDGE = 1600;

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loaded } = useLibrary();
  const item = getPhoto(id);

  if (loaded && !item) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.body}>This photo is no longer available.</Text>
        <IconButton label="Go back" onPress={() => router.back()}>
          Go back
        </IconButton>
      </View>
    );
  }
  if (!item) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }
  return <Editor key={item.id} item={item} />;
}

function Editor({ item }: { item: LibraryItem }) {
  const insets = useSafeAreaInsets();
  const ads = useAds();
  const originalUri = item.originalUri;

  const [history, setHistory] = useState<History<EditState>>(() => createHistory(item.edit));
  const [draft, setDraft] = useState<EditState | null>(null);
  const [savedEdit, setSavedEdit] = useState<EditState>(item.edit);
  const [tab, setTab] = useState<Tab>('filters');
  const [adjustKey, setAdjustKey] = useState<keyof Adjustments>('brightness');
  const [comparing, setComparing] = useState(false);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [quality, setQuality] = useState<ExportQuality>('full');
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });

  const current = draft ?? history.present;

  // Upright size of the original, for aspect-ratio crops.
  useEffect(() => {
    ImageManipulator.manipulate(originalUri)
      .renderAsync()
      .then((img) => setBaseSize({ width: img.width, height: img.height }))
      .catch(() => setMessage('Couldn’t open this photo.'));
  }, [originalUri]);

  // Geometry (rotate/crop) is applied to a preview-sized copy of the original; colour is applied live on the GPU.
  const geometryKey = JSON.stringify({ rotation: current.rotation, crop: current.crop });
  useEffect(() => {
    let cancelled = false;
    renderGeometry(originalUri, JSON.parse(geometryKey), PREVIEW_LONG_EDGE)
      .then((r) => !cancelled && setPreviewUri(r.uri))
      .catch(() => !cancelled && setMessage('Couldn’t open this photo.'));
    return () => {
      cancelled = true;
    };
  }, [originalUri, geometryKey]);

  const image = useImage(previewUri ?? undefined);

  const dirty = !sameEdit(current, savedEdit);

  const leave = useCallback(() => {
    if (busy) return true;
    if (!dirty) {
      router.back();
      return true;
    }
    Alert.alert('Discard edits?', 'Your changes to this photo haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
    return true;
  }, [dirty, busy]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', leave);
    return () => sub.remove();
  }, [leave]);

  const uniforms = useMemo(() => {
    if (!image) return null;
    const p = comparing ? NEUTRAL : editParams(current);
    return { u_size: [image.width(), image.height()], ...toUniforms(p) };
  }, [current, comparing, image]);

  const fitted = useMemo(() => {
    if (!image || canvas.width === 0) return null;
    const s = Math.min(canvas.width / image.width(), canvas.height / image.height());
    const width = image.width() * s;
    const height = image.height() * s;
    return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height, scale: s };
  }, [image, canvas]);

  /** Live change while dragging; committed to history on release. */
  const preview = (next: EditState) => setDraft(next);
  const commit = (next: EditState) => {
    setDraft(null);
    setHistory((h) => push(h, next, sameEdit));
  };

  const rotatedSize = baseSize && (current.rotation % 180 === 0 ? baseSize : { width: baseSize.height, height: baseSize.width });
  const activeCrop = rotatedSize
    ? CROPS.find((c) => JSON.stringify(centeredCrop(rotatedSize.width, rotatedSize.height, c.aspect)) === JSON.stringify(current.crop))?.id
    : undefined;

  const doExport = async (mode: 'save' | 'share') => {
    setBusy(mode);
    setMessage(null);
    try {
      const rendered = await renderEdit(item.originalUri, current, mode === 'share' ? 'share' : quality);
      if (mode === 'save') {
        const result = await saveToPhotos(rendered.uri);
        await updatePhoto(item.id, { edit: current, exportedUri: rendered.uri });
        setSavedEdit(current);
        setMessage(
          result.saved
            ? 'Saved to Photos'
            : result.reason === 'permission'
              ? 'Saved in Lumen. Allow Photos access in Settings to save to your library.'
              : 'Saved in Lumen, but not to Photos.',
        );
      } else {
        if (!(await Sharing.isAvailableAsync())) {
          setMessage('Sharing isn’t available on this device.');
          return;
        }
        await Sharing.shareAsync(rendered.uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
      }
      // The edit is safely written before any ad can appear.
      ads.onExportComplete();
    } catch (e) {
      setMessage(e instanceof Error && /memory/i.test(e.message) ? 'Not enough memory. Try the High or Share quality.' : 'Couldn’t export this photo. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = () =>
    Alert.alert('Remove from Lumen?', 'This removes the photo and its edits from Lumen. Copies already saved to your photo library are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removePhoto(item.id);
          router.back();
        },
      },
    ]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label="Close editor" onPress={leave}>
          Close
        </IconButton>
        <View style={styles.headerGroup}>
          <IconButton label="Undo" onPress={() => setHistory(undo(history))} disabled={!canUndo(history) || !!busy}>
            Undo
          </IconButton>
          <IconButton label="Redo" onPress={() => setHistory(redo(history))} disabled={!canRedo(history) || !!busy}>
            Redo
          </IconButton>
        </View>
        <IconButton label="Remove photo from Lumen" onPress={confirmRemove} disabled={!!busy}>
          Remove
        </IconButton>
      </View>

      <Pressable
        style={styles.preview}
        onLayout={(e: LayoutChangeEvent) => setCanvas({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        onPressIn={() => setComparing(true)}
        onPressOut={() => setComparing(false)}
        accessibilityLabel="Photo preview. Press and hold to compare with the original."
        accessibilityHint="Shows the unedited photo while held"
      >
        {image && uniforms && fitted ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Fill color={colors.bg} />
            <Group transform={[{ translateX: fitted.x }, { translateY: fitted.y }, { scale: fitted.scale }]}>
              <Rect x={0} y={0} width={image.width()} height={image.height()}>
                <Shader source={gradeEffect} uniforms={uniforms}>
                  <ImageShader image={image} fit="fill" rect={{ x: 0, y: 0, width: image.width(), height: image.height() }} />
                </Shader>
              </Rect>
            </Group>
          </Canvas>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.text} />
          </View>
        )}
        {comparing && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>Original</Text>
          </View>
        )}
      </Pressable>

      {message && (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}

      <View style={styles.panel}>
        {tab === 'filters' && (
          <View style={styles.panelBody}>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{getFilter(current.filterId).name}</Text>
              <View style={{ flex: 1 }}>
                {current.filterId !== 'original' && (
                  <Slider
                    value={current.intensity}
                    onChange={(v) => preview({ ...current, intensity: v })}
                    onCommit={(v) => commit({ ...current, intensity: v })}
                    accessibilityLabel="Filter intensity"
                    formatValue={(v) => `${Math.round(v * 100)} percent`}
                  />
                )}
              </View>
            </View>
            <FilterTray
              image={image}
              selectedId={current.filterId}
              onSelect={(filterId) => commit({ ...current, filterId, intensity: getFilter(filterId).defaultIntensity })}
            />
          </View>
        )}

        {tab === 'adjust' && (
          <View style={styles.panelBody}>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{ADJUSTMENTS.find((a) => a.key === adjustKey)!.label}</Text>
              <View style={{ flex: 1 }}>
                <Slider
                  value={current.adjustments[adjustKey]}
                  min={-1}
                  max={1}
                  origin={0}
                  onChange={(v) => preview({ ...current, adjustments: { ...current.adjustments, [adjustKey]: v } })}
                  onCommit={(v) => commit({ ...current, adjustments: { ...current.adjustments, [adjustKey]: v } })}
                  accessibilityLabel={ADJUSTMENTS.find((a) => a.key === adjustKey)!.label}
                  formatValue={(v) => `${Math.round(v * 100)}`}
                />
              </View>
            </View>
            <View style={styles.chips}>
              {ADJUSTMENTS.map((a) => {
                const changed = Math.abs(current.adjustments[a.key]) > 0.005;
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => setAdjustKey(a.key)}
                    style={[styles.chip, adjustKey === a.key && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: adjustKey === a.key }}
                  >
                    <Text style={[styles.chipText, adjustKey === a.key && styles.chipTextActive]}>
                      {a.label}
                      {changed ? ' •' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {tab === 'crop' && (
          <View style={styles.panelBody}>
            <View style={styles.chips}>
              {CROPS.map((c) => (
                <Pressable
                  key={c.id}
                  disabled={!rotatedSize}
                  onPress={() => rotatedSize && commit({ ...current, crop: centeredCrop(rotatedSize.width, rotatedSize.height, c.aspect) })}
                  style={[styles.chip, activeCrop === c.id && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Crop ${c.label}`}
                  accessibilityState={{ selected: activeCrop === c.id }}
                >
                  <Text style={[styles.chipText, activeCrop === c.id && styles.chipTextActive]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.rotate}
              onPress={() => {
                const r = rotateClockwise(current.rotation);
                // Re-centre the chosen aspect on the newly rotated image.
                const aspect = CROPS.find((c) => c.id === activeCrop)?.aspect ?? null;
                const size = baseSize && (r % 180 === 0 ? baseSize : { width: baseSize.height, height: baseSize.width });
                commit({ ...current, rotation: r, crop: size ? centeredCrop(size.width, size.height, aspect) : current.crop });
              }}
              accessibilityRole="button"
              accessibilityLabel="Rotate 90 degrees clockwise"
            >
              <Text style={styles.chipText}>Rotate 90°</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['filters', 'adjust', 'crop'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'filters' ? 'Filters' : t === 'adjust' ? 'Adjust' : 'Crop'}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.exportRow, { paddingBottom: insets.bottom + space.sm }]}>
          <View style={styles.quality} accessibilityRole="radiogroup" accessibilityLabel="Export quality">
            {(Object.keys(EXPORT_QUALITY) as ExportQuality[]).map((q) => (
              <Pressable
                key={q}
                onPress={() => setQuality(q)}
                style={[styles.qualityItem, quality === q && styles.qualityItemActive]}
                accessibilityRole="radio"
                accessibilityState={{ checked: quality === q }}
              >
                <Text style={[styles.qualityText, quality === q && styles.qualityTextActive]}>{EXPORT_QUALITY[q].label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.secondaryBtn} onPress={() => doExport('share')} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Share photo">
            {busy === 'share' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>Share</Text>}
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={() => doExport('save')} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Save a copy to Photos">
            {busy === 'save' ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryText}>Save</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  headerGroup: { flexDirection: 'row' },
  preview: { flex: 1, margin: space.sm, borderRadius: radius.md, overflow: 'hidden' },
  badge: { position: 'absolute', top: space.md, alignSelf: 'center', backgroundColor: colors.scrim, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
  badgeText: { ...type.caption, color: colors.text },
  message: { ...type.caption, color: colors.text, textAlign: 'center', paddingHorizontal: space.lg },
  body: { ...type.body, color: colors.text },
  panel: { gap: space.sm },
  panelBody: { gap: space.sm, minHeight: 130, justifyContent: 'flex-end' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md, minHeight: 44 },
  sliderLabel: { ...type.caption, color: colors.textMuted, width: 80 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg },
  chip: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.accent },
  chipText: { ...type.caption, color: colors.textMuted },
  chipTextActive: { color: colors.text },
  rotate: { alignSelf: 'flex-start', marginLeft: space.lg, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  tabs: { flexDirection: 'row', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextActive: { color: colors.text },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  quality: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3 },
  qualityItem: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  qualityItemActive: { backgroundColor: colors.surfaceRaised },
  qualityText: { ...type.caption, color: colors.textMuted },
  qualityTextActive: { color: colors.text },
  secondaryBtn: { height: 46, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', minWidth: 76 },
  secondaryText: { ...type.label, color: colors.text },
  primaryBtn: { height: 46, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', minWidth: 76 },
  primaryText: { ...type.label, color: colors.accentText },
});
