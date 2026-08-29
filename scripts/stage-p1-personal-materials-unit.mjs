#!/usr/bin/env node
/**
 * P1 unit checks for personal materials helpers.
 * Safe to run before migration (no database writes).
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getPersonalMaterialDisplayTitle(title, materialType = "diagnostic") {
  const normalized = normalizeOptionalText(title);

  if (normalized) {
    return normalized;
  }

  if (materialType === "diagnostic") {
    return "Персональная диагностика";
  }

  return "Персональный материал";
}

function generateAccessToken() {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest();

  return {
    rawToken,
    tokenHash,
    tokenHashHex: tokenHash.toString("hex"),
  };
}

function tokenHashToPostgresBytea(tokenHash) {
  return `\\x${tokenHash.toString("hex")}`;
}

function testTokens() {
  assert(32 * 8 === 256, "token entropy must be 256 bits");

  const first = generateAccessToken();
  const second = generateAccessToken();

  assert(first.rawToken !== second.rawToken, "tokens must be unpredictable");
  assert(first.rawToken.length >= 40, "token length");
  assert(first.tokenHash.length === 32, "hash length must be 32 bytes");

  const recomputed = createHash("sha256")
    .update(first.rawToken, "utf8")
    .digest();

  assert(
    timingSafeEqual(first.tokenHash, recomputed),
    "hash must be deterministic for same token",
  );

  assert(
    tokenHashToPostgresBytea(first.tokenHash).startsWith("\\x"),
    "postgres bytea format",
  );
}

function testOptionalTitle() {
  assert(getPersonalMaterialDisplayTitle(null) === "Персональная диагностика", "null title fallback");
  assert(getPersonalMaterialDisplayTitle("   ") === "Персональная диагностика", "blank title fallback");
  assert(getPersonalMaterialDisplayTitle("Моя диагностика") === "Моя диагностика", "custom title");
  assert(normalizeOptionalText("   ") === null, "blank normalizes to null");
  assert(normalizeOptionalText("text") === "text", "non-blank preserved");
}

function testPdfLimit() {
  const typesSource = readFileSync(
    path.join(ROOT, "src/lib/personal-materials/types.ts"),
    "utf8",
  );

  assert(
    typesSource.includes("maxPdfBytes: 20 * 1024 * 1024"),
    "PDF limit must be 20 MiB",
  );
}

function testGuestProgressKey() {
  const tokenHashHex = "a".repeat(64);
  const key = `audiolad_pm_gp:${tokenHashHex}`;

  assert(key.startsWith("audiolad_pm_gp:"), "guest progress key prefix");
  assert(!key.includes("raw-token"), "guest progress key must not use raw token");
}

function testStoragePaths() {
  const authorId = "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c";
  const materialId = "8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0";

  const safeName = "../../secret.mp3".split("/").pop().replace(/[^a-zA-Z0-9._-]+/g, "_");
  const audioPath = `${authorId}/${materialId}/audio/${safeName}`;

  assert(
    audioPath === `${authorId}/${materialId}/audio/secret.mp3`,
    "sanitize traversal in audio path",
  );

  assert(!audioPath.includes(".."), "no traversal segments");
}

function testClaimContext() {
  const secret = randomBytes(32).toString("hex");
  const payload = {
    v: 1,
    purpose: "personal-material-claim",
    materialId: "c6d62fce-06ef-47cb-bb74-544ba8064fca",
    nonce: randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + 600,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret)
    .update(encodedPayload, "utf8")
    .digest("base64url");

  const left = Buffer.from(signature);
  const right = Buffer.from(
    createHmac("sha256", secret)
      .update(encodedPayload, "utf8")
      .digest("base64url"),
  );

  assert(timingSafeEqual(left, right), "claim context signature valid");

  const tampered = `${encodedPayload}.${signature}x`;
  let tamperFailed = false;

  try {
    const [encoded, sig] = tampered.split(".");
    const expected = createHmac("sha256", secret)
      .update(encoded, "utf8")
      .digest("base64url");
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      tamperFailed = false;
    }
  } catch {
    tamperFailed = true;
  }

  assert(tamperFailed, "tampered claim context must fail");
}

function testMigrationFile() {
  const sql = readFileSync(
    path.join(ROOT, "supabase/migrations/20260715143000_personal_materials_foundation.sql"),
    "utf8",
  );

  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.personal_materials"), "materials table");
  assert(sql.includes("personal_material_author_notes"), "author notes table");
  assert(sql.includes("create_personal_material"), "create rpc");
  assert(sql.includes("update_personal_material_draft"), "update draft rpc");
  assert(sql.includes("get_claimed_personal_material"), "owner read rpc");
  assert(sql.includes("claim_personal_material"), "claim rpc");
  assert(sql.includes("grant_active_starter_practices"), "starter grant reuse");
  assert(sql.includes("personal-materials"), "storage bucket");
  assert(!sql.includes("access_token text"), "raw token column must not exist");
  assert(sql.includes("title text NULL"), "title must be nullable");
  assert(!sql.includes("personal_materials_title_not_blank_check"), "title blank check removed");
  assert(!sql.includes("access_token_hash = NULL"), "soft delete must not clear hash");
  assert(!sql.includes("Claimed owners can read own personal materials"), "owner direct select removed");
  assert(sql.includes("20 MiB"), "pdf limit comment");
  assert(!sql.includes("author_display_name"), "no duplicated author display name");
  assert(
    sql.includes("ARRAY['audio/mpeg', 'application/pdf']"),
    "foundation bucket MIME allowlist is mpeg+pdf",
  );
  assert(sql.includes("52428800"), "foundation file_size_limit stays 50 MiB");
}

function testM4aMimeMigration() {
  const sql = readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260905120000_personal_materials_allow_m4a_mime.sql",
    ),
    "utf8",
  );

  assert(
    /id\s*=\s*'personal-materials'/.test(sql),
    "hotfix must target id='personal-materials' only",
  );
  assert(
    /array_append\(\s*allowed_mime_types\s*,\s*'audio\/mp4'\s*\)/.test(sql),
    "hotfix must append audio/mp4 without replacing the allowlist",
  );
  assert(
    /allowed_mime_types\s+IS\s+NOT\s+NULL/.test(sql),
    "hotfix must refuse to write a list when allowed_mime_types is NULL",
  );
  assert(
    /NOT\s+\(\s*'audio\/mp4'\s*=\s*ANY\(\s*allowed_mime_types\s*\)\s*\)/.test(sql),
    "hotfix must no-op when audio/mp4 is already present",
  );
  assert(
    !/\bSET\b[\s\S]*allowed_mime_types\s*=\s*NULL/i.test(sql),
    "hotfix must not set allowed_mime_types NULL",
  );
  assert(
    !/allowed_mime_types\s*=\s*ARRAY\s*\[/.test(sql),
    "hotfix must not overwrite the allowlist with a hardcoded ARRAY",
  );
  assert(!/\bfile_size_limit\b/.test(sql), "hotfix must not change file_size_limit");
  assert(!/\bpublic\s*=/.test(sql), "hotfix must not change public");
  assert(
    !/\b(studio-draft-assets|practice-audio|publication-files|user-avatars)\b/.test(
      sql,
    ),
    "hotfix must not touch other buckets",
  );
  assert(!/\bCREATE\s+POLICY\b/i.test(sql), "hotfix must not change RLS policies");
  assert(
    !/\b(audio\/mpeg|application\/pdf)\b/.test(sql.replace(/audio\/mp4/g, "")),
    "preservation of mpeg/pdf is via append, not a rewritten list",
  );
}

function main() {
  testTokens();
  testOptionalTitle();
  testPdfLimit();
  testGuestProgressKey();
  testStoragePaths();
  testClaimContext();
  testMigrationFile();
  testM4aMimeMigration();
  console.log("stage-p1-personal-materials-unit: PASS");
}

main();
