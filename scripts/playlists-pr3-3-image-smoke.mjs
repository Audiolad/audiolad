/**
 * PR3.3 image processing + path helpers smoke.
 * Run: node --experimental-strip-types is not needed; use tsx:
 *   npx --yes tsx scripts/playlists-pr3-3-image-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  buildPlaylistCoverStoragePath,
  isValidPlaylistCoverPath,
  PLAYLIST_COVER_OUTPUT_SIZE,
} from "../src/lib/playlists/covers.ts";
import { processPlaylistCoverImage } from "../src/lib/playlists/cover-image.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "fixtures/playlist-covers");

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

async function expectOk(file, declared) {
  const buf = readFileSync(join(fixtures, file));
  const result = await processPlaylistCoverImage(buf, declared);
  assert(result.ok, `${file} should process ok, got ${JSON.stringify(result)}`);
  assert(result.width === PLAYLIST_COVER_OUTPUT_SIZE, "width");
  assert(result.height === PLAYLIST_COVER_OUTPUT_SIZE, "height");
  assert(result.contentType === "image/webp", "webp");
  const meta = await sharp(result.buffer).metadata();
  assert(meta.format === "webp", "meta webp");
  assert(!meta.orientation, "orientation stripped");
  assert(meta.width === 1200 && meta.height === 1200, "meta size");
  return result;
}

async function expectFail(file, declared, code) {
  const buf = readFileSync(join(fixtures, file));
  const result = await processPlaylistCoverImage(buf, declared);
  assert(!result.ok, `${file} should fail`);
  assert(result.code === code, `${file} expected ${code} got ${result.code}`);
}

async function main() {
  await expectOk("landscape.jpg", "image/jpeg");
  await expectOk("portrait.png", "image/png");
  await expectOk("square.webp", "image/webp");
  await expectOk("exif-orient.jpg", "image/jpeg");

  await expectFail("fake-jpeg.jpg", "image/jpeg", "invalid_file_type");
  await expectFail("tiny.gif", "image/gif", "invalid_file_type");
  await expectFail("icon.svg", "image/svg+xml", "invalid_file_type");
  await expectFail("corrupt.webp", "image/webp", "corrupt_image");

  // oversized
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 10, 0xff);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  const big = await processPlaylistCoverImage(oversized, "image/jpeg");
  assert(!big.ok && big.code === "invalid_file_size", "oversized");

  // MIME spoof: PNG bytes with jpeg declared
  const png = readFileSync(join(fixtures, "portrait.png"));
  const spoof = await processPlaylistCoverImage(png, "image/jpeg");
  assert(!spoof.ok && spoof.code === "invalid_file_type", "mime spoof");

  const userId = "11111111-1111-4111-8111-111111111111";
  const playlistId = "22222222-2222-4222-8222-222222222222";
  const path = buildPlaylistCoverStoragePath(userId, playlistId);
  assert(isValidPlaylistCoverPath(path, userId, playlistId), "valid path");
  assert(!isValidPlaylistCoverPath("../etc/passwd"), "reject traversal");
  assert(
    !isValidPlaylistCoverPath(`${userId}/${playlistId}/../../x.webp`),
    "reject nested traversal",
  );
  assert(
    !isValidPlaylistCoverPath(
      path,
      "33333333-3333-4333-8333-333333333333",
      playlistId,
    ),
    "reject wrong user",
  );

  console.log("PR3_3_IMAGE_SMOKE_PASS");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
