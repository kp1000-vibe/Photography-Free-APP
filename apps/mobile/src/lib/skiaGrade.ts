import {
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
} from '@shopify/react-native-skia';
import { SKSL_SHADER, toSkslUniformArray, type GradeParams } from '@lumen/core';

const effect = Skia.RuntimeEffect.Make(SKSL_SHADER);
if (!effect) {
  throw new Error('Lumen grading shader failed to compile');
}

/** The compiled grading shader. Safe to capture in camera worklets. */
export const gradeEffect = effect;

/**
 * Grade a full image on the GPU and return a CPU-backed image ready to encode.
 * Falls back to a downscaled surface if the device cannot allocate one at
 * full size (very large photos on low-memory devices).
 */
export function gradeImage(image: SkImage, params: GradeParams): SkImage {
  let width = image.width();
  let height = image.height();
  let surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    const scale = 4096 / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    surface = Skia.Surface.MakeOffscreen(width, height);
  }
  if (!surface) throw new Error('Not enough memory to process this photo');

  const canvas = surface.getCanvas();
  const scaleX = width / image.width();
  const scaleY = height / image.height();
  canvas.scale(scaleX, scaleY);

  const child = image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
  const paint = Skia.Paint();
  paint.setShader(gradeEffect.makeShaderWithChildren(toSkslUniformArray(params, image.width(), image.height()), [child]));
  canvas.drawRect(Skia.XYWHRect(0, 0, image.width(), image.height()), paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  return snapshot.makeNonTextureImage() ?? snapshot;
}

export function encodeJpeg(image: SkImage, quality: number): Uint8Array {
  return image.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
}
