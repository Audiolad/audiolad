#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testRoutes() {
  const listPage = read("src/app/(listener)/(library)/my-materials/page.tsx");
  const detailPage = read("src/app/(listener)/(library)/my-materials/[id]/page.tsx");
  const listApi = read("src/app/api/my-materials/route.ts");
  const detailApi = read("src/app/api/my-materials/[id]/route.ts");
  const audioApi = read("src/app/api/my-materials/[id]/audio/route.ts");
  const progressApi = read("src/app/api/my-materials/[id]/progress/route.ts");
  const migration = read(
    "supabase/migrations/20260720190000_personal_materials_owner_library.sql",
  );

  assert(listPage.includes("listMyPersonalMaterials"), "list server fetch");
  assert(listPage.includes("Мои материалы"), "list title");
  assert(detailPage.includes("MyMaterialDetailClient"), "detail client");
  assert(detailPage.includes("notFound"), "neutral not found");
  assert(listApi.includes("unauthorized"), "list auth");
  assert(detailApi.includes("getMyPersonalMaterial"), "detail ownership");
  assert(audioApi.includes("createOwnerAudioSignedUrl"), "owner audio");
  assert(!audioApi.includes("findGuestMaterialByRawToken"), "audio no guest token");
  assert(progressApi.includes("upsert_personal_material_progress") || progressApi.includes("saveMyPersonalMaterialProgress"), "progress save");
  assert(migration.includes("return_url"), "owner dto return url");
  assert(migration.includes("claimed_at"), "list sort claimed_at");
  assert(migration.includes("v_position < v_existing.position_seconds"), "no regress");
}

function testUiAndNav() {
  const card = read("src/components/personal-materials/library/MyMaterialCard.tsx");
  const list = read("src/components/personal-materials/library/MyMaterialsList.tsx");
  const detail = read("src/components/personal-materials/library/MyMaterialDetailClient.tsx");
  const nav = read("src/lib/navigation/listener-nav.ts");
  const auth = read("src/lib/auth/routes.ts");
  const player = read("src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx");
  const robots = read("src/app/robots.ts");
  const profile = read("src/components/profile/ProfileSections.tsx");

  assert(card.includes("Открыть"), "card cta");
  assert(card.includes("break-words"), "overflow");
  assert(list.includes("У вас пока нет персональных материалов"), "empty");
  assert(detail.includes("progressMode=\"server\""), "server progress mode");
  assert(detail.includes("mergeGuestAndServerProgress"), "guest migrate");
  assert(detail.includes("PersonalMaterialReturnChatCta"), "return cta reuse");
  assert(detail.includes("clearPersonalMaterialGuestProgress"), "clear local");
  assert(!detail.includes("dangerouslySetInnerHTML"), "plain text");
  assert(!detail.includes("synced &&"), "player mounts without sync gate");
  assert(nav.includes('title: "Мои материалы"'), "sidebar nav");
  assert(auth.includes('"/my-materials"'), "private route");
  assert(player.includes('progressMode === "server"'), "player server mode");
  assert(player.includes("visibilitychange"), "visibility save");
  assert(robots.includes('"/my-materials/"'), "robots disallow");
  assert(profile.includes("/my-materials"), "profile quick link");
}

function testSecurity() {
  const dto = read("src/lib/personal-materials/client-library/mappers.ts");
  const audio = read("src/lib/personal-materials/client-library/audio.ts");
  const api = read("src/lib/personal-materials/client-library/api.ts");

  assert(dto.includes("hasAudio || hasPdf"), "availability audio or pdf");
  assert(!dto.includes("audio_path"), "dto no path");
  assert(audio.includes("claimed_by_user_id"), "owner check");
  assert(audio.includes("signedUrlTtlSeconds"), "ttl");
  assert(!api.includes("console.log"), "no api logs");
}

async function main() {
  testRoutes();
  testUiAndNav();
  testSecurity();
  const output = execSync(
    `npx --yes tsx ${path.join(ROOT, "scripts/stage-p5-personal-materials-client-library-module-unit.mjs")}`,
    { encoding: "utf8" },
  );
  process.stdout.write(output);
  console.log("stage-p5-personal-materials-client-library-unit: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
