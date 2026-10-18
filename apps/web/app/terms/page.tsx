import type { Metadata } from "next";
import Link from "next/link";
import { LAST_UPDATED, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using ${SITE_NAME}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="container prose">
      <h1>Terms of use</h1>
      <p className="meta">Last updated {LAST_UPDATED}</p>

      <h2>Using {SITE_NAME}</h2>
      <p>
        {SITE_NAME} is provided free of charge. You may use the apps and this website for personal and commercial photography, subject to
        these terms and the terms of the app store you downloaded the app from.
      </p>

      <h2>Your photos</h2>
      <p>
        You own the photos you take and edit with {SITE_NAME}. We claim no rights to them and never receive them. You are responsible for
        the photos you take and share, including respecting other people’s privacy and rights.
      </p>

      <h2>Free, with ads</h2>
      <p>
        All features are free. {SITE_NAME} shows ads to cover its costs. We will not lock existing features behind payments; if that ever
        changed, it would only apply to new optional features and would be announced in advance.
      </p>

      <h2>Acceptable use</h2>
      <p>Don’t reverse engineer the apps to interfere with ads or other users, or use {SITE_NAME} to break the law.</p>

      <h2>Gallery photos</h2>
      <p>
        Photos in the website’s daily gallery are by Unsplash contributors, credited on each photo, and used under the{" "}
        <a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">
          Unsplash License
        </a>
        . They are not part of the app.
      </p>

      <h2>No warranty</h2>
      <p>
        {SITE_NAME} is provided “as is”. Camera features depend on your device, and we can’t guarantee every feature works on every phone.
        Keep backups of photos that matter to you. To the extent the law allows, we are not liable for lost photos or indirect damages.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms and will change the date above when we do. Continuing to use {SITE_NAME} means you accept the update.</p>

      <p>
        See also the <Link href="/privacy">privacy policy</Link>.
      </p>
    </article>
  );
}
