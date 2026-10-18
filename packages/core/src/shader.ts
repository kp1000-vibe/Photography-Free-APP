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
${GRADE_UNIFORMS}
${GRADE_FUNCTION}
void main() {
  vec4 src = texture2D(u_image, v_uv);
  gl_FragColor = vec4(lumenGrade(src.rgb, v_uv), src.a);
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
 * photo; `u_size` is its size in pixels so the vignette is resolution
 * independent.
 */
export const SKSL_SHADER = `uniform shader image;
uniform vec2 u_size;
${GRADE_UNIFORMS}
${GRADE_FUNCTION}
half4 main(float2 xy) {
  vec4 src = image.eval(xy);
  return half4(lumenGrade(src.rgb, xy / u_size), src.a);
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
  };
}
