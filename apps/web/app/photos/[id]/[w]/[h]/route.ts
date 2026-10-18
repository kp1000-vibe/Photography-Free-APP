import { TILE_SIZES } from "@/lib/daily";

/**
 * Same-origin proxy for gallery photos. Picsum doesn't send CORS headers, and
 * the browser needs same-origin pixels to run the filter shader on them.
 * Only numeric ids and the gallery's tile sizes are allowed, so this can't be
 * used as an open proxy.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; w: string; h: string }> }) {
  const { id, w, h } = await ctx.params;
  const width = Number(w);
  const height = Number(h);
  const allowed = TILE_SIZES.some(([tw, th]) => tw === width && th === height);
  if (!/^\d{1,5}$/.test(id) || !allowed) {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetch(`https://picsum.photos/id/${id}/${width}/${height}.jpg`, {
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) {
    return new Response("Photo unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/jpeg",
      // A given id/size never changes, so browsers and the CDN can keep it.
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
