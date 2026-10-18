import { ImageResponse } from "next/og";
import { FILTERS } from "@lumen/core";
import { swatchGradient } from "@/lib/swatch";

export const alt = "Lumen — Beautiful photos. Natural filters. Free forever.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const swatches = FILTERS.filter((f) => f.id !== "original").map(swatchGradient);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0b0c", color: "#f4f2ee", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: "radial-gradient(circle at 35% 35%, #ffe2a3, #f2b84b 55%, #b46f12)" }} />
          Lumen
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          <span>Beautiful photos.</span>
          <span>Natural filters.</span>
          <span style={{ color: "#f2b84b" }}>Free forever.</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {swatches.map((bg, i) => (
            <div key={i} style={{ width: 100, height: 60, borderRadius: 12, backgroundImage: bg }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
