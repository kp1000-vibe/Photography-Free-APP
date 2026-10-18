import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { HIT, colors, radius, type } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  /** Visible content; defaults to the label text. */
  children?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Text-glyph button with a 48pt hit area. Uses text glyphs so we ship no icon font. */
export function IconButton({ label, onPress, children, active, disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      {typeof children === 'string' || children === undefined ? (
        <Text style={[styles.text, active && styles.active]}>{children ?? label}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minWidth: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  disabled: { opacity: 0.35 },
  text: { ...type.label, color: colors.text },
  active: { color: colors.accent },
});
