#!/usr/bin/env node
/**
 * P2 static/unit checks for personal materials author + guest API.
 * Safe without database (file + module checks).
 *
 * Optional tsx module checks run when tsx is available.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testAuthorRoutes() {
  const listRoute = read("src/app/api/author/personal-materials/route.ts");
  const itemRoute = read("src/app/api/author/personal-materials/[id]/route.ts");
  const audioRoute = read("src/app/api/author/personal-materials/[id]/audio/route.ts");
  const activateRoute = read("src/app/api/author/personal-materials/[id]/activate/route.ts");
  const rotateRoute = read("src/app/api/author/personal-materials/[id]/rotate/route.ts");
  const revokeRoute = read("src/app/api/author/personal-materials/[id]/revoke/route.ts");

  assert(listRoute.includes("requireAuthorMaterialListAccess"), "list route membership");
  assert(listRoute.includes("toSafeAuthorPersonalMaterialDto"), "list route safe dto");
  assert(!listRoute.includes("access_token_hash"), "list route no token hash");

  assert(itemRoute.includes("requirePersonalMaterialAccess"), "item route access");
  assert(itemRoute.includes("assertAuthorEditable"), "patch editable after activate");
  assert(itemRoute.includes("softDeletePersonalMaterial"), "delete soft delete");
  assert(itemRoute.includes("removePersonalMaterialStorageFiles"), "delete storage cleanup");

  assert(audioRoute.includes("uploadPersonalMaterialAudio"), "audio upload helper");
  assert(audioRoute.includes("deletePersonalMaterialAudio"), "audio delete helper");
  assert(audioRoute.includes("assertAuthorEditable"), "audio editable after activate");
  assert(audioRoute.includes("createAuthorAudioSignedUrl"), "author audio GET signed url");
  assert(audioRoute.includes("export async function GET"), "author audio GET");
  assert(!audioRoute.includes("audio_path"), "audio route no path leak");

  assert(activateRoute.includes("assertDraftEditable"), "activate still draft-only");
  assert(activateRoute.includes("generateAccessToken"), "activate generates token");
  assert(activateRoute.includes("privateNoStoreHeaders"), "activate no-store");
  assert(activateRoute.includes("buildPersonalMaterialAccessUrl"), "activate access url");
  assert(activateRoute.includes("accessUrl:"), "activate returns accessUrl");
  assert(!activateRoute.includes("tokenHashHex"), "activate no hash hex in response");
  assert(!activateRoute.includes("access_token_hash"), "activate no db hash field in response");

  assert(rotateRoute.includes("rotatePersonalMaterialAccessToken"), "rotate rpc");
  assert(rotateRoute.includes("privateNoStoreHeaders"), "rotate no-store");

  assert(revokeRoute.includes("revokePersonalMaterial"), "revoke rpc");
}

function testGuestRoutes() {
  const metaRoute = read("src/app/api/d/[token]/route.ts");
  const audioRoute = read("src/app/api/d/[token]/audio/route.ts");

  assert(metaRoute.includes("findGuestMaterialByRawToken"), "guest metadata lookup");
  assert(metaRoute.includes("guestNotAvailableResponse"), "neutral 404");
  assert(metaRoute.includes("guestPrivacyHeaders"), "privacy headers");
  assert(metaRoute.includes("enforceGuestMetadataRateLimit"), "metadata rate limit");
  assert(metaRoute.includes("logGuestRouteAccess"), "redacted logging");

  assert(audioRoute.includes("createGuestAudioSignedUrl"), "signed url helper");
  assert(audioRoute.includes("enforceGuestAudioRateLimit"), "audio rate limit");
  assert(!audioRoute.includes("audio_path"), "guest audio no path leak");
}

function testServerLayer() {
  const dto = read("src/lib/personal-materials/server/dto.ts");
  const delivery = read("src/lib/personal-materials/server/delivery.ts");
  const uploads = read("src/lib/personal-materials/server/uploads.ts");
  const rateLimit = read("src/lib/personal-materials/server/rate-limit.ts");
  const auth = read("src/lib/personal-materials/server/auth.ts");
  const clearMigration = read(
    "supabase/migrations/20260720143000_personal_materials_clear_draft_audio.sql",
  );

  assert(!dto.includes("access_token_hash"), "dto excludes hash");
  assert(!dto.includes("audio_path:"), "author dto excludes audio path field");
  assert(dto.includes("hasAudio: row.audio_path"), "hasAudio derived without exposing path");
  assert(dto.includes("clientFirstName"), "guest dto client first name");
  assert(dto.includes("clientLastName: input.material.client_last_name"), "guest dto last name for prefills");

  assert(delivery.includes("redactTokenFromPath"), "token redaction helper");
  assert(delivery.includes("hashAccessToken"), "server-side hash");
  assert(delivery.includes("createSignedUrl"), "signed url creation");
  assert(!delivery.includes("console.log(rawToken"), "no raw token logging");

  assert(uploads.includes("createServiceRoleClient"), "upload uses service role");
  assert(uploads.includes("PERSONAL_MATERIALS_BUCKET"), "private bucket");
  assert(uploads.includes("isAllowedMp3File"), "mp3 validation");
  assert(uploads.includes("clearPersonalMaterialDraftAudio"), "clear audio rpc");

  assert(rateLimit.includes("pm-guest:"), "guest rate limit prefix");
  assert(!rateLimit.includes("rawToken"), "rate limit no raw token");
  assert(rateLimit.includes("Retry-After"), "429 retry-after");

  assert(auth.includes("author_members"), "membership check");
  assert(auth.includes('membership.role !== "owner"'), "owner/editor roles");

  assert(clearMigration.includes("clear_personal_material_draft_audio"), "clear audio rpc");
  assert(clearMigration.includes("material_not_editable"), "draft-only guard");
}

function testSecurityHeaders() {
  const errors = read("src/lib/personal-materials/server/errors.ts");
  assert(errors.includes("MATERIAL_NOT_AVAILABLE"), "neutral guest error code");
  assert(errors.includes("X-Robots-Tag"), "robots header");
  assert(errors.includes("Referrer-Policy"), "referrer policy");
}

async function testModuleImports() {
  try {
    const { execSync } = await import("node:child_process");
    execSync("npx --yes tsx --version", { stdio: "ignore" });
  } catch {
    console.log("stage-p2-personal-materials-api-unit: tsx unavailable, skipping module imports");
    return;
  }

  const { execSync } = await import("node:child_process");
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/stage-p2-personal-materials-api-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
}

async function main() {
  testAuthorRoutes();
  testGuestRoutes();
  testServerLayer();
  testSecurityHeaders();
  await testModuleImports();
  console.log("stage-p2-personal-materials-api-unit: PASS");
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
