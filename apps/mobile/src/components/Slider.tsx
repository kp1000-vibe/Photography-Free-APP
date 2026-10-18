import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { colors } from '../theme';

interface Props {
  value: number;
  min?: number;
  max?: number;
  /** Value that the track is filled from (0 for bipolar sliders, min otherwise). */
  origin?: number;
  step?: number;
  onChange: (value: number) => void;
  /** Called once when the user lifts their finger — record undo history here. */
  onCommit?: (value: number) => void;
  accessibilityLabel: string;
  formatValue?: (value: number) => string;
}

const THUMB = 22;

export function Slider({
  value,
  min = 0,
  max = 1,
  origin = min,
  step = 0.05,
  onChange,
  onCommit,
  accessibilityLabel,
  formatValue = (v) => `${Math.round(v * 100)}`,
}: Props) {
  const [width, setWidth] = useState(0);
  // Last value emitted during the current drag, read when the finger lifts.
  const dragValue = useRef(value);

  const valueAt = (x: number) => {
    const t = Math.min(1, Math.max(0, (x - THUMB / 2) / Math.max(1, width - THUMB)));
    return min + t * (max - min);
  };
  const track = (e: GestureResponderEvent) => {
    const v = valueAt(e.nativeEvent.locationX);
    dragValue.current = v;
    onChange(v);
  };
  const release = () => onCommit?.(dragValue.current);

  const toX = (v: number) => ((v - min) / (max - min)) * Math.max(0, width - THUMB) + THUMB / 2;
  const x = toX(value);
  const ox = toX(origin);

  const nudge = (dir: 1 | -1) => {
    const v = Math.min(max, Math.max(min, value + dir * step));
    onChange(v);
    onCommit?.(v);
  };

  return (
    <View
      style={styles.root}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: formatValue(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={track}
      onResponderMove={track}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      <View style={styles.track} pointerEvents="none" />
      <View pointerEvents="none" style={[styles.fill, { left: Math.min(x, ox), width: Math.abs(x - ox) }]} />
      {origin !== min && <View pointerEvents="none" style={[styles.originTick, { left: ox - 1 }]} />}
      <View pointerEvents="none" style={[styles.thumb, { left: x - THUMB / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 44, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fill: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: colors.accent },
  originTick: { position: 'absolute', width: 2, height: 10, backgroundColor: colors.textMuted },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
