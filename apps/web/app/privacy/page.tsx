import type { Metadata } from "next";
import Link from "next/link";
import { LAST_UPDATED, SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${SITE_NAME} handles your photos and data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="container prose">
      <h1>Privacy policy</h1>
      <p className="meta">Last updated {LAST_UPDATED}</p>

      <p>
        {SITE_NAME} is a camera and photo-editing app. This policy explains what happens to your information when you use the{" "}
        {SITE_NAME} apps for iOS and Android and this website.
      </p>

      <h2>Your photos stay on your device</h2>
      <p>
        Photos you take or edit are processed entirely on your phone. {SITE_NAME} does not upload, store or look at your photos on any
        server. The app keeps a private copy of each original inside its own storage so you can re-edit it later. Removing a photo in
        the app deletes those copies. Photos you save to your photo library are managed by your phone’s Photos app.
      </p>

      <h2>No account, no analytics</h2>
      <p>
        {SITE_NAME} has no sign-up or account. We do not run our own analytics, crash reporting or tracking in the app.
      </p>

      <h2>Permissions</h2>
      <ul>
        <li>
          <strong>Camera</strong> — to show the live preview and take photos.
        </li>
        <li>
          <strong>Photos (add only, or limited)</strong> — to save your edited photos and to open a photo you choose for editing.
        </li>
        <li>
          <strong>Tracking (iOS only, optional)</strong> — lets the ad provider personalise ads. {SITE_NAME} works the same if you decline.
        </li>
      </ul>
      <p>The app does not request microphone or location access.</p>

      <h2>Advertising</h2>
      <p>
        {SITE_NAME} is free and is paid for by ads served by Google AdMob. Ads appear only in the photo grid and settings, and occasionally
        after you finish saving a photo. To show and measure ads, Google may collect information such as your device’s advertising
        identifier, IP address, device and app information, and ad interactions. This is governed by{" "}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
          Google’s policy on how it uses information from partner apps
        </a>
        .
      </p>
      <p>
        Where the law requires consent (for example in the European Economic Area, the United Kingdom and Switzerland), the app asks
        before ads are requested, using Google’s consent tools. You can change your choice at any time in the app under{" "}
        <em>Settings → Ad privacy choices</em>. If you decline personalised ads or tracking, you may still see non-personalised ads.
        On iOS you can also change tracking in <em>Settings → Privacy &amp; Security → Tracking</em>; on Android you can reset or delete
        your advertising ID in your device settings.
      </p>

      <h2>Children</h2>
      <p>
        {SITE_NAME} is not directed at children under 13 (or the equivalent minimum age in your country), and we do not knowingly collect
        their information.
      </p>

      <h2>This website</h2>
      <p>
        This website does not use cookies or analytics. It is hosted by Vercel, which processes standard server logs (such as IP address
        and browser type) to deliver the site securely. The <Link href="/camera">in-browser filter demo</Link> processes your camera
        video locally in the browser; it is never sent to us. The daily photo gallery shows photos from Unsplash via Lorem Picsum, loaded
        through this site so your browser does not contact those services directly.
      </p>

      <h2>Your rights</h2>
      <p>
        Because we do not hold personal data about you, there is usually nothing for us to access, correct or delete. For data collected
        by Google for advertising, use the controls above or contact Google. You may have additional rights under laws such as the GDPR or
        CCPA; contact us if you have questions.
      </p>

      <h2>Changes</h2>
      <p>We will update this page if our practices change, and change the date above.</p>

      <h2>Contact</h2>
      <p>
        {SUPPORT_EMAIL ? (
          <>
            Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </>
        ) : (
          <>
            See the <Link href="/support">support page</Link>.
          </>
        )}
      </p>
    </article>
  );
}
