import { describe, expect, it } from 'vitest';
import {
  FILTERS,
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
  rotateClockwise,
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
      const p = resolveParams(f, 1, { brightness: 1, contrast: 1, saturation: 1, highlights: 1, shadows: 1, warmth: 1 });
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
