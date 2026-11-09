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

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** How skin-like a colour is, 0..1. CPU twin of `lumenSkinMask` in shader.ts. */
export function skinMask(c: RGB): number {
  const y = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const cb = 0.5 - c[0] * 0.168736 - c[1] * 0.331264 + c[2] * 0.5;
  const cr = 0.5 + c[0] * 0.5 - c[1] * 0.418688 - c[2] * 0.081312;
  return (
    smoothstep(0.04, 0.12, y) *
    smoothstep(0.29, 0.33, cb) *
    (1 - smoothstep(0.49, 0.52, cb)) *
    smoothstep(0.505, 0.535, cr) *
    (1 - smoothstep(0.67, 0.71, cr))
  );
}

/**
 * CPU reference of `lumenSkin` in shader.ts: opt-in skin smoothing and
 * blemish softening on an RGBA8 buffer, in place. Alpha is untouched.
 */
export function retouchSkinRGBA(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  smooth: number,
  blemish: number,
): void {
  if (smooth <= 0 && blemish <= 0) return;
  const src = Float32Array.from(data, (v) => v / 255);

  /** Bilinear, clamp-to-edge read at a pixel-centre position, like a GPU sampler. */
  const sample = (px: number, py: number): RGB => {
    const fx = clamp(px - 0.5, 0, width - 1);
    const fy = clamp(py - 0.5, 0, height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number, ch: number) => src[(y * width + x) * 4 + ch]!;
    const channel = (ch: number) =>
      mix(mix(at(x0, y0, ch), at(x1, y0, ch), tx), mix(at(x0, y1, ch), at(x1, y1, ch), tx), ty);
    return [channel(0), channel(1), channel(2)];
  };

  const radius = 0.012 * Math.min(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c: RGB = [src[i]!, src[i + 1]!, src[i + 2]!];
      const cl = luma(c);
      const cr = c[0] - c[1];

      const sum: RGB = [c[0], c[1], c[2]];
      let weight = 1;
      const ring: RGB = [0, 0, 0];
      const m1 = [0, 0];
      const m2 = [0, 0];
      const tap = (angle: number, r: number): RGB => {
        const s = sample(x + 0.5 + Math.cos(angle) * r, y + 0.5 + Math.sin(angle) * r);
        const d2 = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        const w = Math.exp(-78 * d2);
        sum[0] += s[0] * w;
        sum[1] += s[1] * w;
        sum[2] += s[2] * w;
        weight += w;
        return s;
      };
      for (let k = 0; k < 8; k++) {
        const s = tap(k * 0.7853982, radius);
        ring[0] += s[0] / 8;
        ring[1] += s[1] / 8;
        ring[2] += s[2] / 8;
        const rel = [luma(s) - cl, s[0] - s[1] - cr];
        m1[0]! += rel[0]! / 8;
        m1[1]! += rel[1]! / 8;
        m2[0]! += (rel[0]! * rel[0]!) / 8;
        m2[1]! += (rel[1]! * rel[1]!) / 8;
      }
      for (let k = 0; k < 6; k++) tap(k * 1.0471976 + 0.5, radius * 0.45);

      const s = smooth * 0.9 * skinMask(c);
      const result: RGB = [mix(c[0], sum[0] / weight, s), mix(c[1], sum[1] / weight, s), mix(c[2], sum[2] / weight, s)];

      const variance = Math.max(0, m2[0]! - m1[0]! ** 2) + Math.max(0, m2[1]! - m1[1]! ** 2);
      const even = 1 - smoothstep(0.02, 0.06, Math.sqrt(variance));
      const darker = m1[0]!;
      const redder = -m1[1]!;
      const spot =
        Math.max(smoothstep(0.02, 0.07, darker), smoothstep(0.02, 0.07, redder)) * (1 - smoothstep(0.22, 0.35, darker));
      const b = blemish * even * skinMask(ring) * spot;

      data[i] = Math.round(clamp(mix(result[0], ring[0], b), 0, 1) * 255);
      data[i + 1] = Math.round(clamp(mix(result[1], ring[1], b), 0, 1) * 255);
      data[i + 2] = Math.round(clamp(mix(result[2], ring[2], b), 0, 1) * 255);
    }
  }
}

/** Retouch skin (if asked for) and grade an RGBA8 buffer in place (e.g. ImageData.data). */
export function gradeRGBA(data: Uint8ClampedArray | Uint8Array, width: number, height: number, p: GradeParams): void {
  retouchSkinRGBA(data, width, height, p.smooth, p.blemish);
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
