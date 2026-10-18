import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { initialEdit, type EditState } from '@lumen/core';

/**
 * The app's private photo library. Originals are copied into the app's
 * document directory so edits can always be re-done from the untouched file;
 * nothing here ever leaves the device.
 */
export interface LibraryItem {
  id: string;
  originalUri: string;
  createdAt: number;
  edit: EditState;
  /** Last exported, filtered copy (also saved to the system photo library when allowed). */
  exportedUri?: string;
}

const KEY = 'lumen.library.v1';
const originalsDir = new Directory(Paths.document, 'originals');

let items: LibraryItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function persist() {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function loadLibrary(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: LibraryItem[] = raw ? JSON.parse(raw) : [];
    // Drop entries whose original file was removed by the OS or the user.
    items = parsed.filter((i) => new File(i.originalUri).exists);
  } catch {
    items = [];
  }
  loaded = true;
  emit();
}

export function toFileUri(path: string): string {
  return path.startsWith('file://') || path.startsWith('content://') || path.startsWith('ph://') ? path : `file://${path}`;
}

/** Copy a captured or imported photo into app storage and add it to the library. */
export async function addPhoto(sourceUri: string, edit: EditState = initialEdit()): Promise<LibraryItem> {
  if (!originalsDir.exists) originalsDir.create({ intermediates: true, idempotent: true });
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = sourceUri.toLowerCase().match(/\.(heic|heif|png|jpe?g)(\?|$)/)?.[1] ?? 'jpg';
  const dest = new File(originalsDir, `${id}.${ext}`);
  await new File(toFileUri(sourceUri)).copy(dest);
  const item: LibraryItem = { id, originalUri: dest.uri, createdAt: Date.now(), edit };
  items = [item, ...items];
  emit();
  await persist();
  return item;
}

export async function updatePhoto(id: string, patch: Partial<Omit<LibraryItem, 'id' | 'originalUri'>>) {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
  await persist();
}

/** Removes the photo from Lumen only. Copies already saved to the system photo library are kept. */
export async function removePhoto(id: string) {
  const item = items.find((i) => i.id === id);
  items = items.filter((i) => i.id !== id);
  emit();
  await persist();
  for (const uri of [item?.originalUri, item?.exportedUri]) {
    if (!uri) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // Already gone; nothing to clean up.
    }
  }
}

export function getPhoto(id: string): LibraryItem | undefined {
  return items.find((i) => i.id === id);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLibrary(): { items: LibraryItem[]; loaded: boolean } {
  const snapshot = useSyncExternalStore(subscribe, () => items);
  return { items: snapshot, loaded };
}
