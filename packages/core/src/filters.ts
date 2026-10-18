/**
 * Lumen filter definitions.
 *
 * Every filter is a set of grading parameters applied by one shared pipeline
 * (see `grade.ts` for the CPU reference and `shader.ts` for the GPU version).
 * Neutral values leave the image unchanged, which is what makes intensity a
 * simple linear blend between "no filter" and "full filter".
 */

export type Vec3 = readonly [number, number, number];

export interface GradeParams {
  /** Exposure in stops, roughly -1..1. */
  exposure: number;
  /** -1..1, 0 = unchanged. Pivots around mid grey. */
  contrast: number;
  /** -1..1, -1 = fully desaturated. */
  saturation: number;
  /** -1..1, saturation boost that protects already-saturated colours. */
  vibrance: number;
  /** -1..1, positive = warmer. */
  temperature: number;
  /** -1..1, positive = magenta, negative = green. */
  tint: number;
  /** -1..1, recovers (negative) or lifts (positive) bright tones. */
  highlights: number;
  /** -1..1, lifts (positive) or deepens (negative) dark tones. */
  shadows: number;
  /** 0..1, lifts the black point for a matte look. */
  fade: number;
  /** 0..1, blend toward monochrome. */
  mono: number;
  /** Colour added to shadows, each channel -1..1. */
  shadowTint: Vec3;
  /** Colour added to highlights, each channel -1..1. */
  highlightTint: Vec3;
  /** 0..1, gentle edge darkening. */
  vignette: number;
}

export const NEUTRAL: GradeParams = Object.freeze({
  exposure: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  fade: 0,
  mono: 0,
  shadowTint: [0, 0, 0] as Vec3,
  highlightTint: [0, 0, 0] as Vec3,
  vignette: 0,
});

export type FilterFamily =
  | 'original'
  | 'natural'
  | 'soft'
  | 'warm'
  | 'cool'
  | 'film'
  | 'matte'
  | 'vivid'
  | 'mono'
  | 'portrait';

export interface FilterDefinition {
  id: string;
  name: string;
  family: FilterFamily;
  /** Short label for the filter tray (2-3 chars). */
  code: string;
  /** Default intensity, 0..1. */
  defaultIntensity: number;
  params: Partial<GradeParams>;
}

export const FILTERS: readonly FilterDefinition[] = [
  { id: 'original', name: 'Original', family: 'original', code: 'OR', defaultIntensity: 1, params: {} },
  {
    id: 'natural',
    name: 'Natural',
    family: 'natural',
    code: 'NA',
    defaultIntensity: 0.8,
    params: { contrast: 0.06, vibrance: 0.18, highlights: -0.2, shadows: 0.15, temperature: 0.03 },
  },
  {
    id: 'soft',
    name: 'Soft',
    family: 'soft',
    code: 'SO',
    defaultIntensity: 0.8,
    params: { exposure: 0.08, contrast: -0.14, highlights: -0.3, shadows: 0.22, saturation: -0.06, fade: 0.08 },
  },
  {
    id: 'warm',
    name: 'Warm',
    family: 'warm',
    code: 'WA',
    defaultIntensity: 0.75,
    params: {
      temperature: 0.35,
      tint: 0.04,
      vibrance: 0.1,
      highlightTint: [0.06, 0.03, -0.04],
      shadows: 0.06,
    },
  },
  {
    id: 'cool',
    name: 'Cool',
    family: 'cool',
    code: 'CO',
    defaultIntensity: 0.75,
    params: { temperature: -0.3, tint: -0.03, contrast: 0.05, shadowTint: [-0.03, 0, 0.05], highlights: -0.1 },
  },
  {
    id: 'film',
    name: 'Film',
    family: 'film',
    code: 'FI',
    defaultIntensity: 0.8,
    params: {
      contrast: 0.1,
      saturation: -0.12,
      fade: 0.12,
      temperature: 0.08,
      shadowTint: [-0.02, 0.03, 0.05],
      highlightTint: [0.05, 0.03, -0.03],
      vignette: 0.25,
    },
  },
  {
    id: 'matte',
    name: 'Matte',
    family: 'matte',
    code: 'MA',
    defaultIntensity: 0.8,
    params: { contrast: -0.18, fade: 0.28, saturation: -0.1, highlights: -0.15, shadows: 0.1 },
  },
  {
    id: 'vivid',
    name: 'Vivid',
    family: 'vivid',
    code: 'VI',
    defaultIntensity: 0.7,
    params: { contrast: 0.12, vibrance: 0.4, saturation: 0.08, highlights: -0.15, shadows: 0.08 },
  },
  {
    id: 'mono',
    name: 'Mono',
    family: 'mono',
    code: 'BW',
    defaultIntensity: 1,
    params: { mono: 1, contrast: 0.12, highlights: -0.12, shadows: 0.1 },
  },
  {
    id: 'portrait',
    name: 'Portrait',
    family: 'portrait',
    code: 'PO',
    defaultIntensity: 0.8,
    params: {
      exposure: 0.05,
      contrast: -0.05,
      temperature: 0.1,
      tint: 0.03,
      highlights: -0.22,
      shadows: 0.18,
      vibrance: -0.05,
      highlightTint: [0.03, 0.01, 0],
    },
  },
] as const;

export function getFilter(id: string): FilterDefinition {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0]!;
}

/** User adjustments from the editor. All -1..1, 0 = unchanged. */
export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  highlights: number;
  shadows: number;
  warmth: number;
}

export const NO_ADJUSTMENTS: Adjustments = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Resolve a filter at an intensity, plus optional editor adjustments, into
 * the concrete parameters the grading pipeline consumes.
 */
export function resolveParams(
  filter: FilterDefinition,
  intensity: number,
  adjustments: Adjustments = NO_ADJUSTMENTS,
): GradeParams {
  const t = clamp(intensity, 0, 1);
  const full: GradeParams = { ...NEUTRAL, ...filter.params };
  const p: GradeParams = {
    exposure: lerp(NEUTRAL.exposure, full.exposure, t),
    contrast: lerp(NEUTRAL.contrast, full.contrast, t),
    saturation: lerp(NEUTRAL.saturation, full.saturation, t),
    vibrance: lerp(NEUTRAL.vibrance, full.vibrance, t),
    temperature: lerp(NEUTRAL.temperature, full.temperature, t),
    tint: lerp(NEUTRAL.tint, full.tint, t),
    highlights: lerp(NEUTRAL.highlights, full.highlights, t),
    shadows: lerp(NEUTRAL.shadows, full.shadows, t),
    fade: lerp(NEUTRAL.fade, full.fade, t),
    mono: lerp(NEUTRAL.mono, full.mono, t),
    shadowTint: lerp3(NEUTRAL.shadowTint, full.shadowTint, t),
    highlightTint: lerp3(NEUTRAL.highlightTint, full.highlightTint, t),
    vignette: lerp(NEUTRAL.vignette, full.vignette, t),
  };
  return {
    ...p,
    exposure: clamp(p.exposure + adjustments.brightness * 0.6, -1.5, 1.5),
    contrast: clamp(p.contrast + adjustments.contrast * 0.5, -1, 1),
    saturation: clamp(p.saturation + adjustments.saturation * 0.6, -1, 1),
    highlights: clamp(p.highlights + adjustments.highlights, -1, 1),
    shadows: clamp(p.shadows + adjustments.shadows, -1, 1),
    temperature: clamp(p.temperature + adjustments.warmth * 0.6, -1, 1),
  };
}

export function isNeutral(p: GradeParams): boolean {
  return (Object.keys(NEUTRAL) as (keyof GradeParams)[]).every((k) => {
    const a = p[k];
    const b = NEUTRAL[k];
    if (Array.isArray(a)) return a.every((v, i) => Math.abs(v - (b as Vec3)[i]!) < 1e-9);
    return Math.abs((a as number) - (b as number)) < 1e-9;
  });
}
