import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => undefined }));

const { selectForDate, todayKey, TILE_SIZES, PHOTO_COUNT } = await import("../lib/daily");
const { FILTERS } = await import("@lumen/core");

const pool = Array.from({ length: 100 }, (_, i) => ({ id: String(i), author: `A${i}`, url: `https://unsplash.com/${i}` }));

describe("daily gallery selection", () => {
  it("is deterministic for a date", () => {
    expect(selectForDate("2026-10-18", pool)).toEqual(selectForDate("2026-10-18", pool));
  });

  it("changes from one day to the next", () => {
    const a = selectForDate("2026-10-18", pool).map((p) => p.id);
    const b = selectForDate("2026-10-19", pool).map((p) => p.id);
    expect(a).not.toEqual(b);
  });

  it("returns unique photos, allowed sizes and real filters", () => {
    const photos = selectForDate("2026-10-18", pool);
    expect(photos).toHaveLength(PHOTO_COUNT);
    expect(new Set(photos.map((p) => p.id)).size).toBe(PHOTO_COUNT);
    for (const p of photos) {
      expect(TILE_SIZES.some(([w, h]) => w === p.width && h === p.height)).toBe(true);
      expect(FILTERS.some((f) => f.id === p.filterId && f.id !== "original")).toBe(true);
    }
  });

  it("uses the UTC calendar date", () => {
    expect(todayKey(new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-18");
  });
});
