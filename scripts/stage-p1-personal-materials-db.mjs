#!/usr/bin/env node
/**
 * P1 database checks for personal materials (isolated test DB only).
 *
 * Requires:
 *   AUDIOLAD_TEST_DATABASE=1
 *   AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1
 *   audiolad_personal_materials_test prepared via personal-materials-p1-setup-test-db.mjs
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  PERSONAL_MATERIALS_TEST_OPT_IN_ENV,
  TEST_DATABASE_ENV,
  assertPersonalMaterialsTestDbAllowed,
  createPersonalMaterialsSqlHelpers,
  describePersonalMaterialsTestTarget,
} from "./lib/personal-materials-test-db.mjs";

const SCRIPT_NAME = "scripts/stage-p1-personal-materials-db.mjs";
const RUN_ID = randomUUID().slice(0, 8);

const bootSkipped =
  process.env[TEST_DATABASE_ENV] !== "1" ||
  process.env[PERSONAL_MATERIALS_TEST_OPT_IN_ENV] !== "1";

if (bootSkipped) {
  console.log(`${SCRIPT_NAME}: skipped (test DB opt-in env not set)`);
  process.exit(0);
}

assertPersonalMaterialsTestDbAllowed({ scriptName: SCRIPT_NAME });
const { sqlFile, sqlScalar, runScript } = createPersonalMaterialsSqlHelpers();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
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

function lastResultLine(output) {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "BEGIN" && line !== "COMMIT" && line !== "ROLLBACK");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.startsWith("{") || line.startsWith("[") || /^-?\d+$/.test(line)) {
      return line;
    }
  }

  return lines.at(-1) ?? "";
}

function withAuthUser(userId, body) {
  return runScript(`
BEGIN;
SELECT set_config('request.jwt.claim.sub', ${sqlLiteral(userId)}, true);
${body}
COMMIT;
`);
}

function rpcAs(userId, fnSql) {
  return lastResultLine(withAuthUser(userId, `${fnSql};`));
}

function rpcJsonAs(userId, fnSql) {
  const raw = rpcAs(userId, `SELECT (${fnSql})::text;`);
  return raw ? JSON.parse(raw) : null;
}

function expectRpcError(userId, fnSql, fragment) {
  try {
    withAuthUser(userId, `${fnSql};`);
    throw new Error(`expected rpc error containing "${fragment}"`);
  } catch (error) {
    const message = String(error?.message ?? error).toLowerCase();
    assert(message.includes(fragment.toLowerCase()), `unexpected rpc error: ${message}`);
  }
}

function createAuthUser(email) {
  const userId = randomUUID();
  sqlFile(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_super_admin
    ) VALUES (
      '${userId}'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      ${sqlLiteral(email)},
      crypt('test-password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      false
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      '${randomUUID()}'::uuid,
      '${userId}'::uuid,
      jsonb_build_object('sub', '${userId}', 'email', ${sqlLiteral(email)}),
      'email',
      ${sqlLiteral(userId)},
      now(), now(), now()
    );
  `);
  return userId;
}

function createProfile(userId, fullName, email) {
  sqlFile(`
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      '${userId}'::uuid,
      ${sqlLiteral(email)},
      ${sqlLiteral(fullName)},
      'listener'
    )
    ON CONFLICT (id) DO NOTHING;
  `);
}

function createAuthor(slug) {
  const authorId = randomUUID();
  sqlFile(`
    INSERT INTO public.authors (id, slug, name, created_at, updated_at)
    VALUES (
      '${authorId}'::uuid,
      ${sqlLiteral(slug)},
      ${sqlLiteral(`PM Test Author ${RUN_ID}`)},
      now(),
      now()
    );
  `);
  return authorId;
}

function addAuthorMember(authorId, userId, role) {
  sqlFile(`
    INSERT INTO public.author_members (author_id, user_id, role, created_at)
    VALUES ('${authorId}'::uuid, '${userId}'::uuid, ${sqlLiteral(role)}, now())
    ON CONFLICT DO NOTHING;
  `);
}

function cleanupFixtures(state) {
  if (!state?.ownerUserId) {
    return;
  }

  if (state.materialId) {
    sqlFile(`
      DELETE FROM public.personal_material_progress
      WHERE personal_material_id = '${state.materialId}'::uuid;

      DELETE FROM public.personal_material_author_notes
      WHERE personal_material_id = '${state.materialId}'::uuid;

      DELETE FROM public.personal_materials
      WHERE id = '${state.materialId}'::uuid;
    `);
  }

  if (state.authorId) {
    sqlFile(`
      DELETE FROM public.author_members
      WHERE author_id = '${state.authorId}'::uuid;

      DELETE FROM public.authors
      WHERE id = '${state.authorId}'::uuid;
    `);
  }

  sqlFile(`
    DELETE FROM public.user_practices
    WHERE user_id IN (
      '${state.ownerUserId}'::uuid,
      '${state.buyerUserId}'::uuid,
      '${state.strangerUserId}'::uuid
    );

    DELETE FROM public.profiles
    WHERE id IN (
      '${state.ownerUserId}'::uuid,
      '${state.buyerUserId}'::uuid,
      '${state.strangerUserId}'::uuid
    );

    DELETE FROM auth.identities
    WHERE user_id IN (
      '${state.ownerUserId}'::uuid,
      '${state.buyerUserId}'::uuid,
      '${state.strangerUserId}'::uuid
    );

    DELETE FROM auth.users
    WHERE id IN (
      '${state.ownerUserId}'::uuid,
      '${state.buyerUserId}'::uuid,
      '${state.strangerUserId}'::uuid
    );
  `);
}

function verifyCleanup(state) {
  if (!state?.ownerUserId) {
    return;
  }

  if (state.materialId) {
    const remainingMaterials = Number(
      sqlScalar(
        `SELECT COUNT(*) FROM public.personal_materials WHERE id='${state.materialId}'::uuid`,
      ),
    );
    assert(remainingMaterials === 0, "cleanup: personal_materials row remains");
  }

  const remainingUsers = Number(
    sqlScalar(
      `SELECT COUNT(*) FROM auth.users WHERE id IN ('${state.ownerUserId}'::uuid, '${state.buyerUserId}'::uuid, '${state.strangerUserId}'::uuid)`,
    ),
  );
  assert(remainingUsers === 0, "cleanup: auth users remain");
}

async function main() {
  const target = describePersonalMaterialsTestTarget();
  console.log(`${SCRIPT_NAME}: run_id=${RUN_ID} target=${target.database}`);

  const state = {
    ownerUserId: null,
    buyerUserId: null,
    strangerUserId: null,
    authorId: null,
    materialId: null,
  };

  try {
    state.ownerUserId = createAuthUser(`pm-owner-${RUN_ID}@audiolad.test`);
    state.buyerUserId = createAuthUser(`pm-buyer-${RUN_ID}@audiolad.test`);
    state.strangerUserId = createAuthUser(`pm-stranger-${RUN_ID}@audiolad.test`);
    createProfile(state.ownerUserId, "Owner Author", `pm-owner-${RUN_ID}@audiolad.test`);
    createProfile(state.buyerUserId, "Buyer Client", `pm-buyer-${RUN_ID}@audiolad.test`);
    createProfile(state.strangerUserId, "Stranger User", `pm-stranger-${RUN_ID}@audiolad.test`);
    state.authorId = createAuthor(`pm-author-${RUN_ID}`);
    addAuthorMember(state.authorId, state.ownerUserId, "owner");

    try {
      runScript(`
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${state.ownerUserId}', true);
INSERT INTO public.personal_materials (
  author_id, created_by, material_type,
  client_first_name, client_last_name, material_date
) VALUES (
  '${state.authorId}'::uuid,
  '${state.ownerUserId}'::uuid,
  'diagnostic',
  'X', 'Y', '2026-07-15'
);
COMMIT;
      `);
      throw new Error("authenticated direct insert must be blocked");
    } catch (error) {
      assert(
        String(error?.message ?? error).toLowerCase().includes("permission"),
        `direct insert blocked: ${error?.message ?? error}`,
      );
    }

    expectRpcError(
      state.strangerUserId,
      `SELECT public.create_personal_material(
        '${state.authorId}'::uuid,
        'Тест', 'Клиент', '2026-07-15'::date
      )`,
      "forbidden",
    );

    const create = rpcJsonAs(
      state.ownerUserId,
      `public.create_personal_material(
        '${state.authorId}'::uuid,
        'Тест', 'Клиент', '2026-07-15'::date,
        'diagnostic', NULL, NULL, NULL,
        'Внутренняя заметка'
      )`,
    );
    assert(create?.material_id, "create draft failed");
    assert(create.status === "draft", "create status draft");
    state.materialId = create.material_id;

    const update = rpcJsonAs(
      state.ownerUserId,
      `public.update_personal_material_draft(
        '${state.materialId}'::uuid,
        'Тест2', 'Клиент2', '2026-07-16'::date,
        'Заголовок', 'Описание', 'Рекомендация', 'Новая заметка'
      )`,
    );
    assert(update?.status === "draft", "update draft status");

    const token1 = generateAccessToken();
    const token2 = generateAccessToken();
    const wrongToken = generateAccessToken();

    sqlFile(`
      UPDATE public.personal_materials
      SET
        audio_path = '${state.authorId}/${state.materialId}/audio/sample.mp3',
        audio_original_filename = 'sample.mp3',
        audio_mime_type = 'audio/mpeg',
        audio_size_bytes = 1024,
        duration_seconds = 120
      WHERE id = '${state.materialId}'::uuid;
    `);

    expectRpcError(
      state.ownerUserId,
      `SELECT public.activate_personal_material('${state.materialId}'::uuid, NULL)`,
      "invalid_token_hash",
    );

    assert(token1.tokenHash.length === 32, "token hash length");
    const activateSql = `public.activate_personal_material(
        '${state.materialId}'::uuid,
        ${tokenHashToPostgresBytea(token1.tokenHash)}
      )`;

    const activate = rpcJsonAs(state.ownerUserId, activateSql);
    assert(activate?.status === "active", "activate status active");

    const rawTokenCount = Number(
      sqlScalar(
        `SELECT COUNT(*) FROM public.personal_materials WHERE id='${state.materialId}'::uuid AND access_token_hash IS NOT NULL`,
      ),
    );
    assert(rawTokenCount === 1, "token hash stored");

    const serverLookup = sqlScalar(
      `SELECT id::text FROM public.personal_materials WHERE access_token_hash=${tokenHashToPostgresBytea(token1.tokenHash)} AND status='active'`,
    );
    assert(serverLookup === state.materialId, "server-side token hash lookup");

    expectRpcError(
      state.buyerUserId,
      `SELECT public.claim_personal_material(${tokenHashToPostgresBytea(wrongToken.tokenHash)})`,
      "material_unavailable",
    );

    const rotate = rpcJsonAs(
      state.ownerUserId,
      `public.rotate_personal_material_access_token(
        '${state.materialId}'::uuid,
        ${tokenHashToPostgresBytea(token2.tokenHash)},
        true
      )`,
    );
    assert(rotate?.guest_access_enabled === true, "rotate keeps guest access");

    expectRpcError(
      state.buyerUserId,
      `SELECT public.claim_personal_material(${tokenHashToPostgresBytea(token1.tokenHash)})`,
      "material_unavailable",
    );

    const claim = rpcJsonAs(
      state.buyerUserId,
      `public.claim_personal_material(${tokenHashToPostgresBytea(token2.tokenHash)})`,
    );
    assert(claim?.claimed === true, "claim succeeded");

    const guestDisabled = sqlScalar(
      `SELECT guest_access_enabled::text FROM public.personal_materials WHERE id='${state.materialId}'::uuid`,
    );
    assert(guestDisabled === "false", "guest access disabled after claim");

    expectRpcError(
      state.strangerUserId,
      `SELECT public.claim_personal_material(${tokenHashToPostgresBytea(token2.tokenHash)})`,
      "material_unavailable",
    );

    const repeatClaim = rpcJsonAs(
      state.buyerUserId,
      `public.claim_personal_material(${tokenHashToPostgresBytea(token2.tokenHash)})`,
    );
    assert(repeatClaim?.claimed === true, "repeat claim idempotent");

    const ownerView = rpcJsonAs(
      state.buyerUserId,
      `public.get_claimed_personal_material('${state.materialId}'::uuid)`,
    );
    assert(ownerView?.author_name, "owner read rpc");
    assert(!("access_token_hash" in ownerView), "owner must not receive token hash");
    assert(!("audio_path" in ownerView), "owner must not receive storage path");
    assert(!("author_notes" in ownerView), "owner must not receive author notes");

    const ownerList = rpcJsonAs(state.buyerUserId, `public.list_claimed_personal_materials()`);
    assert(Array.isArray(ownerList), "owner list is array");
    assert(
      ownerList.some((row) => row.id === state.materialId),
      "owner list contains material",
    );

    const notesForOwner = Number(lastResultLine(
      runScript(`
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${state.buyerUserId}', true);
SELECT COUNT(*) FROM public.personal_material_author_notes
WHERE personal_material_id='${state.materialId}'::uuid;
COMMIT;
      `),
    ));
    assert(notesForOwner === 0, "author notes hidden from owner");

    const notesForAuthor = Number(lastResultLine(
      runScript(`
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${state.ownerUserId}', true);
SELECT COUNT(*) FROM public.personal_material_author_notes
WHERE personal_material_id='${state.materialId}'::uuid;
COMMIT;
      `),
    ));
    assert(notesForAuthor === 1, "author notes visible to author member");

    const progressUpsert = rpcJsonAs(
      state.buyerUserId,
      `public.upsert_personal_material_progress('${state.materialId}'::uuid, 42, false)`,
    );
    assert(progressUpsert?.position_seconds === 42, "progress upsert");

    expectRpcError(
      state.strangerUserId,
      `SELECT public.get_personal_material_progress('${state.materialId}'::uuid)`,
      "not_found",
    );

    const progressRead = rpcJsonAs(
      state.buyerUserId,
      `public.get_personal_material_progress('${state.materialId}'::uuid)`,
    );
    assert(progressRead?.position_seconds === 42, "progress read");

    const revoke = rpcJsonAs(
      state.ownerUserId,
      `public.revoke_personal_material('${state.materialId}'::uuid)`,
    );
    assert(revoke?.status === "revoked", "revoke status");

    const softDelete = rpcJsonAs(
      state.ownerUserId,
      `public.soft_delete_personal_material('${state.materialId}'::uuid)`,
    );
    assert(softDelete?.status === "deleted", "soft delete status");

    expectRpcError(
      state.buyerUserId,
      `SELECT public.get_claimed_personal_material('${state.materialId}'::uuid)`,
      "not_found",
    );

    console.log(`${SCRIPT_NAME}: PASS`);
  } finally {
    cleanupFixtures(state);
    verifyCleanup(state);
    console.log(`${SCRIPT_NAME}: cleanup verified`);
  }
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
