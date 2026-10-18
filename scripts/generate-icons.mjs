// Generates Lumen's app icons from SVG. Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import path from "node:path";

const out = path.resolve("apps/mobile/assets");
const disc = (cx, cy, r) => `
  <defs><radialGradient id="g" cx="0.38" cy="0.36" r="0.7">
    <stop offset="0" stop-color="#ffe2a3"/><stop offset="0.55" stop-color="#f2b84b"/><stop offset="1" stop-color="#b46f12"/>
  </radialGradient></defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)"/>`;
const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);

const jobs = [
  ["icon.png", 1024, `<rect width="1024" height="1024" fill="#0b0b0c"/>${disc(512, 512, 290)}`],
  ["splash-icon.png", 1024, disc(512, 512, 300)],
  ["android-icon-foreground.png", 1024, disc(512, 512, 230)],
  ["android-icon-background.png", 1024, `<rect width="1024" height="1024" fill="#0b0b0c"/>`],
  ["android-icon-monochrome.png", 1024, `<circle cx="512" cy="512" r="230" fill="#000"/>`],
  ["favicon.png", 48, `<rect width="48" height="48" rx="10" fill="#0b0b0c"/>${disc(24, 24, 14)}`],
];
for (const [name, size, body] of jobs) {
  await sharp(svg(size, body)).png().toFile(path.join(out, name));
  console.log("wrote", name);
}
