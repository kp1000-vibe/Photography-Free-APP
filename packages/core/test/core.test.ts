import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_COMPOSITE_SKSL,
  BACKGROUND_KNOCKOUT_SKSL,
  FILTERS,
  NO_BACKGROUND,
  SEGMENT_SIZE,
  backgroundLayerSize,
  blurSigma,
  exportFormat,
  hasSubject,
  maskToRGBA,
  normalizeEdit,
  sameEdit,
  subjectCoverage,
  toBackgroundUniforms,
  toSegmentInput,
  NEUTRAL,
  NO_ADJUSTMENTS,
  SKSL_SHADER,
  WEBGL_FRAGMENT_SHADER,
  canShowBanner,
  canShowInterstitial,
  canRedo,
  canUndo,
  centeredCrop,
  createHistory,
  cropToPixels,
  editParams,
  exportSize,
  getFilter,
  gradePixel,
  gradeRGBA,
  initialAdState,
  initialEdit,
  isNeutral,
  push,
  recordExport,
  recordInterstitial,
  redo,
  resolveParams,
  retouchSkinRGBA,
  rotateClockwise,
  skinMask,
  toSkslUniformArray,
  toUniforms,
  undo,
  type RGB,
} from '../src';

const samples: RGB[] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.5, 0.5, 0.5],
  [0.8, 0.4, 0.2],
  [0.1, 0.6, 0.9],
  [0.95, 0.85, 0.75],
];

const close = (a: RGB, b: RGB, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

describe('filter catalogue', () => {
  it('has unique ids and codes covering every required family', () => {
    expect(new Set(FILTERS.map((f) => f.id)).size).toBe(FILTERS.length);
    expect(new Set(FILTERS.map((f) => f.code)).size).toBe(FILTERS.length);
    const families = new Set(FILTERS.map((f) => f.family));
    for (const f of ['natural', 'soft', 'warm', 'cool', 'film', 'matte', 'vivid', 'mono', 'portrait']) {
      expect(families.has(f as never)).toBe(true);
    }
  });

  it('falls back to Original for unknown ids', () => {
    expect(getFilter('nope').id).toBe('original');
  });

  it('every non-original filter actually changes the image', () => {
    for (const f of FILTERS.filter((f) => f.id !== 'original')) {
      const p = resolveParams(f, 1);
      const changed = samples.some((s) => !close(gradePixel(s, p, [0.1, 0.1]), s, 1e-3));
      expect(changed, f.id).toBe(true);
    }
  });
});

describe('grading pipeline', () => {
  it('neutral params are the identity (centre and corner)', () => {
    for (const s of samples) {
      expect(close(gradePixel(s, NEUTRAL), s)).toBe(true);
      expect(close(gradePixel(s, NEUTRAL, [0, 0]), s)).toBe(true);
    }
  });

  it('intensity 0 is neutral for every filter', () => {
    for (const f of FILTERS) expect(isNeutral(resolveParams(f, 0)), f.id).toBe(true);
  });

  it('intensity is clamped to 0..1', () => {
    const f = getFilter('vivid');
    expect(resolveParams(f, 5)).toEqual(resolveParams(f, 1));
    expect(resolveParams(f, -1)).toEqual(resolveParams(f, 0));
  });

  it('output always stays within 0..1', () => {
    for (const f of FILTERS) {
      const p = resolveParams(f, 1, { brightness: 1, contrast: 1, saturation: 1, highlights: 1, shadows: 1, warmth: 1, smooth: 1, blemish: 1 });
      for (const s of samples) for (const v of gradePixel(s, p, [0, 1])) expect(v >= 0 && v <= 1).toBe(true);
    }
  });

  it('mono at full intensity produces neutral greys', () => {
    const p = resolveParams(getFilter('mono'), 1);
    for (const s of samples) {
      const [r, g, b] = gradePixel(s, p);
      expect(Math.abs(r - g)).toBeLessThan(1e-6);
      expect(Math.abs(g - b)).toBeLessThan(1e-6);
    }
  });

  it('warm raises red relative to blue, cool does the opposite', () => {
    const grey: RGB = [0.5, 0.5, 0.5];
    const [wr, , wb] = gradePixel(grey, resolveParams(getFilter('warm'), 1));
    const [cr, , cb] = gradePixel(grey, resolveParams(getFilter('cool'), 1));
    expect(wr).toBeGreaterThan(wb);
    expect(cb).toBeGreaterThan(cr);
  });

  it('matte lifts pure black', () => {
    const [r] = gradePixel([0, 0, 0], resolveParams(getFilter('matte'), 1));
    expect(r).toBeGreaterThan(0.01);
  });

  it('brightness adjustment brightens mid grey monotonically', () => {
    const f = getFilter('original');
    const at = (b: number) => gradePixel([0.4, 0.4, 0.4], resolveParams(f, 1, { ...NO_ADJUSTMENTS, brightness: b }))[0];
    expect(at(-0.5)).toBeLessThan(at(0));
    expect(at(0)).toBeLessThan(at(0.5));
  });

  it('vignette darkens corners more than centre', () => {
    const p = resolveParams(getFilter('film'), 1);
    const centre = gradePixel([0.6, 0.6, 0.6], p, [0.5, 0.5])[0];
    const corner = gradePixel([0.6, 0.6, 0.6], p, [0, 0])[0];
    expect(corner).toBeLessThan(centre);
  });

  it('gradeRGBA leaves alpha untouched and matches gradePixel', () => {
    const data = new Uint8ClampedArray([200, 100, 50, 128]);
    const p = resolveParams(getFilter('film'), 1);
    gradeRGBA(data, 1, 1, p);
    const ref = gradePixel([200 / 255, 100 / 255, 50 / 255], p, [0.5, 0.5]);
    expect(data[3]).toBe(128);
    expect(data[0]).toBe(Math.round(ref[0] * 255));
  });
});

describe('skin retouching', () => {
  const W = 100;
  const H = 100;
  const SKIN_TONE: RGB = [0.86, 0.66, 0.55];

  /** Deterministic noise in -1..1 so the tests don't depend on Math.random. */
  const noise = (x: number, y: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const make = (pixel: (x: number, y: number) => RGB) => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = pixel(x, y);
        data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], (y * W + x) * 4);
      }
    }
    return data;
  };
  const at = (data: Uint8ClampedArray, x: number, y: number): RGB => {
    const i = (y * W + x) * 4;
    return [data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255];
  };
  /** Standard deviation of the red channel over the middle of the image. */
  const roughness = (data: Uint8ClampedArray) => {
    const values: number[] = [];
    for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) values.push(at(data, x, y)[0]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  };
  const textured = (base: RGB) => make((x, y) => base.map((v) => v + noise(x, y) * 0.04) as RGB);

  it('recognises light and dark skin tones but not other colours', () => {
    for (const tone of [SKIN_TONE, [0.95, 0.8, 0.74], [0.6, 0.42, 0.32], [0.35, 0.22, 0.15]] as RGB[]) {
      expect(skinMask(tone)).toBeGreaterThan(0.9);
    }
    for (const other of [[0.5, 0.5, 0.5], [1, 1, 1], [0, 0, 0], [0.2, 0.5, 0.9], [0.2, 0.6, 0.2], [0.9, 0.1, 0.1]] as RGB[]) {
      expect(skinMask(other)).toBeLessThan(0.05);
    }
  });

  it('is off by default and does nothing at zero', () => {
    expect(NEUTRAL.smooth).toBe(0);
    expect(NEUTRAL.blemish).toBe(0);
    expect(NO_ADJUSTMENTS.smooth).toBe(0);
    expect(NO_ADJUSTMENTS.blemish).toBe(0);
    for (const f of FILTERS) {
      const p = resolveParams(f, 1);
      expect(p.smooth).toBe(0);
      expect(p.blemish).toBe(0);
    }
    const data = textured(SKIN_TONE);
    const before = data.slice();
    retouchSkinRGBA(data, W, H, 0, 0);
    expect(data).toEqual(before);
  });

  it('smooths skin texture, more at higher strength', () => {
    const original = textured(SKIN_TONE);
    const half = original.slice();
    const full = original.slice();
    retouchSkinRGBA(half, W, H, 0.5, 0);
    retouchSkinRGBA(full, W, H, 1, 0);
    expect(roughness(half)).toBeLessThan(roughness(original) * 0.8);
    expect(roughness(full)).toBeLessThan(roughness(half));
    expect(roughness(full)).toBeLessThan(roughness(original) * 0.5);
    // Smoothing must not shift the overall skin colour.
    const mean = (d: Uint8ClampedArray, ch: number) => {
      let n = 0;
      for (let i = ch; i < d.length; i += 4) n += d[i]!;
      return n / (W * H);
    };
    for (const ch of [0, 1, 2]) expect(Math.abs(mean(full, ch) - mean(original, ch))).toBeLessThan(1);
  });

  it('leaves non-skin colours alone', () => {
    for (const base of [[0.2, 0.45, 0.8], [0.5, 0.5, 0.5], [0.25, 0.55, 0.25]] as RGB[]) {
      const data = textured(base);
      const before = data.slice();
      retouchSkinRGBA(data, W, H, 1, 1);
      expect(data).toEqual(before);
    }
  });

  it('keeps hard edges sharp (skin next to dark hair)', () => {
    const data = make((x) => (x < 50 ? SKIN_TONE : [0.08, 0.06, 0.05]));
    const before = data.slice();
    retouchSkinRGBA(data, W, H, 1, 1);
    for (const x of [47, 48, 49, 50, 51, 52]) {
      const a = at(data, x, 50);
      const b = at(before, x, 50);
      for (const ch of [0, 1, 2]) expect(Math.abs(a[ch]! - b[ch]!)).toBeLessThan(0.02);
    }
  });

  /** Even skin with one small round spot in the middle. */
  const spotted = (spot: RGB, radius = 0.7) => make((x, y) => (Math.hypot(x - 50, y - 50) <= radius ? spot : SKIN_TONE));

  it('softens a small dark spot and a small red spot on skin', () => {
    for (const spot of [[0.74, 0.55, 0.45], [0.88, 0.56, 0.5]] as RGB[]) {
      const data = spotted(spot);
      retouchSkinRGBA(data, W, H, 0, 1);
      const healed = at(data, 50, 50);
      for (const ch of [0, 1, 2]) {
        const leftBefore = Math.abs(spot[ch]! - SKIN_TONE[ch]!);
        expect(Math.abs(healed[ch]! - SKIN_TONE[ch]!)).toBeLessThan(leftBefore * 0.25 + 0.01);
      }
      // Skin away from the spot is untouched.
      expect(at(data, 20, 20)).toEqual(at(spotted(spot), 20, 20));
    }
  });

  it('blemish softening scales with strength and leaves strong marks alone', () => {
    const spot: RGB = [0.74, 0.55, 0.45];
    const distance = (strength: number) => {
      const data = spotted(spot);
      retouchSkinRGBA(data, W, H, 0, strength);
      return Math.abs(at(data, 50, 50)[0] - SKIN_TONE[0]);
    };
    expect(distance(0.5)).toBeLessThan(distance(0));
    expect(distance(1)).toBeLessThan(distance(0.5));

    // A much darker mark (a mole, a nostril, a pupil) is a feature, not a blemish.
    const dark: RGB = [0.2, 0.13, 0.1];
    const data = spotted(dark);
    retouchSkinRGBA(data, W, H, 0, 1);
    expect(at(data, 50, 50)[0]).toBeCloseTo(dark[0], 1);
  });

  it('editor adjustments switch it on, and old saved edits without them still resolve', () => {
    const p = resolveParams(getFilter('portrait'), 1, { ...NO_ADJUSTMENTS, smooth: 0.6, blemish: 0.4 });
    expect(p.smooth).toBeCloseTo(0.6);
    expect(p.blemish).toBeCloseTo(0.4);
    expect(isNeutral(resolveParams(getFilter('original'), 1, { ...NO_ADJUSTMENTS, smooth: 0.3 }))).toBe(false);

    const { smooth: _s, blemish: _b, ...legacy } = NO_ADJUSTMENTS;
    const old = resolveParams(getFilter('warm'), 1, legacy as typeof NO_ADJUSTMENTS);
    expect(old.smooth).toBe(0);
    expect(old.blemish).toBe(0);
  });

  it('gradeRGBA retouches before grading', () => {
    const data = textured(SKIN_TONE);
    const expected = data.slice();
    const p = resolveParams(getFilter('warm'), 1, { ...NO_ADJUSTMENTS, smooth: 1 });
    retouchSkinRGBA(expected, W, H, p.smooth, p.blemish);
    gradeRGBA(expected, W, H, { ...p, smooth: 0, blemish: 0 });
    gradeRGBA(data, W, H, p);
    expect(data).toEqual(expected);
  });
});

describe('background blur and cutout', () => {
  const PIXELS = SEGMENT_SIZE * SEGMENT_SIZE;

  it('is off by default', () => {
    expect(NO_BACKGROUND.mode).toBe('none');
    expect(initialEdit().background).toEqual(NO_BACKGROUND);
  });

  it('converts RGBA pixels to the model input and rejects the wrong size', () => {
    const rgba = new Uint8Array(PIXELS * 4);
    rgba.set([255, 0, 51, 255], 0);
    rgba.set([0, 255, 102, 7], (PIXELS - 1) * 4);
    const input = toSegmentInput(rgba);
    expect(input.length).toBe(PIXELS * 3);
    expect(Array.from(input.slice(0, 3))).toEqual([1, 0, 0.2].map(Math.fround));
    expect(Array.from(input.slice(-3))).toEqual([0, 1, 0.4].map(Math.fround));
    expect(() => toSegmentInput(new Uint8Array(16))).toThrow();
  });

  it('turns the model output into an opaque grey mask, clamping bad values', () => {
    const rgba = maskToRGBA(new Float32Array([0, 1, 0.5, -3, 7, NaN]));
    expect(Array.from(rgba)).toEqual([
      0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
  });

  it('only treats a photo as having a person when enough of it is covered', () => {
    const mask = new Float32Array(PIXELS);
    expect(hasSubject(mask)).toBe(false);
    mask.fill(0.9, 0, PIXELS / 200); // 0.5% of the frame: noise, not a person
    expect(subjectCoverage(mask)).toBeCloseTo(0.005);
    expect(hasSubject(mask)).toBe(false);
    mask.fill(0.9, 0, PIXELS / 4);
    expect(hasSubject(mask)).toBe(true);
    expect(subjectCoverage(new Float32Array(0))).toBe(0);
  });

  it('blur strength scales with the image so preview and export match', () => {
    expect(blurSigma(1, 1000, 2000)).toBeGreaterThan(blurSigma(0.5, 1000, 2000));
    expect(blurSigma(0.5, 1000, 2000)).toBeGreaterThan(blurSigma(0, 1000, 2000));
    expect(blurSigma(0, 1000, 2000)).toBeGreaterThan(0);
    expect(blurSigma(0.5, 4000, 3000)).toBeCloseTo(blurSigma(0.5, 1600, 1200) * 2.5);
    expect(blurSigma(5, 100, 100)).toBe(blurSigma(1, 100, 100));
  });

  it('renders the blurred layer small, never larger than the photo', () => {
    expect(backgroundLayerSize(4000, 3000)).toMatchObject({ width: 640, height: 480 });
    expect(backgroundLayerSize(300, 200)).toEqual({ width: 300, height: 200, scale: 1 });
  });

  it('uniform arrays match the shader declarations', () => {
    const count = (sksl: string) =>
      [...sksl.matchAll(/uniform (float|vec2|vec3) \w+;/g)].reduce((n, m) => n + (m[1] === 'float' ? 1 : Number(m[1]!.slice(3))), 0);
    expect(toBackgroundUniforms(640, 480, 'blur').knockout.length).toBe(count(BACKGROUND_KNOCKOUT_SKSL));
    expect(toBackgroundUniforms(640, 480, 'blur').composite).toEqual([640, 480, 0]);
    expect(toBackgroundUniforms(640, 480, 'cutout').composite).toEqual([640, 480, 1]);
    expect(toBackgroundUniforms(640, 480, 'cutout').composite.length).toBe(count(BACKGROUND_COMPOSITE_SKSL));
  });

  it('cutouts export as PNG, everything else as JPEG', () => {
    expect(exportFormat({ background: { mode: 'cutout', blur: 0 } })).toEqual({ extension: 'png', mime: 'image/png' });
    expect(exportFormat({ background: { mode: 'blur', blur: 1 } }).extension).toBe('jpg');
    expect(exportFormat(initialEdit()).mime).toBe('image/jpeg');
  });

  it('edits saved by older versions load with skin and background off', () => {
    const { background: _bg, ...withoutBackground } = initialEdit('warm', 0.5);
    const { smooth: _s, blemish: _b, ...oldAdjustments } = { ...withoutBackground.adjustments, contrast: 0.3 };
    const loaded = normalizeEdit({ ...withoutBackground, adjustments: oldAdjustments as typeof NO_ADJUSTMENTS, rotation: 90 });
    expect(loaded.background).toEqual(NO_BACKGROUND);
    expect(loaded.adjustments).toEqual({ ...NO_ADJUSTMENTS, contrast: 0.3 });
    expect(loaded).toMatchObject({ filterId: 'warm', intensity: 0.5, rotation: 90 });
    // A current edit passes through unchanged, so opening a photo never marks it as edited.
    const current = { ...initialEdit('film'), background: { mode: 'blur' as const, blur: 0.4 } };
    expect(sameEdit(normalizeEdit(current), current)).toBe(true);
    expect(normalizeEdit(null)).toEqual(initialEdit());
    expect(normalizeEdit({ background: { mode: 'nonsense' as 'blur', blur: 9 } }).background).toEqual({ mode: 'none', blur: 1 });
  });
});

describe('shaders', () => {
  it('declare every uniform that toUniforms provides', () => {
    const uniforms = Object.keys(toUniforms(NEUTRAL));
    for (const u of uniforms) {
      expect(WEBGL_FRAGMENT_SHADER).toContain(` ${u};`);
      expect(SKSL_SHADER).toContain(` ${u};`);
    }
  });

  it('flat SkSL uniform array follows declaration order', () => {
    const declared = [...SKSL_SHADER.matchAll(/uniform (float|vec2|vec3) (\w+);/g)].map((m) => ({
      name: m[2]!,
      size: m[1] === 'float' ? 1 : Number(m[1]!.slice(3)),
    }));
    const p = resolveParams(getFilter('film'), 1);
    const flat = toSkslUniformArray(p, 640, 480);
    expect(flat.length).toBe(declared.reduce((n, d) => n + d.size, 0));
    const named: Record<string, number | readonly number[]> = { u_size: [640, 480], ...toUniforms(p) };
    let i = 0;
    for (const d of declared) {
      const v = named[d.name]!;
      expect(flat.slice(i, i + d.size)).toEqual(Array.isArray(v) ? v : [v]);
      i += d.size;
    }
  });
});

describe('editor history', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    let h = createHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = push(h, 9);
    expect(canRedo(h)).toBe(false);
  });

  it('ignores identical states and caps length', () => {
    let h = createHistory(0);
    h = push(h, 0);
    expect(h.past.length).toBe(0);
    for (let i = 1; i <= 80; i++) h = push(h, i);
    expect(h.past.length).toBe(50);
  });

  it('edit state resolves to grading params', () => {
    const e = initialEdit('warm');
    expect(e.intensity).toBe(getFilter('warm').defaultIntensity);
    expect(editParams(e).temperature).toBeGreaterThan(0);
    expect(rotateClockwise(270)).toBe(0);
  });
});

describe('geometry', () => {
  it('centres square crops on landscape and portrait images', () => {
    expect(centeredCrop(4000, 3000, 1)).toEqual({ x: 0.125, y: 0, width: 0.75, height: 1 });
    expect(centeredCrop(3000, 4000, 1)).toEqual({ x: 0, y: 0.125, width: 1, height: 0.75 });
    expect(centeredCrop(3000, 4000, null)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('converts crops to in-bounds pixels', () => {
    const px = cropToPixels({ x: 0.125, y: 0, width: 0.75, height: 1 }, 4000, 3000);
    expect(px).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
  });

  it('never upscales on export', () => {
    expect(exportSize(1200, 800, 'share')).toEqual({ width: 1200, height: 800 });
    expect(exportSize(4000, 3000, 'share')).toEqual({ width: 1600, height: 1200 });
    expect(exportSize(4000, 3000, 'full')).toEqual({ width: 4000, height: 3000 });
  });
});

describe('ad policy', () => {
  const env = { adsEnabled: true, online: true, interstitialReady: true };
  const day = 24 * 60 * 60_000;
  const ready = () => {
    let s = initialAdState(0);
    for (let i = 0; i < 3; i++) s = recordExport(s);
    return s;
  };

  it('never shows banners on camera or editor screens', () => {
    expect(canShowBanner('camera', env)).toBe(false);
    expect(canShowBanner('editor', env)).toBe(false);
    expect(canShowBanner('gallery', env)).toBe(true);
    expect(canShowBanner('gallery', { ...env, adsEnabled: false })).toBe(false);
  });

  it('only shows interstitials right after an export', () => {
    const s = ready();
    for (const c of ['camera', 'editor', 'gallery', 'settings', 'onboarding'] as const) {
      expect(canShowInterstitial(c, s, env, 2 * day)).toBe(false);
    }
    expect(canShowInterstitial('export-complete', s, env, 2 * day)).toBe(true);
  });

  it('respects grace period, export count, interval, session cap and readiness', () => {
    const s = ready();
    expect(canShowInterstitial('export-complete', s, env, 1000)).toBe(false);
    expect(canShowInterstitial('export-complete', initialAdState(0), env, 2 * day)).toBe(false);
    expect(canShowInterstitial('export-complete', s, { ...env, interstitialReady: false }, 2 * day)).toBe(false);
    expect(canShowInterstitial('export-complete', s, { ...env, online: false }, 2 * day)).toBe(false);

    let after = recordInterstitial(s, 2 * day);
    for (let i = 0; i < 3; i++) after = recordExport(after);
    expect(canShowInterstitial('export-complete', after, env, 2 * day + 1000)).toBe(false);
    expect(canShowInterstitial('export-complete', after, env, 2 * day + 5 * 60_000)).toBe(true);

    const capped = { ...after, interstitialsThisSession: 3 };
    expect(canShowInterstitial('export-complete', capped, env, 3 * day)).toBe(false);
  });
});
