import { cacheLife } from "next/cache";
import { FILTERS } from "@lumen/core";

/**
 * Today's gallery: a fresh, deterministic selection every day from Lorem
 * Picsum, which serves photos from Unsplash under the Unsplash License
 * (free to use, no permission or payment needed). Each tile is paired with a
 * Lumen filter so the gallery doubles as the filter showcase.
 */

export interface DailyPhoto {
  id: string;
  author: string;
  sourceUrl: string;
  width: number;
  height: number;
  filterId: string;
  intensity: number;
}

export interface DailySelection {
  date: string;
  photos: DailyPhoto[];
}

interface PicsumItem {
  id: string;
  author: string;
  url: string;
}

/** Tile sizes (width × height). Must stay in sync with the allow-list in app/photos route. */
export const TILE_SIZES = [
  [600, 800],
  [600, 600],
  [600, 750],
  [600, 900],
  [600, 450],
] as const;

export const PHOTO_COUNT = 12;

// Used if the Picsum API is unreachable, so the page always renders.
const FALLBACK: PicsumItem[] = [
  "10", "11", "13", "15", "16", "17", "18", "19", "20", "22", "24", "25", "27", "28", "29", "37",
].map((id) => ({ id, author: "Unsplash contributor", url: "https://unsplash.com" }));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Pure selection logic, exported for tests. */
export function selectForDate(date: string, pool: PicsumItem[], count = PHOTO_COUNT): DailyPhoto[] {
  const rand = mulberry32(hash(date));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const filters = FILTERS.filter((f) => f.id !== "original");
  return shuffled.slice(0, count).map((item, i) => {
    const [width, height] = TILE_SIZES[Math.floor(rand() * TILE_SIZES.length)]!;
    const filter = filters[(i + Math.floor(rand() * filters.length)) % filters.length]!;
    return {
      id: item.id,
      author: item.author,
      sourceUrl: item.url,
      width,
      height,
      filterId: filter.id,
      intensity: filter.defaultIntensity,
    };
  });
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function getDailySelection(): Promise<DailySelection> {
  "use cache";
  cacheLife("hours");

  const date = todayKey();
  const page = (hash(date) % 10) + 1;
  let pool = FALLBACK;
  try {
    const res = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=100`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const items = (await res.json()) as PicsumItem[];
      if (Array.isArray(items) && items.length >= PHOTO_COUNT) pool = items;
    }
  } catch {
    // Keep the fallback pool.
  }
  return { date, photos: selectForDate(date, pool) };
}
