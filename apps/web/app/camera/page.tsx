import type { Metadata } from "next";
import { CameraDemo } from "./CameraDemo";

export const metadata: Metadata = {
  title: "Try the filters",
  description: "Try Lumen’s natural filters live with your webcam or phone camera, right in the browser. Nothing is uploaded.",
  alternates: { canonical: "/camera" },
};

export default function CameraPage() {
  return (
    <div className="container demo">
      <h1>Try the filters</h1>
      <p className="note">
        A browser preview of the app’s filters, using the same shader. The apps add full-resolution capture, flash, zoom, exposure
        and editing, which browsers can’t do reliably.
      </p>
      <CameraDemo />
    </div>
  );
}
