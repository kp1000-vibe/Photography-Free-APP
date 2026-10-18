import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description: `Help with ${SITE_NAME}: camera access, saving photos, ads and privacy.`,
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <article className="container prose">
      <h1>Support</h1>

      <h2>The camera shows a black screen or asks for access</h2>
      <p>
        {SITE_NAME} needs camera access. On iPhone go to <em>Settings → {SITE_NAME} → Camera</em>. On Android go to{" "}
        <em>Settings → Apps → {SITE_NAME} → Permissions → Camera</em>. If another app is using the camera, close it and reopen {SITE_NAME}.
      </p>

      <h2>My photo didn’t save to Photos</h2>
      <p>
        {SITE_NAME} always keeps the photo inside the app, in the photo grid. To also save to your library, allow Photos access (on iPhone,
        “Add Photos Only” is enough), then open the photo and tap <em>Save</em>.
      </p>

      <h2>Can I change the filter after taking a photo?</h2>
      <p>
        Yes. Open the photo from the grid. The original is kept, so you can change the filter, adjust it, crop or rotate, and save a new
        copy as many times as you like.
      </p>

      <h2>Why are there ads?</h2>
      <p>
        Ads pay for {SITE_NAME} so every feature can stay free. They never appear on the camera or while you edit. You can change ad
        privacy choices in <em>Settings → Ad privacy choices</em> (where available). See the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Does it work offline?</h2>
      <p>Yes. Taking, editing and saving photos never needs a connection. Without one, no ads are shown.</p>

      <h2>Contact</h2>
      <p>
        {SUPPORT_EMAIL ? (
          <>
            Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and include your phone model and what happened.
          </>
        ) : (
          <>A support email address will be listed here before the apps launch.</>
        )}
      </p>
    </article>
  );
}
