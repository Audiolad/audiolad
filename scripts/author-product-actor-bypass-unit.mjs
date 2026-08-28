#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function testActorHelperUsesRoleNotAuthorHardcode() {
  const moderation = read("src/lib/author-products/moderation.ts");
  const actor = read("src/lib/author-products/moderation-actor.ts");
  assert.match(actor, /export async function actorCanBypassProductModeration/);
  assert.match(actor, /author_products\.moderate/);
  assert.match(actor, /getAuthorCanBypassProductModeration/);
  assert.doesNotMatch(actor, /Орий/);
  assert.doesNotMatch(actor, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
  assert.doesNotMatch(moderation, /Орий/);
  assert.doesNotMatch(moderation, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);

  assert.match(
    actor,
    /userId\s*\n\s*\? await actorCanBypassProductModeration/,
  );
  assert.match(
    moderation,
    /options\?\.canBypass/,
  );
  assert.match(
    actor,
    /export async function assertPracticePublicContentEditableForActor/,
  );
}

function testAuthWorkspaceORsActorPermission() {
  const auth = read("src/lib/author-products/auth.ts");
  assert.match(auth, /author_products\.moderate/);
  assert.match(
    auth,
    /author\.can_bypass_product_moderation === true \|\| actorCanBypass/,
  );
}

function testPublishPassesActingUser() {
  const publish = read("src/app/api/author/products/[id]/publish/route.ts");
  assert.match(publish, /assertPublishModerationAllowed\(/);
  assert.match(publish, /user\.id/);
}

function testAudioAddUsesActorGuard() {
  const audio = read("src/app/api/author/products/[id]/audio/route.ts");
  assert.match(audio, /assertPracticePublicContentEditableForActor/);
  assert.match(audio, /user\.id/);
  assert.doesNotMatch(audio, /length\s*[<>=]{1,2}\s*2/);
  assert.doesNotMatch(audio, /max.*2/i);
}

function testFormUnlocksPublishedAddForBypass() {
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  assert.match(
    form,
    /canBypassProductModeration && \(isPublished \|\| isUnpublished\)/,
  );
  assert.match(form, /Добавить аудио/);
  assert.match(form, /Отправить на модерацию/);
  assert.match(form, /isDraft && !canBypassProductModeration/);
}

function testUploadPublishesItemOnPublishedProduct() {
  const upload = read(
    "src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts",
  );
  assert.match(
    upload,
    /status: practice\.status === "published" \? "published" : "draft"/,
  );
}

function testSqlActorBypassNoAuthorSeed() {
  const sql = read(
    "supabase/migrations/20260819120000_actor_bypass_product_moderation.sql",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.actor_can_bypass_product_moderation/);
  assert.match(sql, /author_products\.moderate/);
  assert.match(sql, /author_can_bypass_product_moderation/);
  assert.match(sql, /publish-audio-product:v10/);
  assert.match(sql, /guard_audio_items_published_immutable/);
  assert.doesNotMatch(sql, /UPDATE\s+public\.authors/i);
  assert.doesNotMatch(sql, /Орий/);
  const uuids = sql.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  );
  assert.equal(uuids, null, "actor bypass migration must not seed author UUIDs");
}

function testNoArtificialTwoTrackLimit() {
  const limits = read("src/lib/author-products/limits.ts");
  assert.doesNotMatch(limits, /MAX_AUDIO_ITEMS|MAX_TRACKS|maxTracks/);
  const publish = read("src/lib/author-products/publish.ts");
  assert.match(publish, /audioItems\.length === 0/);
  assert.match(publish, /audio_post_requires_single_audio/);
  assert.doesNotMatch(publish, /audioItems\.length\s*>\s*2/);
}

testActorHelperUsesRoleNotAuthorHardcode();
testAuthWorkspaceORsActorPermission();
testPublishPassesActingUser();
testAudioAddUsesActorGuard();
testFormUnlocksPublishedAddForBypass();
testUploadPublishesItemOnPublishedProduct();
testSqlActorBypassNoAuthorSeed();
testNoArtificialTwoTrackLimit();

console.log("author-product-actor-bypass-unit: ok");
