import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme';

/**
 * Lumen's line icons, drawn on a 24 x 24 grid with Skia so the app ships no
 * icon font or extra native library. All are original artwork.
 */
const PATHS = {
  flashOff:
    'M13 2 L4 14 H11 L10 22 L13 18 M15.5 14 L20 8 H13 L13.6 4 M3 3 L21 21',
  flashOn: 'M13 2 L4 14 H11 L10 22 L20 10 H13 Z',
  flashAuto: 'M11 2 L3 13 H9.5 L8.5 21 L16 11 H10 Z M15 21 L18 13.5 L21 21 M16.1 18.5 H19.9',
  torch: 'M8 2 H16 V6 L14 10 V21 H10 V10 L8 6 Z M8 6 H16 M12 13 V15',
  timer: 'M9 2 H15 M12 2 V4 M12 13 L15 10 M20 13 A8 8 0 1 1 4 13 A8 8 0 1 1 20 13',
  grid: 'M4 4 H20 V20 H4 Z M9.33 4 V20 M14.67 4 V20 M4 9.33 H20 M4 14.67 H20',
  exposure: 'M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6 M16 12 A4 4 0 1 1 8 12 A4 4 0 1 1 16 12',
  flip: 'M4 9 A8 8 0 0 1 19 7 M19 3 V7 H15 M20 15 A8 8 0 0 1 5 17 M5 21 V17 H9 M14 12 A2 2 0 1 1 10 12 A2 2 0 1 1 14 12',
  beauty:
    'M12 3 L13.6 8.4 L19 10 L13.6 11.6 L12 17 L10.4 11.6 L5 10 L10.4 8.4 Z M19 15 L19.8 17.2 L22 18 L19.8 18.8 L19 21 L18.2 18.8 L16 18 L18.2 17.2 Z M5 2 L5.6 3.4 L7 4 L5.6 4.6 L5 6 L4.4 4.6 L3 4 L4.4 3.4 Z',
  filters: 'M15 9 A6 6 0 1 1 3 9 A6 6 0 1 1 15 9 M21 9 A6 6 0 1 1 9 9 A6 6 0 1 1 21 9 M18 15 A6 6 0 1 1 6 15 A6 6 0 1 1 18 15',
  smooth: 'M3 12 C6 8 9 8 12 12 C15 16 18 16 21 12 M3 17 C6 13 9 13 12 17 C15 21 18 21 21 17 M3 7 C6 3 9 3 12 7 C15 11 18 11 21 7',
  blemish: 'M20 12 A8 8 0 1 1 4 12 A8 8 0 1 1 20 12 M13.5 9.5 A1.5 1.5 0 1 1 10.5 9.5 A1.5 1.5 0 1 1 13.5 9.5 M10 15 L11 15 M15 14 L15.5 14',
  reset: 'M4 12 A8 8 0 1 0 6.3 6.3 M4 3 V8 H9',
  gallery: 'M4 5 H20 V19 H4 Z M4 16 L9 11 L13 15 L15 13 L20 18 M17 9 A1.5 1.5 0 1 1 14 9 A1.5 1.5 0 1 1 17 9',
  settings:
    'M15 12 A3 3 0 1 1 9 12 A3 3 0 1 1 15 12 M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9',
} as const;

export type IconName = keyof typeof PATHS;

const cache = new Map<IconName, SkPath>();
function pathFor(name: IconName): SkPath {
  let p = cache.get(name);
  if (!p) {
    p = Skia.Path.MakeFromSVGString(PATHS[name]) ?? Skia.Path.Make();
    cache.set(name, p);
  }
  return p;
}

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export const Icon = memo(function Icon({ name, size = 24, color = colors.text, strokeWidth = 1.8, style }: Props) {
  const scale = size / 24;
  // flashOn is the one solid glyph.
  const solid = name === 'flashOn';
  return (
    <Canvas style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Group transform={[{ scale }]}>
        <Path
          path={pathFor(name)}
          color={color}
          style={solid ? 'fill' : 'stroke'}
          strokeWidth={strokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      </Group>
    </Canvas>
  );
});
