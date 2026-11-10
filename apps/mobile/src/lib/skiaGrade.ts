import {
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
  type SkShader,
} from '@shopify/react-native-skia';
import {
  BACKGROUND_COMPOSITE_SKSL,
  BACKGROUND_KNOCKOUT_SKSL,
  SKSL_SHADER,
  backgroundLayerSize,
  blurSigma,
  isNeutral,
  toBackgroundUniforms,
  toSkslUniformArray,
  type GradeParams,
} from '@lumen/core';

function compile(source: string, name: string) {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) throw new Error(`Lumen ${name} shader failed to compile`);
  return effect;
}

/** The compiled grading shader. Safe to capture in camera worklets. */
export const gradeEffect = compile(SKSL_SHADER, 'grading');
/** Final pass for background blur and cutout; see BACKGROUND_COMPOSITE_SKSL. */
export const compositeEffect = compile(BACKGROUND_COMPOSITE_SKSL, 'background');
const knockoutEffect = compile(BACKGROUND_KNOCKOUT_SKSL, 'background blur');

/** What to do around the person: the mask comes from `segmentPerson`. */
export interface Backdrop {
  mode: 'blur' | 'cutout';
  /** 0..1 blur strength. */
  blur: number;
  mask: SkImage;
}

/** `image` as a shader stretched to cover a width x height area, so every shader works in photo pixels. */
export function coverShader(image: SkImage, width: number, height: number): SkShader {
  const matrix = Skia.Matrix();
  matrix.scale(width / image.width(), height / image.height());
  return image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None, matrix);
}

/** The photo with its filter, adjustments and skin retouching applied, as a shader in photo pixels. */
export function gradedShader(image: SkImage, params: GradeParams): SkShader {
  const source = coverShader(image, image.width(), image.height());
  if (isNeutral(params)) return source;
  return gradeEffect.makeShaderWithChildren(toSkslUniformArray(params, image.width(), image.height()), [source]);
}

/**
 * The blurred background on its own: the graded photo with the person
 * knocked out, drawn small through a Gaussian blur. Returned as a CPU-backed
 * image so it can be used by the on-screen canvas as well as for export.
 */
export function makeBackgroundLayer(image: SkImage, params: GradeParams, mask: SkImage, strength: number): SkImage | null {
  const width = image.width();
  const height = image.height();
  const size = backgroundLayerSize(width, height);
  const surface = Skia.Surface.MakeOffscreen(size.width, size.height);
  if (!surface) return null;

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  canvas.scale(size.scale, size.scale);
  const sigma = blurSigma(strength, width, height);
  const paint = Skia.Paint();
  paint.setShader(
    knockoutEffect.makeShaderWithChildren(toBackgroundUniforms(width, height, 'blur').knockout, [
      gradedShader(image, params),
      coverShader(mask, width, height),
    ]),
  );
  paint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null));
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  return snapshot.makeNonTextureImage() ?? snapshot;
}

/** The finished look as one shader in photo pixels: graded, then background blur or cutout if asked for. */
function finalShader(image: SkImage, params: GradeParams, backdrop?: Backdrop): SkShader {
  const graded = gradedShader(image, params);
  if (!backdrop) return graded;
  const width = image.width();
  const height = image.height();
  const mask = coverShader(backdrop.mask, width, height);
  const layer = backdrop.mode === 'blur' ? makeBackgroundLayer(image, params, backdrop.mask, backdrop.blur) : null;
  if (backdrop.mode === 'blur' && !layer) throw new Error('Not enough memory to blur the background');
  return compositeEffect.makeShaderWithChildren(toBackgroundUniforms(width, height, backdrop.mode).composite, [
    graded,
    layer ? coverShader(layer, width, height) : mask,
    mask,
  ]);
}

/**
 * Render a full image on the GPU and return a CPU-backed image ready to encode.
 * Falls back to a downscaled surface if the device cannot allocate one at
 * full size (very large photos on low-memory devices).
 */
export function renderImage(image: SkImage, params: GradeParams, backdrop?: Backdrop): SkImage {
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
  canvas.clear(Skia.Color('transparent'));
  canvas.scale(width / image.width(), height / image.height());

  const paint = Skia.Paint();
  paint.setShader(finalShader(image, params, backdrop));
  canvas.drawRect(Skia.XYWHRect(0, 0, image.width(), image.height()), paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  return snapshot.makeNonTextureImage() ?? snapshot;
}

export function encodeJpeg(image: SkImage, quality: number): Uint8Array {
  return image.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
}

/** Lossless, and keeps transparency: used for cutouts. */
export function encodePng(image: SkImage): Uint8Array {
  return image.encodeToBytes(ImageFormat.PNG, 100);
}
