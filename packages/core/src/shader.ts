import type { GradeParams } from './filters';

/**
 * The grading function, written in the subset of GLSL that is also valid
 * SkSL. It is wrapped differently for WebGL (website demo) and for
 * React Native Skia (mobile live preview and export).
 *
 * Keep this in lock-step with `gradePixel` in `grade.ts`, which is the CPU
 * reference used by the unit tests.
 */
export const GRADE_UNIFORMS = `
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_temperature;
uniform float u_tint;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_fade;
uniform float u_mono;
uniform vec3 u_shadowTint;
uniform vec3 u_highlightTint;
uniform float u_vignette;
uniform float u_smooth;
uniform float u_blemish;
`;

/**
 * Opt-in skin retouching, run on the source image before grading. It needs
 * `u_size` (image size in pixels) and a `vec3 lumenSample(vec2 uv)` function
 * from the wrapper, because WebGL and SkSL read neighbouring pixels differently.
 *
 * There is no face detection: skin is found by colour (a chroma range that
 * holds across light and dark skin tones), so the pass works live in the
 * viewfinder, needs no model and nothing leaves the device. It reads two
 * rings of neighbours around each pixel:
 *
 * - Smoothing is a bilateral average: neighbours that look like the centre
 *   pixel count, neighbours across an edge do not, so pores and fine texture
 *   even out while eyes, lips, hair and outlines stay sharp.
 * - Blemish softening pulls a pixel toward the mean of the outer ring when it
 *   is a little darker or redder than that ring *and* the ring itself is even
 *   skin. A small spot sits inside an even ring; a feature edge does not.
 *
 * Keep this in lock-step with `retouchSkinRGBA` in `grade.ts`.
 */
export const SKIN_FUNCTION = `
float lumenSkinMask(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = 0.5 + dot(c, vec3(-0.168736, -0.331264, 0.5));
  float cr = 0.5 + dot(c, vec3(0.5, -0.418688, -0.081312));
  return smoothstep(0.04, 0.12, y)
    * smoothstep(0.29, 0.33, cb) * (1.0 - smoothstep(0.49, 0.52, cb))
    * smoothstep(0.505, 0.535, cr) * (1.0 - smoothstep(0.67, 0.71, cr));
}

vec3 lumenSkin(vec3 c, vec2 uv) {
  if (u_smooth <= 0.0 && u_blemish <= 0.0) return c;

  vec2 radius = vec2(0.012 * min(u_size.x, u_size.y)) / u_size;
  float cl = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float cr = c.r - c.g;

  vec3 sum = c;
  float weight = 1.0;
  vec3 ring = vec3(0.0);
  vec2 m1 = vec2(0.0);
  vec2 m2 = vec2(0.0);

  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec3 s = lumenSample(uv + vec2(cos(a), sin(a)) * radius);
    vec3 d = s - c;
    float w = exp(-78.0 * dot(d, d));
    sum += s * w;
    weight += w;
    ring += s;
    vec2 rel = vec2(dot(s, vec3(0.2126, 0.7152, 0.0722)) - cl, s.r - s.g - cr);
    m1 += rel;
    m2 += rel * rel;
  }
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0471976 + 0.5;
    vec3 s = lumenSample(uv + vec2(cos(a), sin(a)) * radius * 0.45);
    vec3 d = s - c;
    float w = exp(-78.0 * dot(d, d));
    sum += s * w;
    weight += w;
  }

  vec3 result = mix(c, sum / weight, u_smooth * 0.9 * lumenSkinMask(c));

  ring /= 8.0;
  m1 /= 8.0;
  m2 /= 8.0;
  vec2 variance = max(m2 - m1 * m1, vec2(0.0));
  float even = 1.0 - smoothstep(0.02, 0.06, sqrt(variance.x + variance.y));
  float darker = m1.x;
  float redder = -m1.y;
  float spot = max(smoothstep(0.02, 0.07, darker), smoothstep(0.02, 0.07, redder))
    * (1.0 - smoothstep(0.22, 0.35, darker));
  return mix(result, ring, u_blemish * even * lumenSkinMask(ring) * spot);
}
`;

export const GRADE_FUNCTION = `
float lumenLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 lumenGrade(vec3 c, vec2 uv) {
  c = c * exp2(u_exposure);

  float l = lumenLuma(c);
  c += vec3(u_highlights * 0.25 * smoothstep(0.45, 1.0, l));
  c += vec3(u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.55, l)));

  c = (c - vec3(0.5)) * (1.0 + u_contrast) + vec3(0.5);

  c += vec3(u_temperature * 0.08, -u_tint * 0.05, -u_temperature * 0.08);

  l = clamp(lumenLuma(c), 0.0, 1.0);
  c += u_shadowTint * 0.5 * (1.0 - smoothstep(0.0, 0.6, l));
  c += u_highlightTint * 0.5 * smoothstep(0.4, 1.0, l);

  l = lumenLuma(c);
  float spread = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float amount = max(0.0, 1.0 + u_saturation + u_vibrance * (1.0 - clamp(spread, 0.0, 1.0)));
  c = mix(vec3(l), c, amount);

  c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), u_mono);

  c = vec3(u_fade * 0.12) + c * (1.0 - u_fade * 0.16);

  float d = length(uv - vec2(0.5));
  c *= 1.0 - u_vignette * 0.45 * smoothstep(0.3, 0.75, d);

  return clamp(c, 0.0, 1.0);
}
`;

/** WebGL 1 fragment shader used by the website's in-browser camera demo. */
export const WEBGL_FRAGMENT_SHADER = `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform vec2 u_size;
${GRADE_UNIFORMS}
vec3 lumenSample(vec2 uv) {
  return texture2D(u_image, uv).rgb;
}
${SKIN_FUNCTION}
${GRADE_FUNCTION}
void main() {
  vec4 src = texture2D(u_image, v_uv);
  gl_FragColor = vec4(lumenGrade(lumenSkin(src.rgb, v_uv), v_uv), src.a);
}
`;

export const WEBGL_VERTEX_SHADER = `attribute vec2 a_position;
varying vec2 v_uv;
uniform bool u_mirror;
void main() {
  vec2 uv = a_position * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  if (u_mirror) uv.x = 1.0 - uv.x;
  v_uv = uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * SkSL runtime effect for React Native Skia. `image` is the camera frame or
 * photo; `u_size` is its size in pixels so the vignette and the skin pass
 * are resolution independent.
 */
export const SKSL_SHADER = `uniform shader image;
uniform vec2 u_size;
${GRADE_UNIFORMS}
vec3 lumenSample(vec2 uv) {
  return image.eval(uv * u_size).rgb;
}
${SKIN_FUNCTION}
${GRADE_FUNCTION}
half4 main(float2 xy) {
  vec4 src = image.eval(xy);
  vec2 uv = xy / u_size;
  return half4(lumenGrade(lumenSkin(src.rgb, uv), uv), src.a);
}
`;

/**
 * Uniforms for SKSL_SHADER as one flat array in declaration order, which is
 * what Skia's `RuntimeEffect.makeShaderWithChildren` expects.
 */
export function toSkslUniformArray(p: GradeParams, width: number, height: number): number[] {
  return [
    width,
    height,
    p.exposure,
    p.contrast,
    p.saturation,
    p.vibrance,
    p.temperature,
    p.tint,
    p.highlights,
    p.shadows,
    p.fade,
    p.mono,
    ...p.shadowTint,
    ...p.highlightTint,
    p.vignette,
    p.smooth,
    p.blemish,
  ];
}

export type UniformValues = Record<string, number | readonly number[]>;

export function toUniforms(p: GradeParams): UniformValues {
  return {
    u_exposure: p.exposure,
    u_contrast: p.contrast,
    u_saturation: p.saturation,
    u_vibrance: p.vibrance,
    u_temperature: p.temperature,
    u_tint: p.tint,
    u_highlights: p.highlights,
    u_shadows: p.shadows,
    u_fade: p.fade,
    u_mono: p.mono,
    u_shadowTint: [...p.shadowTint],
    u_highlightTint: [...p.highlightTint],
    u_vignette: p.vignette,
    u_smooth: p.smooth,
    u_blemish: p.blemish,
  };
}
