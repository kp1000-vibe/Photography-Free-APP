import { type Adjustments, NO_ADJUSTMENTS, getFilter, resolveParams, type GradeParams } from './filters';

export type Rotation = 0 | 90 | 180 | 270;

/** Crop rectangle in normalised 0..1 coordinates of the rotated image. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_CROP: CropRect = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

/** Everything the editor can change. The original file is never modified. */
export interface EditState {
  filterId: string;
  intensity: number;
  adjustments: Adjustments;
  rotation: Rotation;
  crop: CropRect;
}

export function initialEdit(filterId = 'original', intensity?: number): EditState {
  return {
    filterId,
    intensity: intensity ?? getFilter(filterId).defaultIntensity,
    adjustments: { ...NO_ADJUSTMENTS },
    rotation: 0,
    crop: { ...FULL_CROP },
  };
}

export function editParams(e: EditState): GradeParams {
  return resolveParams(getFilter(e.filterId), e.intensity, e.adjustments);
}

export function rotateClockwise(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

export function sameEdit(a: EditState, b: EditState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Crop rectangle for a target aspect ratio (w/h), centred in an image of the given size. */
export function centeredCrop(imageWidth: number, imageHeight: number, aspect: number | null): CropRect {
  if (!aspect) return { ...FULL_CROP };
  const imageAspect = imageWidth / imageHeight;
  if (imageAspect > aspect) {
    const width = aspect / imageAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imageAspect / aspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Convert a normalised crop into integer pixel coordinates, clamped to the image. */
export function cropToPixels(crop: CropRect, width: number, height: number) {
  const originX = Math.max(0, Math.round(crop.x * width));
  const originY = Math.max(0, Math.round(crop.y * height));
  return {
    originX,
    originY,
    width: Math.min(width - originX, Math.round(crop.width * width)),
    height: Math.min(height - originY, Math.round(crop.height * height)),
  };
}

/** Output long-edge sizes for export quality options. `null` = full resolution. */
export const EXPORT_QUALITY = {
  full: { label: 'Full', longEdge: null, jpegQuality: 0.95 },
  high: { label: 'High', longEdge: 3000, jpegQuality: 0.9 },
  share: { label: 'Share', longEdge: 1600, jpegQuality: 0.85 },
} as const;

export type ExportQuality = keyof typeof EXPORT_QUALITY;

export function exportSize(width: number, height: number, quality: ExportQuality) {
  const { longEdge } = EXPORT_QUALITY[quality];
  const long = Math.max(width, height);
  if (!longEdge || long <= longEdge) return { width, height };
  const s = longEdge / long;
  return { width: Math.round(width * s), height: Math.round(height * s) };
}
