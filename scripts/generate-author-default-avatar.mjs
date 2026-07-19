#!/usr/bin/env node
/**
 * Build public/brand/author-default-avatar.png from the official icon mark.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = "public/brand/author-default-avatar.png";
const LOGO_SOURCE = "public/icon-512.png";
const SIZE = 512;
const LOGO_SCALE = 0.42;
const LOGO_COLOR = { r: 88, g: 50, b: 160 }; // #5832A0 — brand dark purple

async function createGradientBackground(size) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F4EEFF" />
          <stop offset="100%" stop-color="#E8DAFF" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#bg)" />
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createLogoLayer(size) {
  const logoSize = Math.round(size * LOGO_SCALE);
  const { data, info } = await sharp(LOGO_SOURCE)
    .ensureAlpha()
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data.length);

  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = info.channels === 4 ? data[index + 3] : 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    // Keep light logo strokes from the official icon; drop the dark purple field.
    const logoAlpha =
      alpha > 16 && luminance > 150
        ? Math.min(255, Math.round(((luminance - 150) / 105) * alpha))
        : 0;

    pixels[index] = LOGO_COLOR.r;
    pixels[index + 1] = LOGO_COLOR.g;
    pixels[index + 2] = LOGO_COLOR.b;
    pixels[index + 3] = logoAlpha;
  }

  return sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function main() {
  const [background, logo] = await Promise.all([
    createGradientBackground(SIZE),
    createLogoLayer(SIZE),
  ]);

  const logoMeta = await sharp(logo).metadata();
  const left = Math.round((SIZE - (logoMeta.width ?? 0)) / 2);
  const top = Math.round((SIZE - (logoMeta.height ?? 0)) / 2);

  const output = await sharp(background)
    .composite([{ input: logo, left, top }])
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  writeFileSync(OUT, output);

  const meta = await sharp(OUT).metadata();
  console.log(
    JSON.stringify(
      {
        path: OUT,
        bytes: output.length,
        width: meta.width,
        height: meta.height,
        format: meta.format,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
