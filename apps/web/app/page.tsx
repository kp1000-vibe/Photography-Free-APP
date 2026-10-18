import Link from "next/link";
import { Suspense } from "react";
import { FILTERS } from "@lumen/core";
import { getDailySelection } from "@/lib/daily";
import { STORE_LINKS, SITE_NAME } from "@/lib/site";
import { swatchGradient } from "@/lib/swatch";
import { GalleryTile } from "./components/GalleryTile";

const FILTER_NOTES: Record<string, string> = {
  natural: "Gentle colour correction, true skin tones",
  soft: "Lower contrast, kinder highlights",
  warm: "Restrained golden light",
  cool: "Clean, slightly cooler balance",
  film: "Understated analog colour",
  matte: "Lifted blacks, detail kept",
  vivid: "Richer colour, never neon",
  mono: "Clean black and white",
  portrait: "Flattering tones, no reshaping",
};

async function DailyGallery() {
  const { date, photos } = await getDailySelection();
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <>
      <div className="gallery-head">
        <h2 id="today">Today’s light · {label}</h2>
        <span className="note">New photos every day. Press and hold a photo to see the original.</span>
      </div>
      <div className="masonry">
        {photos.map((p, i) => (
          <GalleryTile key={`${date}-${p.id}`} photo={p} priority={i < 4} />
        ))}
      </div>
    </>
  );
}

function GallerySkeleton() {
  return (
    <>
      <div className="gallery-head">
        <h2>Today’s light</h2>
      </div>
      <div className="masonry" aria-busy="true">
        {[800, 600, 750, 900, 450, 800].map((h, i) => (
          <div key={i} className="tile" style={{ aspectRatio: `600 / ${h}` }} />
        ))}
      </div>
    </>
  );
}

function StoreButtons() {
  return (
    <div className="actions">
      {STORE_LINKS.appStore ? (
        <a className="btn btn-primary" href={STORE_LINKS.appStore}>
          Download for iPhone
        </a>
      ) : (
        <span className="btn" aria-disabled="true">
          iPhone · coming soon
        </span>
      )}
      {STORE_LINKS.googlePlay ? (
        <a className="btn btn-primary" href={STORE_LINKS.googlePlay}>
          Get it on Google Play
        </a>
      ) : (
        <span className="btn" aria-disabled="true">
          Android · coming soon
        </span>
      )}
      <Link className="btn" href="/camera">
        Try the filters in your browser
      </Link>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <div className="container">
        <section className="hero">
          <p className="eyebrow">Free camera app</p>
          <h1>Beautiful photos. Natural filters.</h1>
          <p className="lead">
            {SITE_NAME} shows subtle, true-to-life filters live in the viewfinder, so you see the photo before you take it. Every
            feature is free — no subscription, no paywall, no watermark.
          </p>
          <StoreButtons />
        </section>

        <Suspense fallback={<GallerySkeleton />}>
          <DailyGallery />
        </Suspense>
      </div>

      <section className="block" aria-labelledby="features">
        <div className="container">
          <h2 id="features">A camera first, editor second</h2>
          <p className="sub">Open the app and you’re ready to shoot. Everything else stays out of the way.</p>
          <div className="grid-3">
            <div className="feature">
              <h3>Live filters on the GPU</h3>
              <p>Filters render in the preview in real time, and the same shader is applied to the full-resolution photo.</p>
            </div>
            <div className="feature">
              <h3>Real camera controls</h3>
              <p>Flash, torch, zoom, exposure, tap to focus, grid, timer and 3:4, 1:1 or 4:5 framing, where your phone supports them.</p>
            </div>
            <div className="feature">
              <h3>Edit any time</h3>
              <p>Change the filter later, adjust brightness, contrast, saturation, highlights, shadows and warmth, crop and rotate, with undo.</p>
            </div>
            <div className="feature">
              <h3>Your original is kept</h3>
              <p>Edits are saved as a new copy. The untouched original stays in the app, so you can always start over.</p>
            </div>
            <div className="feature">
              <h3>Private by design</h3>
              <p>No account and no uploads. Photos are processed on your phone. The app works offline.</p>
            </div>
            <div className="feature">
              <h3>Export your way</h3>
              <p>Save at full resolution, or smaller for sharing, and send straight to any app from the share sheet.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="filters">
        <div className="container">
          <h2 id="filters">Nine filters, all subtle</h2>
          <p className="sub">Each filter has an intensity slider. The colours below are computed with the same maths the app uses.</p>
          <ul className="filters-list">
            {FILTERS.filter((f) => f.id !== "original").map((f) => (
              <li key={f.id}>
                <span className="swatch" style={{ background: swatchGradient(f) }} aria-hidden="true" />
                <span>
                  {f.name}
                  <br />
                  <span className="note" style={{ fontWeight: 400 }}>
                    {FILTER_NOTES[f.id]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="block" aria-labelledby="free">
        <div className="container">
          <h2 id="free">How it stays free</h2>
          <p className="sub">{SITE_NAME} is paid for by a small number of ads, with firm rules about where they can appear.</p>
          <ul className="free-list">
            <li>No subscriptions, in-app purchases, credits or paid filter packs</li>
            <li>No ads on the camera or while you edit</li>
            <li>A banner in the photo grid and settings, and an occasional full-screen ad only after you’ve saved</li>
            <li>No ad ever stands between you and a photo you haven’t saved</li>
            <li>Without a connection there are simply no ads — everything else works</li>
          </ul>
        </div>
      </section>
    </>
  );
}
