#!/usr/bin/env node
/**
 * P1 database checks for personal materials.
 *
 * IMPORTANT:
 * - Run ONLY after migration 20260715143000_personal_materials_foundation.sql
 *   is applied to a non-production database.
 * - Do NOT run against production without explicit approval.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  bootstrapDataWriteScript,
  assertProjectEnvLocalSafeForFixtures,
} from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/stage-p1-personal-materials-db.mjs";
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

function loadEnv() {
  assertProjectEnvLocalSafeForFixtures({ envPath: "/var/www/audiolad/.env.local" });
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function tokenHashToPostgresBytea(tokenHash) {
  return `\\x${tokenHash.toString("hex")}`;
}

function generateAccessToken() {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest();
  return { rawToken, tokenHash };
}

async function getSession(env, email) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const { data } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  return {
    userId: data.session.user.id,
    admin,
    authed: createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    ),
  };
}

async function main() {
  const env = loadEnv();
  const owner = await getSession(env, "1@audiolad.ru");
  const buyerEmail = `p1-buyer-${randomUUID()}@audiolad.test`;
  const buyer = await getSession(env, buyerEmail);

  const { data: author } = await owner.admin
    .from("authors")
    .select("id, name")
    .eq("slug", "sergey-and-zoya")
    .maybeSingle();

  assert(author?.id, "author workspace required");

  const directInsert = await owner.authed.from("personal_materials").insert({
    author_id: author.id,
    created_by: owner.userId,
    material_type: "diagnostic",
    client_first_name: "X",
    client_last_name: "Y",
    material_date: "2026-07-15",
  });

  assert(directInsert.error, "authenticated direct insert must be blocked");

  const create = await owner.authed.rpc("create_personal_material", {
    p_author_id: author.id,
    p_client_first_name: "Тест",
    p_client_last_name: "Клиент",
    p_material_date: "2026-07-15",
    p_title: null,
    p_description: null,
    p_personal_recommendation: null,
    p_author_notes: "Внутренняя заметка",
  });

  assert(!create.error, `create failed: ${create.error?.message}`);
  const materialId = create.data.material_id;

  const token = generateAccessToken();

  await owner.admin
    .from("personal_materials")
    .update({
      audio_path: `${author.id}/${materialId}/audio/sample.mp3`,
      audio_original_filename: "sample.mp3",
      audio_mime_type: "audio/mpeg",
      audio_size_bytes: 1024,
      duration_seconds: 120,
    })
    .eq("id", materialId);

  const activate = await owner.authed.rpc("activate_personal_material", {
    p_material_id: materialId,
    p_access_token_hash: tokenHashToPostgresBytea(token.tokenHash),
  });

  assert(!activate.error, `activate without title failed: ${activate.error?.message}`);

  const claim = await buyer.authed.rpc("claim_personal_material", {
    p_access_token_hash: tokenHashToPostgresBytea(token.tokenHash),
  });

  assert(!claim.error, `claim failed: ${claim.error?.message}`);

  const ownerDirectSelect = await buyer.authed
    .from("personal_materials")
    .select("access_token_hash, audio_path")
    .eq("id", materialId);

  assert(
    ownerDirectSelect.error || (ownerDirectSelect.data ?? []).length === 0,
    "owner direct select blocked",
  );

  const ownerView = await buyer.authed.rpc("get_claimed_personal_material", {
    p_material_id: materialId,
  });

  assert(!ownerView.error, `owner read rpc failed: ${ownerView.error?.message}`);
  assert(ownerView.data.author_name === author.name, "author name from authors table");
  assert(!("access_token_hash" in ownerView.data), "owner must not receive token hash");
  assert(!("audio_path" in ownerView.data), "owner must not receive storage path");
  assert(!("author_notes" in ownerView.data), "owner must not receive author notes");

  const notesForOwner = await buyer.authed
    .from("personal_material_author_notes")
    .select("author_notes")
    .eq("personal_material_id", materialId);

  assert(
    notesForOwner.error || (notesForOwner.data ?? []).length === 0,
    "author notes hidden from owner",
  );

  const notesForAuthor = await owner.authed
    .from("personal_material_author_notes")
    .select("author_notes")
    .eq("personal_material_id", materialId)
    .maybeSingle();

  assert(
    notesForAuthor.data?.author_notes === "Внутренняя заметка",
    "author notes visible to author member",
  );

  const softDelete = await owner.authed.rpc("soft_delete_personal_material", {
    p_material_id: materialId,
  });

  assert(!softDelete.error, `soft delete failed: ${softDelete.error?.message}`);

  const { data: afterDelete } = await owner.admin
    .from("personal_materials")
    .select("access_token_hash, status, guest_access_enabled")
    .eq("id", materialId)
    .maybeSingle();

  assert(afterDelete?.access_token_hash, "soft delete preserves token hash");
  assert(afterDelete?.status === "deleted", "soft delete status");
  assert(afterDelete?.guest_access_enabled === false, "soft delete disables guest access");

  const deletedClaim = await buyer.authed.rpc("claim_personal_material", {
    p_access_token_hash: tokenHashToPostgresBytea(token.tokenHash),
  });

  assert(deletedClaim.error, "deleted material claim blocked");

  const deletedOwnerView = await buyer.authed.rpc("get_claimed_personal_material", {
    p_material_id: materialId,
  });

  assert(deletedOwnerView.error, "deleted material hidden from owner list/read");

  console.log("stage-p1-personal-materials-db: PASS");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
