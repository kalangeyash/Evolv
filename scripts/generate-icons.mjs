// Generates EVOLV PWA/app icons from one SVG source. Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const mark = (bg, pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${pad ? "" : 'rx="120"'} fill="${bg}"/>
  <g transform="translate(${256 - (256 - pad) * 1} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M136 152 256 368l120-216" fill="none" stroke="#141a05" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M202 152h108" stroke="#141a05" stroke-width="46" stroke-linecap="round" opacity=".45"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const lime = "#c5f05a";
writeFileSync("src/app/icon.svg", mark(lime));
await sharp(Buffer.from(mark(lime))).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(mark(lime))).resize(512, 512).png().toFile("public/icons/icon-512.png");
// Maskable: full-bleed background with the mark inside the safe zone.
await sharp(Buffer.from(mark(lime, 72))).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
await sharp(Buffer.from(mark(lime, 40))).resize(180, 180).png().toFile("src/app/apple-icon.png");
console.log("icons written");
