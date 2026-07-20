/**
 * PR3.3 storage smoke against private test bucket playlist-covers-test.
 * Does NOT touch production bucket playlist-covers (must remain absent).
 *
 * Run:
 *   PLAYLIST_COVERS_BUCKET=playlist-covers-test \
 *   npx --yes tsx scripts/playlists-pr3-3-storage-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  buildPlaylistCoverStoragePath,
  createPlaylistCoverSignedUrl,
  PLAYLIST_COVERS_BUCKET,
  removePlaylistCoverObject,
} from "../src/lib/playlists/covers.ts";
import { processPlaylistCoverImage } from "../src/lib/playlists/cover-image.ts";
import {
  bootstrapDataWriteScript,
  assertProjectEnvLocalSafeForFixtures,
} from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/playlists-pr3-3-storage-smoke.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "fixtures/playlist-covers");

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      }
    }
  } catch {
    // optional
  }
}

loadEnvFile("/var/www/audiolad/.env.local");
assertProjectEnvLocalSafeForFixtures({ envPath: "/var/www/audiolad/.env.local" });
loadEnvFile("/var/www/audiolad-deploy/shared/.env.production");

async function main() {
  assert(
    PLAYLIST_COVERS_BUCKET === "playlist-covers-test",
    `expected playlist-covers-test, got ${PLAYLIST_COVERS_BUCKET}`,
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && serviceKey, "missing supabase env");

  const storage = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure prod bucket still absent
  const { data: buckets } = await storage.storage.listBuckets();
  const names = (buckets ?? []).map((b) => b.name);
  assert(!names.includes("playlist-covers"), "production playlist-covers must not exist");
  assert(names.includes("playlist-covers-test"), "test bucket missing");

  const userId = randomUUID();
  const playlistId = randomUUID();
  const path1 = buildPlaylistCoverStoragePath(userId, playlistId);
  const path2 = buildPlaylistCoverStoragePath(userId, playlistId);

  const jpg = readFileSync(join(fixtures, "landscape.jpg"));
  const processed = await processPlaylistCoverImage(jpg, "image/jpeg");
  assert(processed.ok, "process jpg");

  const { error: up1 } = await storage.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .upload(path1, processed.buffer, {
      contentType: "image/webp",
      upsert: false,
    });
  assert(!up1, `upload1 failed: ${up1?.message}`);

  const signed1 = await createPlaylistCoverSignedUrl(storage, path1, {
    userId,
    playlistId,
  });
  assert(signed1 && signed1.includes("token="), "signed url");

  const png = readFileSync(join(fixtures, "portrait.png"));
  const processed2 = await processPlaylistCoverImage(png, "image/png");
  assert(processed2.ok, "process png");

  const { error: up2 } = await storage.storage
    .from(PLAYLIST_COVERS_BUCKET)
    .upload(path2, processed2.buffer, {
      contentType: "image/webp",
      upsert: false,
    });
  assert(!up2, `upload2 failed: ${up2?.message}`);

  // cleanup old then new (simulate replace)
  const rm1 = await removePlaylistCoverObject(storage, path1, userId, playlistId);
  assert(rm1.ok, `remove1 ${rm1.error}`);
  const rm2 = await removePlaylistCoverObject(storage, path2, userId, playlistId);
  assert(rm2.ok, `remove2 ${rm2.error}`);

  // foreign path rejected
  const foreign = await removePlaylistCoverObject(
    storage,
    path1,
    randomUUID(),
    playlistId,
  );
  assert(!foreign.ok && foreign.error === "invalid_path", "foreign path blocked");

  console.log("PR3_3_STORAGE_SMOKE_PASS");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
