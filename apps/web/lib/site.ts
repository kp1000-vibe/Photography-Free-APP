export const SITE_NAME = "Lumen";
export const TAGLINE = "Beautiful photos. Natural filters. Free forever.";
export const DESCRIPTION =
  "Lumen is a free camera app for iPhone and Android with natural, live filters and a simple editor. No subscription, no paywall, no watermark — supported by a few unobtrusive ads.";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Store links appear only once the apps are actually published. */
export const STORE_LINKS = {
  appStore: process.env.NEXT_PUBLIC_APP_STORE_URL || null,
  googlePlay: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null,
};

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null;

export const LAST_UPDATED = "18 October 2026";
