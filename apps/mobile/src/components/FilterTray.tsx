import { Canvas, Fill, ImageShader, LinearGradient, Shader, vec, type SkImage } from '@shopify/react-native-skia';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FILTERS, resolveParams, toUniforms, type FilterDefinition } from '@lumen/core';
import { gradeEffect } from '../lib/skiaGrade';
import { colors, radius, space, type } from '../theme';

const SIZE = 60;

/**
 * Swatch drawn procedurally (sky, foliage, skin, shadow tones) so every
 * filter has a meaningful preview without any third-party imagery.
 */
const SWATCH_COLORS = ['#7FB2E5', '#C8DDF0', '#E8C39E', '#B97A57', '#4E6B3A', '#1E1E22'];

const FilterSwatch = memo(function FilterSwatch({ filter, image }: { filter: FilterDefinition; image?: SkImage | null }) {
  const uniforms = { u_size: [SIZE, SIZE], ...toUniforms(resolveParams(filter, 1)) };
  return (
    <Canvas style={styles.swatch} pointerEvents="none">
      <Fill>
        <Shader source={gradeEffect} uniforms={uniforms}>
          {image ? (
            <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width: SIZE, height: SIZE }} />
          ) : (
            <LinearGradient start={vec(0, 0)} end={vec(SIZE, SIZE)} colors={SWATCH_COLORS} />
          )}
        </Shader>
      </Fill>
    </Canvas>
  );
});

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  /** Optional photo to preview filters on (editor); defaults to a neutral swatch (camera). */
  image?: SkImage | null;
}

export function FilterTray({ selectedId, onSelect, image }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {FILTERS.map((f) => {
        const selected = f.id === selectedId;
        return (
          <Pressable
            key={f.id}
            onPress={() => onSelect(f.id)}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${f.name} filter`}
            hitSlop={4}
          >
            <View style={[styles.frame, selected && styles.frameSelected]}>
              <FilterSwatch filter={f} image={image} />
            </View>
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {f.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, gap: space.md },
  item: { alignItems: 'center', width: SIZE + 4 },
  frame: { borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  frameSelected: { borderColor: colors.accent },
  swatch: { width: SIZE, height: SIZE },
  label: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  labelSelected: { color: colors.text },
});
