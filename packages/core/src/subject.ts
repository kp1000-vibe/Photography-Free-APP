/**
 * Background blur and cutout.
 *
 * A small on-device model finds the person in a photo and returns a mask.
 * Everything here is the platform-independent part: the edit state, the
 * conversion to and from the model's tensors, and the two SkSL shaders that
 * turn "photo + mask" into a blurred or removed background. The mobile app
 * supplies the model runner and the Skia surfaces (see apps/mobile/src/lib/subject.ts).
 */

export type BackgroundMode = 'none' | 'blur' | 'cutout';

export interface BackgroundEdit {
  mode: BackgroundMode;
  /** 0..1 blur strength, used when mode is 'blur'. */
  blur: number;
}

export const NO_BACKGROUND: BackgroundEdit = Object.freeze({ mode: 'none', blur: 0.6 });

/** The segmentation model takes and returns a square image of this many pixels a side. */
export const SEGMENT_SIZE = 256;

/** Below this share of the frame we treat the photo as having no person in it. */
export const MIN_SUBJECT_COVERAGE = 0.01;

/** RGBA8 pixels (SEGMENT_SIZE square) to the model's input: RGB floats in 0..1. */
export function toSegmentInput(rgba: Uint8Array | Uint8ClampedArray): Float32Array {
  const pixels = SEGMENT_SIZE * SEGMENT_SIZE;
  if (rgba.length !== pixels * 4) throw new Error(`Expected ${pixels * 4} bytes of RGBA, got ${rgba.length}`);
  const out = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    out[i * 3] = rgba[i * 4]! / 255;
    out[i * 3 + 1] = rgba[i * 4 + 1]! / 255;
    out[i * 3 + 2] = rgba[i * 4 + 2]! / 255;
  }
  return out;
}

/** The model's output (one 0..1 "is a person" value per pixel) as opaque grey RGBA8, ready to be a texture. */
export function maskToRGBA(mask: Float32Array): Uint8Array {
  const out = new Uint8Array(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i]!;
    const v = Math.round(Math.min(1, Math.max(0, Number.isFinite(m) ? m : 0)) * 255);
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Share of the frame the model is confident is a person, 0..1. */
export function subjectCoverage(mask: Float32Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]! > 0.5) n++;
  return mask.length ? n / mask.length : 0;
}

/** True when there is enough of a person in the mask to blur or cut around. */
export function hasSubject(mask: Float32Array): boolean {
  return subjectCoverage(mask) >= MIN_SUBJECT_COVERAGE;
}

/**
 * Gaussian sigma in pixels for a blur strength, for an image of the given
 * size. Scales with the image so the same strength looks the same in the
 * small preview and in the full-size export.
 */
export function blurSigma(strength: number, width: number, height: number): number {
  const t = Math.min(1, Math.max(0, strength));
  return (0.004 + 0.026 * t) * Math.min(width, height);
}

/** The blurred background is rendered small (it is blurry anyway) and scaled back up. */
export function backgroundLayerSize(width: number, height: number, longEdge = 640) {
  const s = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), scale: s };
}

/**
 * Shared by both shaders. The mask is only SEGMENT_SIZE pixels a side, so
 * stretched over a photo its edge is soft and a little off. This reads the
 * mask at the pixel and its eight mask-texel neighbours and trusts the
 * neighbours whose colour in the photo matches the pixel's, which pulls the
 * edge onto the real outline of the person.
 */
const SUBJECT_FUNCTION = `
float lumenSubject(vec2 xy) {
  vec3 c = image.eval(xy).rgb;
  vec2 texel = u_size / ${SEGMENT_SIZE}.0;
  float sum = mask.eval(xy).r;
  float weight = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 p = xy + vec2(cos(a), sin(a)) * texel * (mod(float(i), 2.0) < 0.5 ? 1.0 : 1.4);
    vec3 d = image.eval(p).rgb - c;
    float w = exp(-40.0 * dot(d, d));
    sum += mask.eval(p).r * w;
    weight += w;
  }
  return smoothstep(0.3, 0.7, sum / weight);
}
`;

/**
 * Pass 1 of background blur: the photo with the person knocked out, as
 * premultiplied colour (alpha = "is background"). The app draws this small
 * with a Gaussian blur; because the person is transparent rather than black
 * or blurred in, their colours never bleed into the background as a halo.
 * All children are sampled in photo pixels.
 */
export const BACKGROUND_KNOCKOUT_SKSL = `uniform shader image;
uniform shader mask;
uniform vec2 u_size;
${SUBJECT_FUNCTION}
half4 main(float2 xy) {
  float bg = 1.0 - lumenSubject(xy);
  return half4(image.eval(xy).rgb * bg, bg);
}
`;

/**
 * Final pass, run after grading. `image` is the graded photo, `layer` is the
 * blurred knockout from pass 1 (scaled back to photo pixels) and `mask` is
 * the person mask. With u_cutout = 0 the background is replaced by the blur;
 * with u_cutout = 1 it becomes transparent (premultiplied output).
 */
export const BACKGROUND_COMPOSITE_SKSL = `uniform shader image;
uniform shader layer;
uniform shader mask;
uniform vec2 u_size;
uniform float u_cutout;
${SUBJECT_FUNCTION}
half4 main(float2 xy) {
  vec4 src = image.eval(xy);
  float m = lumenSubject(xy);
  if (u_cutout > 0.5) return half4(src.rgb * m, m);
  vec4 b = layer.eval(xy);
  vec3 blurred = mix(src.rgb, b.rgb / max(b.a, 0.001), smoothstep(0.0, 0.08, b.a));
  return half4(mix(blurred, src.rgb, m), 1.0);
}
`;

/** Uniforms for both background shaders, in declaration order. */
export function toBackgroundUniforms(width: number, height: number, mode: BackgroundMode) {
  return {
    knockout: [width, height],
    composite: [width, height, mode === 'cutout' ? 1 : 0],
  };
}
