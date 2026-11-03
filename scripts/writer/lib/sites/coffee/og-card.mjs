// Text card for a coffee guide (own artwork, not a photo): og:image and JSON-LD image, 1200×630 JPEG.
// Rendered from SVG with sharp (already a site dependency), so no Python or Pillow is needed.
// Usage: node og-card.mjs <slug> "<H1 title>" [out_dir]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const OG_W = 1200;
export const OG_H = 630;
const BG = "#2a1a10"; // --guide-espresso
const INK = "#fff8ef"; // --guide-accent-ink
const GOLD = "#c4a574"; // --guide-gold
const MUTED = "#d6c4ac";
const SERIF = "'Noto Serif', 'DejaVu Serif', 'Liberation Serif', serif";
const SANS = "'Noto Sans', 'DejaVu Sans', 'Liberation Sans', sans-serif";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy wrap by an average glyph width (bold serif Cyrillic ≈ 0.58 em). */
export function wrapTitle(title, size, width = OG_W - 160) {
  const max = Math.max(8, Math.floor(width / (size * 0.58)));
  const lines = [];
  let line = "";
  for (const word of title.split(/\s+/).filter(Boolean)) {
    const probe = line ? `${line} ${word}` : word;
    if (probe.length <= max || !line) line = probe;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function ogCardSvg(title) {
  let size = 72;
  let lines = wrapTitle(title, size);
  while (lines.length > 4 && size > 44) {
    size -= 4;
    lines = wrapTitle(title, size);
  }
  const step = Math.round(size * 1.22);
  const text = lines
    .map((l, i) => `<text x="80" y="${150 + size + i * step}" font-family="${SERIF}" font-weight="700" font-size="${size}" fill="${INK}">${esc(l)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
<rect width="${OG_W}" height="${OG_H}" fill="${BG}"/><rect width="14" height="${OG_H}" fill="${GOLD}"/>
<text x="80" y="100" font-family="${SANS}" font-weight="600" font-size="30" fill="${GOLD}">АудиоЛад Кофейни</text>
${text}
<line x1="80" y1="${OG_H - 110}" x2="260" y2="${OG_H - 110}" stroke="${GOLD}" stroke-width="3"/>
<text x="80" y="${OG_H - 62}" font-family="${SANS}" font-size="28" fill="${MUTED}">Кофейня: открытие и работа</text>
</svg>`;
}

/** Writes <outDir>/<slug>.jpg and returns its path. */
export async function renderOgCard(slug, title, outDir) {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${slug}.jpg`);
  await sharp(Buffer.from(ogCardSvg(title))).jpeg({ quality: 86, progressive: true, mozjpeg: true }).toFile(file);
  return file;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [slug, title, outDir = "public/images/b/coffee/og"] = process.argv.slice(2);
  if (!slug || !title) {
    console.error('usage: node og-card.mjs <slug> "<title>" [out_dir]');
    process.exit(2);
  }
  console.log(await renderOgCard(slug, title, outDir));
}
