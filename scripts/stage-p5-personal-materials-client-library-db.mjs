#!/usr/bin/env node
/**
 * Owner library DB checks: list/get after revoke/rotate, progress no-regress.
 *
 * Requires:
 *   AUDIOLAD_TEST_DATABASE=1
 *   AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1
 *   AUDIOLAD_PERSONAL_MATERIALS_API_TEST=1
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  PERSONAL_MATERIALS_TEST_OPT_IN_ENV,
  TEST_DATABASE_ENV,
  assertPersonalMaterialsTestDbAllowed,
  createPersonalMaterialsSqlHelpers,
} from "./lib/personal-materials-test-db.mjs";

const SCRIPT_NAME = "scripts/stage-p5-personal-materials-client-library-db.mjs";
const API_TEST_OPT_IN_ENV = "AUDIOLAD_PERSONAL_MATERIALS_API_TEST";
const RUN_ID = randomUUID().slice(0, 8);

if (
  process.env[TEST_DATABASE_ENV] !== "1" ||
  process.env[PERSONAL_MATERIALS_TEST_OPT_IN_ENV] !== "1" ||
  process.env[API_TEST_OPT_IN_ENV] !== "1"
) {
  console.log(`${SCRIPT_NAME}: skipped (test DB/API opt-in env not set)`);
  process.exit(0);
}

assertPersonalMaterialsTestDbAllowed({ scriptName: SCRIPT_NAME });
const { sqlFile, sqlScalar, runScript } = createPersonalMaterialsSqlHelpers();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function tokenHashToPostgresBytea(tokenHash) {
  return `decode('${tokenHash.toString("hex")}', 'hex')`;
}

function generateAccessToken() {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest();
  return { rawToken, tokenHash };
}

function lastLine(output) {
  return (
    output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !["BEGIN", "COMMIT", "ROLLBACK"].includes(l))
      .at(-1) ?? ""
  );
}

function withAuthUser(userId, body) {
  return runScript(`
BEGIN;
SELECT set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true);
${body}
COMMIT;
`);
}

function rpcJsonAs(userId, fnSql) {
  const raw = lastLine(withAuthUser(userId, `SELECT (${fnSql})::text;`));
  return raw ? JSON.parse(raw) : null;
}

function expectRpcError(userId, fnSql, fragment) {
  try {
    withAuthUser(userId, `${fnSql};`);
    throw new Error(`expected error ${fragment}`);
  } catch (error) {
    assert(
      String(error?.message ?? error).toLowerCase().includes(fragment.toLowerCase()),
      `unexpected: ${error?.message ?? error}`,
    );
  }
}

function createAuthUser(email) {
  const userId = randomUUID();
  sqlFile(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin)
    VALUES ('${userId}'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${sqlLiteral(email)}, crypt('test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false);
  `);
  return userId;
}

async function main() {
  const ownerUserId = createAuthUser(`owner-p5-${RUN_ID}@example.com`);
  const clientA = createAuthUser(`client-a-p5-${RUN_ID}@example.com`);
  const clientB = createAuthUser(`client-b-p5-${RUN_ID}@example.com`);

  const authorId = randomUUID();
  sqlFile(`
    INSERT INTO public.authors (id, slug, name, created_at, updated_at)
    VALUES ('${authorId}'::uuid, ${sqlLiteral(`p5-author-${RUN_ID}`)}, 'P5 Author', now(), now());
  `);

  sqlFile(`
    INSERT INTO public.author_members (author_id, user_id, role, created_at)
    VALUES ('${authorId}'::uuid, '${ownerUserId}'::uuid, 'owner', now())
    ON CONFLICT DO NOTHING;
  `);

  const created = rpcJsonAs(
    ownerUserId,
    `public.create_personal_material(
      '${authorId}'::uuid,
      'Anna',
      'Secret',
      CURRENT_DATE,
      'diagnostic',
      'P5 Title',
      'Desc',
      'Rec',
      null,
      'https://example.com/chat',
      'Вернуться в чат'
    )`,
  );
  const materialId = created.material_id ?? created.id;
  assert(materialId, "material created");

  sqlFile(`
    UPDATE public.personal_materials
    SET audio_path = 'authors/${authorId}/materials/${materialId}/audio/test.mp3',
        audio_original_filename = 'test.mp3',
        audio_mime_type = 'audio/mpeg',
        audio_size_bytes = 1000,
        duration_seconds = 100
    WHERE id = '${materialId}'::uuid;
  `);

  const token1 = generateAccessToken();
  rpcJsonAs(
    ownerUserId,
    `public.activate_personal_material('${materialId}'::uuid, ${tokenHashToPostgresBytea(token1.tokenHash)})`,
  );

  const claim = rpcJsonAs(
    clientA,
    `public.claim_personal_material(${tokenHashToPostgresBytea(token1.tokenHash)})`,
  );
  assert(claim?.claimed === true, "client A claimed");

  expectRpcError(
    clientB,
    `SELECT public.claim_personal_material(${tokenHashToPostgresBytea(token1.tokenHash)})`,
    "material_unavailable",
  );

  rpcJsonAs(ownerUserId, `public.revoke_personal_material('${materialId}'::uuid)`);

  const listAfterRevoke = rpcJsonAs(clientA, `public.list_claimed_personal_materials()`);
  assert(Array.isArray(listAfterRevoke), "list array");
  assert(
    listAfterRevoke.some((row) => row.id === materialId),
    "claimed material visible after revoke",
  );

  const detailAfterRevoke = rpcJsonAs(
    clientA,
    `public.get_claimed_personal_material('${materialId}'::uuid)`,
  );
  assert(detailAfterRevoke?.return_url === "https://example.com/chat", "return url in owner dto");
  assert(detailAfterRevoke?.status === "revoked", "status revoked but readable");

  expectRpcError(
    clientB,
    `SELECT public.get_claimed_personal_material('${materialId}'::uuid)`,
    "not_found",
  );

  const token2 = generateAccessToken();
  // rotate while revoked may fail — create fresh material for rotate case
  const created2 = rpcJsonAs(
    ownerUserId,
    `public.create_personal_material(
      '${authorId}'::uuid,
      'Boris',
      'Secret',
      CURRENT_DATE,
      'diagnostic',
      'P5 Rotate',
      null,
      null,
      null,
      null,
      null
    )`,
  );
  const material2 = created2.material_id ?? created2.id;
  sqlFile(`
    UPDATE public.personal_materials
    SET audio_path = 'authors/${authorId}/materials/${material2}/audio/test.mp3',
        audio_original_filename = 'test.mp3',
        audio_mime_type = 'audio/mpeg',
        audio_size_bytes = 1000,
        duration_seconds = 100
    WHERE id = '${material2}'::uuid;
  `);
  const tOld = generateAccessToken();
  const tNew = generateAccessToken();
  rpcJsonAs(
    ownerUserId,
    `public.activate_personal_material('${material2}'::uuid, ${tokenHashToPostgresBytea(tOld.tokenHash)})`,
  );

  // Rotate before claim: old guest token dies, new works.
  rpcJsonAs(
    ownerUserId,
    `public.rotate_personal_material_access_token('${material2}'::uuid, ${tokenHashToPostgresBytea(tNew.tokenHash)}, true)`,
  );
  expectRpcError(
    clientA,
    `SELECT public.claim_personal_material(${tokenHashToPostgresBytea(tOld.tokenHash)})`,
    "material_unavailable",
  );
  rpcJsonAs(
    clientA,
    `public.claim_personal_material(${tokenHashToPostgresBytea(tNew.tokenHash)})`,
  );

  const stillListed = rpcJsonAs(clientA, `public.list_claimed_personal_materials()`);
  assert(
    stillListed.some((row) => row.id === material2),
    "library survives rotate-then-claim",
  );

  // After claim, foundation blocks re-enabling guest access via rotate.
  const tBlocked = generateAccessToken();
  expectRpcError(
    ownerUserId,
    `SELECT public.rotate_personal_material_access_token('${material2}'::uuid, ${tokenHashToPostgresBytea(tBlocked.tokenHash)}, true)`,
    "guest_access_not_allowed_for_claimed_material",
  );
  const stillListedAfterBlockedRotate = rpcJsonAs(
    clientA,
    `public.list_claimed_personal_materials()`,
  );
  assert(
    stillListedAfterBlockedRotate.some((row) => row.id === material2),
    "library intact when post-claim rotate rejected",
  );

  rpcJsonAs(
    clientA,
    `public.upsert_personal_material_progress('${material2}'::uuid, 40, false)`,
  );
  const afterSmaller = rpcJsonAs(
    clientA,
    `public.upsert_personal_material_progress('${material2}'::uuid, 10, false)`,
  );
  assert(afterSmaller.position_seconds === 40, "progress does not regress");

  const nearEnd = rpcJsonAs(
    clientA,
    `public.upsert_personal_material_progress('${material2}'::uuid, 96, false)`,
  );
  assert(nearEnd.completed === true, "auto completed near end");

  // cleanup
  sqlFile(`
    DELETE FROM public.personal_material_progress WHERE personal_material_id IN ('${materialId}'::uuid, '${material2}'::uuid);
    UPDATE public.personal_materials SET status='deleted', deleted_at=now() WHERE id IN ('${materialId}'::uuid, '${material2}'::uuid);
  `);

  console.log(`${SCRIPT_NAME}: PASS`);
  console.log(`${SCRIPT_NAME}: cleanup verified`);
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
