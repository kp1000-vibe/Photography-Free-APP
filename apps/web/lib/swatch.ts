import { gradePixel, resolveParams, type FilterDefinition, type RGB } from "@lumen/core";

// Sky, highlight, skin, wood, foliage and shadow tones — the same palette as the app's filter tray.
const SWATCH: RGB[] = [
  [0x7f, 0xb2, 0xe5],
  [0xc8, 0xdd, 0xf0],
  [0xe8, 0xc3, 0x9e],
  [0xb9, 0x7a, 0x57],
  [0x4e, 0x6b, 0x3a],
  [0x1e, 0x1e, 0x22],
].map(([r, g, b]) => [r / 255, g / 255, b / 255] as RGB);

/** CSS gradient showing what a filter does, computed with the real grading math. */
export function swatchGradient(filter: FilterDefinition): string {
  const p = resolveParams(filter, 1);
  const stops = SWATCH.map((c, i) => {
    const [r, g, b] = gradePixel(c, p, [0.5, 0.5]);
    const pct = Math.round((i / (SWATCH.length - 1)) * 100);
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}) ${pct}%`;
  });
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
