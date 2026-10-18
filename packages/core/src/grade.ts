import type { GradeParams } from './filters';

/**
 * CPU reference implementation of `lumenGrade` in shader.ts. Used for unit
 * tests and as a fallback for small thumbnails. Never run this per frame on
 * full-resolution images — the GPU path exists for that.
 */

export type RGB = [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const luma = (c: RGB) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/** Grade one pixel. Channels are 0..1; uv is the pixel position in 0..1. */
export function gradePixel(input: RGB, p: GradeParams, uv: [number, number] = [0.5, 0.5]): RGB {
  const gain = 2 ** p.exposure;
  let c: RGB = [input[0] * gain, input[1] * gain, input[2] * gain];

  let l = luma(c);
  const hi = p.highlights * 0.25 * smoothstep(0.45, 1, l);
  const sh = p.shadows * 0.25 * (1 - smoothstep(0, 0.55, l));
  c = [c[0] + hi + sh, c[1] + hi + sh, c[2] + hi + sh];

  const k = 1 + p.contrast;
  c = [(c[0] - 0.5) * k + 0.5, (c[1] - 0.5) * k + 0.5, (c[2] - 0.5) * k + 0.5];

  c = [c[0] + p.temperature * 0.08, c[1] - p.tint * 0.05, c[2] - p.temperature * 0.08];

  l = clamp(luma(c), 0, 1);
  const sw = 0.5 * (1 - smoothstep(0, 0.6, l));
  const hw = 0.5 * smoothstep(0.4, 1, l);
  c = [
    c[0] + p.shadowTint[0] * sw + p.highlightTint[0] * hw,
    c[1] + p.shadowTint[1] * sw + p.highlightTint[1] * hw,
    c[2] + p.shadowTint[2] * sw + p.highlightTint[2] * hw,
  ];

  l = luma(c);
  const spread = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const amount = Math.max(0, 1 + p.saturation + p.vibrance * (1 - clamp(spread, 0, 1)));
  c = [l + (c[0] - l) * amount, l + (c[1] - l) * amount, l + (c[2] - l) * amount];

  const m = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  c = [c[0] + (m - c[0]) * p.mono, c[1] + (m - c[1]) * p.mono, c[2] + (m - c[2]) * p.mono];

  const lift = p.fade * 0.12;
  const scale = 1 - p.fade * 0.16;
  c = [lift + c[0] * scale, lift + c[1] * scale, lift + c[2] * scale];

  const d = Math.hypot(uv[0] - 0.5, uv[1] - 0.5);
  const v = 1 - p.vignette * 0.45 * smoothstep(0.3, 0.75, d);
  return [clamp(c[0] * v, 0, 1), clamp(c[1] * v, 0, 1), clamp(c[2] * v, 0, 1)];
}

/** Grade an RGBA8 buffer in place (e.g. ImageData.data). */
export function gradeRGBA(data: Uint8ClampedArray | Uint8Array, width: number, height: number, p: GradeParams): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const out = gradePixel(
        [data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255],
        p,
        [(x + 0.5) / width, (y + 0.5) / height],
      );
      data[i] = Math.round(out[0] * 255);
      data[i + 1] = Math.round(out[1] * 255);
      data[i + 2] = Math.round(out[2] * 255);
    }
  }
}
