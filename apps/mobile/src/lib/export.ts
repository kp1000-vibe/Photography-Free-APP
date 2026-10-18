import { Skia } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import {
  EXPORT_QUALITY,
  cropToPixels,
  editParams,
  isNeutral,
  type EditState,
  type ExportQuality,
} from '@lumen/core';
import { encodeJpeg, gradeImage } from './skiaGrade';

export interface RenderedPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Apply rotation, crop and resize to the original, returning an upright,
 * losslessly encoded intermediate. Loading through the image manipulator
 * bakes in EXIF orientation so the result is always upright.
 */
export async function renderGeometry(
  sourceUri: string,
  edit: Pick<EditState, 'rotation' | 'crop'>,
  maxLongEdge: number | null,
): Promise<RenderedPhoto> {
  const rotated = ImageManipulator.manipulate(sourceUri);
  if (edit.rotation) rotated.rotate(edit.rotation);
  const base = await rotated.renderAsync();

  const crop = cropToPixels(edit.crop, base.width, base.height);
  const context = ImageManipulator.manipulate(base);
  const isFull = crop.width === base.width && crop.height === base.height;
  if (!isFull) context.crop(crop);
  const long = Math.max(crop.width, crop.height);
  if (maxLongEdge && long > maxLongEdge) {
    const s = maxLongEdge / long;
    context.resize({ width: Math.round(crop.width * s), height: Math.round(crop.height * s) });
  }
  const out = await context.renderAsync();
  const saved = await out.saveAsync({ format: SaveFormat.PNG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Render a finished, filtered JPEG at the requested quality. The original is never touched. */
export async function renderEdit(sourceUri: string, edit: EditState, quality: ExportQuality): Promise<RenderedPhoto> {
  const sized = await renderGeometry(sourceUri, edit, EXPORT_QUALITY[quality].longEdge);

  const params = editParams(edit);
  const data = await Skia.Data.fromURI(sized.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Could not read this photo');

  const graded = isNeutral(params) ? image : gradeImage(image, params);
  const bytes = encodeJpeg(graded, EXPORT_QUALITY[quality].jpegQuality);
  const file = new File(Paths.cache, `lumen-${Date.now()}.jpg`);
  file.write(bytes);
  return { uri: file.uri, width: graded.width(), height: graded.height() };
}

export type SaveResult = { saved: true } | { saved: false; reason: 'permission' | 'error'; message?: string };

const ALBUM = 'Lumen';

/** Save to the system photo library, inside a "Lumen" album when the platform allows it. */
export async function saveToPhotos(uri: string): Promise<SaveResult> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return { saved: false, reason: 'permission' };
    const asset = await MediaLibrary.createAssetAsync(uri);
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM);
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else await MediaLibrary.createAlbumAsync(ALBUM, asset, false);
    } catch {
      // Write-only access can't manage albums; the photo is still saved.
    }
    return { saved: true };
  } catch (e) {
    return { saved: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
