import { qrMatrix } from "./qr";

/**
 * Print sticker for one venue. Wording is taken from the approved Business
 * landing and the venue-licence document, not written as a new legal claim.
 * Each call encodes that venue's public licence URL in the QR.
 */

export const STICKER_HEADLINE = "Музыка для вашего бизнеса – быстро, просто, легально";

export const STICKER_SCOPE = "на публичное исполнение музыки каталога АудиоЛад в заведении";

export const STICKER_BRAND = "АудиоЛад Бизнес";

export const STICKER_CAPTION = "Страница лицензии кофейни";

export type StickerFormat = "square80" | "a6";

type Box = {
  id: StickerFormat;
  pageWidth: number;
  pageHeight: number;
  trimWidth: number;
  trimHeight: number;
  bleed: number;
};

const BOXES: Record<StickerFormat, Box> = {
  square80: { id: "square80", pageWidth: 86, pageHeight: 86, trimWidth: 80, trimHeight: 80, bleed: 3 },
  a6: { id: "a6", pageWidth: 111, pageHeight: 154, trimWidth: 105, trimHeight: 148, bleed: 3 },
};

const INK = "#2b1d14";
const COFFEE = "#6f4326";
const CREAM = "#f7f1e8";
const MUTED = "#6b5848";
const BRASS = "#b8904f";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrap(text: string, fontMm: number, widthMm: number): string[] {
  const max = Math.max(8, Math.floor(widthMm / (fontMm * 0.56)));
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(lines: string[], x: number, y: number, fontMm: number, fill: string, weight = "600"): string {
  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : fontMm * 1.25}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" text-anchor="middle" fill="${fill}" font-family="Noto Serif, Liberation Serif, Georgia, serif" font-size="${fontMm}" font-weight="${weight}">${tspans}</text>`;
}

function cropMarks(box: Box): string {
  const x0 = box.bleed;
  const y0 = box.bleed;
  const x1 = box.bleed + box.trimWidth;
  const y1 = box.bleed + box.trimHeight;
  const len = box.bleed - 0.4;
  const stroke = 0.18;
  const marks = [
    [x0, 0.3, x0, len],
    [0.3, y0, len, y0],
    [x1, 0.3, x1, len],
    [box.pageWidth - len, y0, box.pageWidth - 0.3, y0],
    [x0, box.pageHeight - len, x0, box.pageHeight - 0.3],
    [0.3, y1, len, y1],
    [x1, box.pageHeight - len, x1, box.pageHeight - 0.3],
    [box.pageWidth - len, y1, box.pageWidth - 0.3, y1],
  ];
  return marks
    .map(([x1m, y1m, x2m, y2m]) => `<line x1="${x1m}" y1="${y1m}" x2="${x2m}" y2="${y2m}" stroke="${INK}" stroke-width="${stroke}"/>`)
    .join("");
}

function qrSvg(url: string, x: number, y: number, size: number): string {
  const matrix = qrMatrix(url);
  const quiet = 4;
  const cells = matrix.length + quiet * 2;
  const cell = size / cells;
  // A small overlap keeps neighbouring modules from opening a white gap when a printer rasterises the SVG.
  const overlap = cell * 0.12;
  const parts = [`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff"/>`];
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      if (!matrix[row][col]) continue;
      const mx = x + (col + quiet) * cell;
      const my = y + (row + quiet) * cell;
      parts.push(`<rect x="${mx}" y="${my}" width="${cell + overlap}" height="${cell + overlap}" fill="${INK}"/>`);
    }
  }
  return parts.join("");
}

export function renderVenueStickerSvg(input: {
  publicUrl: string;
  format: StickerFormat;
  logoHref?: string | null;
}): string {
  const box = BOXES[input.format];
  const inset = box.bleed + (input.format === "a6" ? 8 : 5);
  const innerWidth = box.pageWidth - inset * 2;
  const center = box.pageWidth / 2;
  const logo = input.format === "a6" ? 22 : 12;
  const headlineSize = input.format === "a6" ? 5.2 : 3.05;
  const scopeSize = input.format === "a6" ? 3.4 : 2.2;
  const brandSize = input.format === "a6" ? 4.2 : 2.7;
  const captionSize = input.format === "a6" ? 3.2 : 2.15;
  const qrSize = input.format === "a6" ? 52 : 24;
  let y = inset + 1;
  const chunks: string[] = [];
  chunks.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box.pageWidth}mm" height="${box.pageHeight}mm" viewBox="0 0 ${box.pageWidth} ${box.pageHeight}">`,
  );
  chunks.push(`<rect width="${box.pageWidth}" height="${box.pageHeight}" fill="${COFFEE}"/>`);
  chunks.push(cropMarks(box));
  const panelX = box.bleed + 2.2;
  const panelY = box.bleed + 2.2;
  const panelW = box.trimWidth - 4.4;
  const panelH = box.trimHeight - 4.4;
  chunks.push(
    `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="3.2" fill="${CREAM}"/>`,
  );
  chunks.push(`<rect x="${panelX + 1.2}" y="${panelY + 1.2}" width="${panelW - 2.4}" height="${panelH - 2.4}" rx="2.4" fill="none" stroke="${BRASS}" stroke-width="0.35"/>`);
  if (input.logoHref) {
    const logoX = center - logo / 2;
    chunks.push(
      `<image href="${escapeXml(input.logoHref)}" x="${logoX}" y="${y}" width="${logo}" height="${logo}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }
  y += logo + (input.format === "a6" ? 6 : 3.4);
  chunks.push(textBlock([STICKER_BRAND], center, y, brandSize, COFFEE, "700"));
  y += brandSize + (input.format === "a6" ? 5 : 2.6);
  const headline = wrap(STICKER_HEADLINE, headlineSize, innerWidth);
  chunks.push(textBlock(headline, center, y, headlineSize, INK, "700"));
  y += headline.length * headlineSize * 1.25 + (input.format === "a6" ? 3 : 1.6);
  const scope = wrap(STICKER_SCOPE, scopeSize, innerWidth);
  chunks.push(textBlock(scope, center, y, scopeSize, MUTED, "500"));
  y += scope.length * scopeSize * 1.25 + (input.format === "a6" ? 6 : 2.4);
  const qrX = center - qrSize / 2;
  chunks.push(qrSvg(input.publicUrl, qrX, y, qrSize));
  y += qrSize + (input.format === "a6" ? 6 : 3.2);
  chunks.push(textBlock([STICKER_CAPTION], center, y, captionSize, MUTED, "500"));
  chunks.push("</svg>");
  return chunks.join("");
}

export function stickerPageSizeMm(format: StickerFormat): { width: number; height: number } {
  const box = BOXES[format];
  return { width: box.pageWidth, height: box.pageHeight };
}
