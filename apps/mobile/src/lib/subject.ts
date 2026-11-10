import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import { SEGMENT_SIZE, hasSubject, maskToRGBA, toSegmentInput } from '@lumen/core';
import type { TfliteModel } from 'react-native-fast-tflite';
import { coverShader } from './skiaGrade';

/**
 * Finds the person in a photo, on the device. The model (see
 * assets/models/README.md) is bundled with the app, so this works offline
 * and the photo is never uploaded.
 */

let model: Promise<TfliteModel> | null = null;

function loadModel(): Promise<TfliteModel> {
  if (!model) {
    // Loaded on first use, not at startup: most sessions never need it, and
    // a failure here should only disable this feature, never the app.
    model = import('react-native-fast-tflite')
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles assets through require()
      .then(({ loadTensorflowModel }) => loadTensorflowModel(require('../../assets/models/selfie_segmenter.tflite'), []))
      .catch((e) => {
        model = null;
        throw e;
      });
  }
  return model;
}

/** The photo squashed to the model's square input, as RGBA8 bytes. */
function readModelPixels(image: SkImage): Uint8Array {
  const surface = Skia.Surface.MakeOffscreen(SEGMENT_SIZE, SEGMENT_SIZE);
  if (!surface) throw new Error('Not enough memory to look for a person in this photo');
  const paint = Skia.Paint();
  paint.setShader(coverShader(image, SEGMENT_SIZE, SEGMENT_SIZE));
  surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, SEGMENT_SIZE, SEGMENT_SIZE), paint);
  surface.flush();
  const pixels = surface
    .makeImageSnapshot()
    .readPixels(0, 0, { width: SEGMENT_SIZE, height: SEGMENT_SIZE, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!(pixels instanceof Uint8Array)) throw new Error('Could not read this photo');
  return pixels;
}

/**
 * Returns a mask image (white = person) for the photo, or `null` when the
 * model finds no person in it. Throws if the model cannot be loaded or run.
 */
export async function segmentPerson(image: SkImage): Promise<SkImage | null> {
  const tflite = await loadModel();
  const input = toSegmentInput(readModelPixels(image));
  const [output] = await tflite.run([input.buffer as ArrayBuffer]);
  if (!output || output.byteLength !== SEGMENT_SIZE * SEGMENT_SIZE * 4) {
    throw new Error('The person-detection model returned an unexpected result');
  }
  const mask = new Float32Array(output);
  if (!hasSubject(mask)) return null;
  return Skia.Image.MakeImage(
    { width: SEGMENT_SIZE, height: SEGMENT_SIZE, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    Skia.Data.fromBytes(maskToRGBA(mask)),
    SEGMENT_SIZE * 4,
  );
}
