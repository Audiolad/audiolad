/**
 * Byte-mode QR, version 5, error correction M.
 * Enough for https://business.audiolad.ru/v/<32 hex> (63 bytes; capacity 84).
 * Quiet zone is added by the sticker, not by this matrix.
 */

const VERSION = 5;
const SIZE = 21 + (VERSION - 1) * 4;
const DATA_CODEWORDS = 86;
const ECC_CODEWORDS = 24;
const BLOCKS = 2;
const DATA_PER_BLOCK = 43;
const REMAINDER_BITS = 7;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

function buildField(): void {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

buildField();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGenerator(ec: number): number[] {
  let poly = [1];
  for (let i = 0; i < ec; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

const GENERATOR = rsGenerator(ECC_CODEWORDS);

function rsRemainder(data: number[]): number[] {
  const out = data.concat(new Array<number>(GENERATOR.length - 1).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const coef = out[i];
    if (!coef) continue;
    for (let j = 1; j < GENERATOR.length; j += 1) {
      out[i + j] ^= mul(GENERATOR[j], coef);
    }
  }
  return out.slice(data.length);
}

function pushBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function encodeData(payload: Uint8Array): number[] {
  const bits: number[] = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, payload.length, 8);
  for (const byte of payload) pushBits(bits, byte, 8);
  const capacity = DATA_CODEWORDS * 8;
  if (bits.length > capacity) {
    throw new Error("venue_licence_qr_too_long");
  }
  const terminator = Math.min(4, capacity - bits.length);
  pushBits(bits, 0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    bytes.push(value);
  }
  const pads = [0xec, 0x11];
  let pad = 0;
  while (bytes.length < DATA_CODEWORDS) {
    bytes.push(pads[pad % 2]);
    pad += 1;
  }
  return bytes;
}

function interleave(data: number[]): number[] {
  const blocks: number[][] = [];
  const ecc: number[][] = [];
  for (let i = 0; i < BLOCKS; i += 1) {
    const block = data.slice(i * DATA_PER_BLOCK, (i + 1) * DATA_PER_BLOCK);
    blocks.push(block);
    ecc.push(rsRemainder(block));
  }
  const out: number[] = [];
  for (let i = 0; i < DATA_PER_BLOCK; i += 1) {
    for (let b = 0; b < BLOCKS; b += 1) out.push(blocks[b][i]);
  }
  for (let i = 0; i < ECC_CODEWORDS; i += 1) {
    for (let b = 0; b < BLOCKS; b += 1) out.push(ecc[b][i]);
  }
  return out;
}

function bytesToBits(bytes: number[]): number[] {
  const bits: number[] = [];
  for (const byte of bytes) pushBits(bits, byte, 8);
  for (let i = 0; i < REMAINDER_BITS; i += 1) bits.push(0);
  return bits;
}

type Grid = { dark: boolean[][]; reserved: boolean[][] };

function grid(): Grid {
  const dark = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const reserved = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  return { dark, reserved };
}

function setModule(g: Grid, row: number, col: number, dark: boolean, reserved = true): void {
  g.dark[row][col] = dark;
  if (reserved) g.reserved[row][col] = true;
}

function finder(g: Grid, row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || x < 0 || y >= SIZE || x >= SIZE) continue;
      const onEdge = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = onEdge && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      setModule(g, y, x, dark);
    }
  }
}

function alignment(g: Grid, row: number, col: number): void {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      setModule(g, row + r, col + c, dark);
    }
  }
}

function functionPatterns(g: Grid): void {
  finder(g, 0, 0);
  finder(g, 0, SIZE - 7);
  finder(g, SIZE - 7, 0);
  alignment(g, 30, 30);
  for (let i = 0; i < SIZE; i += 1) {
    if (!g.reserved[6][i]) setModule(g, 6, i, i % 2 === 0);
    if (!g.reserved[i][6]) setModule(g, i, 6, i % 2 === 0);
  }
  for (let i = 0; i < 9; i += 1) {
    if (!g.reserved[8][i]) g.reserved[8][i] = true;
    if (!g.reserved[i][8]) g.reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    g.reserved[8][SIZE - 1 - i] = true;
    g.reserved[SIZE - 1 - i][8] = true;
  }
  setModule(g, SIZE - 8, 8, true);
}

function placeData(g: Grid, bits: number[]): void {
  let index = 0;
  let upward = true;
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < SIZE; i += 1) {
      const row = upward ? SIZE - 1 - i : i;
      for (let k = 0; k < 2; k += 1) {
        const x = col - k;
        if (g.reserved[row][x]) continue;
        g.dark[row][x] = index < bits.length ? bits[index] === 1 : false;
        index += 1;
      }
    }
    upward = !upward;
  }
}

function maskBit(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number): boolean[][] {
  return g.dark.map((row, y) => row.map((cell, x) => (g.reserved[y][x] ? cell : cell !== maskBit(mask, y, x))));
}

function formatBits(mask: number): number {
  const data = mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

function drawFormat(modules: boolean[][], bits: number): void {
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) modules[8][SIZE - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) modules[SIZE - 15 + i][8] = bit(i);
  modules[SIZE - 8][8] = true;
}

function penalty(modules: boolean[][]): number {
  let score = 0;
  const n = modules.length;
  for (let row = 0; row < n; row += 1) {
    let run = 1;
    for (let col = 1; col < n; col += 1) {
      if (modules[row][col] === modules[row][col - 1]) run += 1;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let col = 0; col < n; col += 1) {
    let run = 1;
    for (let row = 1; row < n; row += 1) {
      if (modules[row][col] === modules[row - 1][col]) run += 1;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  let dark = 0;
  for (const row of modules) {
    for (const cell of row) if (cell) dark += 1;
  }
  score += Math.floor(Math.abs(dark / (n * n) - 0.5) / 0.05) * 10;
  return score;
}

/** Dark modules, row-major, without the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const payload = new TextEncoder().encode(text);
  if (payload.length > 84) throw new Error("venue_licence_qr_too_long");
  const bits = bytesToBits(interleave(encodeData(payload)));
  const base = grid();
  functionPatterns(base);
  placeData(base, bits);
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = applyMask(base, mask);
    drawFormat(modules, formatBits(mask));
    const score = penalty(modules);
    if (score < bestScore) {
      bestScore = score;
      best = modules;
    }
  }
  if (!best) throw new Error("venue_licence_qr_failed");
  return best;
}

export const QR_MATRIX_SIZE = SIZE;
