import sharp from "sharp";

function randomSeed(seed) {
  let value = seed >>> 0;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export async function createNoisyGradientSquare(size = 1254) {
  const rand = randomSeed(size * 97);
  const pixels = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 3;
      const gradient = x / size;
      const noise = rand();
      pixels[index] = Math.round(40 + gradient * 180 + noise * 35);
      pixels[index + 1] = Math.round(20 + (1 - gradient) * 120 + noise * 25);
      pixels[index + 2] = Math.round(90 + gradient * 80 + noise * 40);
    }
  }

  return sharp(pixels, {
    raw: { width: size, height: size, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function createBannerFixture(width = 2400, height = 800) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7042c5"/>
          <stop offset="100%" stop-color="#f7d2c8"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="420" cy="400" r="180" fill="#ffffff55"/>
      <rect x="980" y="180" width="520" height="440" rx="48" fill="#25135c88"/>
      <polygon points="1800,120 2100,680 1500,680" fill="#ffffff33"/>
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

export async function createAvatarPortrait(size = 900) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#efe4fb"/>
      <circle cx="${size / 2}" cy="${Math.round(size * 0.38)}" r="${Math.round(size * 0.18)}" fill="#7042c5"/>
      <ellipse cx="${size / 2}" cy="${Math.round(size * 0.78)}" rx="${Math.round(size * 0.28)}" ry="${Math.round(size * 0.22)}" fill="#9a74d8"/>
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

export async function createPngWithAlpha(size = 640) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="#7042c5cc"/>
      <rect x="${size * 0.18}" y="${size * 0.18}" width="${size * 0.64}" height="${size * 0.64}" fill="#f7d2c866"/>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createExifOrientedLandscape() {
  return sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 30, g: 120, b: 210 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

export function savingsPercent(sourceBytes, variantBytes) {
  if (sourceBytes <= 0) {
    return 0;
  }

  return Math.round((1 - variantBytes / sourceBytes) * 100);
}
