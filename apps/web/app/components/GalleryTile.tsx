"use client";

import { useEffect, useRef, useState } from "react";
import { getFilter, resolveParams } from "@lumen/core";
import type { DailyPhoto } from "@/lib/daily";
import { sharedRenderer } from "@/lib/webglGrade";

type Status = "waiting" | "grading" | "ready" | "unsupported";

/** Serialises GPU work so tiles share one WebGL context without racing. */
let queue: Promise<void> = Promise.resolve();

export function GalleryTile({ photo, priority }: { photo: DailyPhoto; priority: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<Status>("waiting");
  const [graded, setGraded] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const filter = getFilter(photo.filterId);
  const src = `/photos/${photo.id}/${photo.width}/${photo.height}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let url: string | null = null;
    let cancelled = false;

    const grade = () => {
      queue = queue.then(async () => {
        if (cancelled) return;
        const renderer = sharedRenderer();
        if (!renderer) {
          setStatus("unsupported");
          return;
        }
        setStatus("grading");
        try {
          const img = new Image();
          img.src = src;
          await img.decode();
          if (cancelled) return;
          renderer.render(img, resolveParams(filter, photo.intensity), img.naturalWidth, img.naturalHeight);
          const blob = await renderer.toBlob("image/jpeg", 0.9);
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setGraded(url);
          setStatus("ready");
        } catch {
          setStatus("unsupported");
        }
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          grade();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, filter, photo.intensity]);

  const pct = Math.round(photo.intensity * 100);
  const showGraded = status === "ready" && !comparing;

  return (
    <figure className="tile" ref={ref} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our own cached proxy route */}
      <img
        src={src}
        width={photo.width}
        height={photo.height}
        alt={`Photo by ${photo.author}`}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
      {graded && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL produced by the WebGL filter
        <img className={`graded${showGraded ? " visible" : ""}`} src={graded} alt="" aria-hidden="true" />
      )}
      {status !== "unsupported" && (
        <button
          type="button"
          className="compare"
          aria-pressed={comparing}
          aria-label={`${filter.name} filter at ${pct}%. Press and hold to see the original photo by ${photo.author}.`}
          onPointerDown={() => setComparing(true)}
          onPointerUp={() => setComparing(false)}
          onPointerLeave={() => setComparing(false)}
          onPointerCancel={() => setComparing(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setComparing(true)}
          onKeyUp={() => setComparing(false)}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
      <span className="badge" aria-hidden="true">
        {status === "ready" || status === "unsupported" ? <span className="dot" /> : <span className="spinner" />}
        {status === "unsupported" ? "Original" : comparing ? "Original" : filter.name}
        {status !== "unsupported" && !comparing && <span className="pct">{pct}%</span>}
      </span>
      <figcaption className="credit">
        Photo by{" "}
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
          {photo.author}
        </a>{" "}
        on Unsplash
      </figcaption>
    </figure>
  );
}
