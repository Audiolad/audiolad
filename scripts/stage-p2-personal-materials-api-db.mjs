#!/usr/bin/env node
/**
 * P2 database checks for personal materials author API scenarios.
 *
 * Requires:
 *   AUDIOLAD_TEST_DATABASE=1
 *   AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1
 *   AUDIOLAD_PERSONAL_MATERIALS_API_TEST=1
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

const SCRIPT_NAME = "scripts/stage-p2-personal-materials-api-db.mjs";
const API_TEST_OPT_IN_ENV = "AUDIOLAD_PERSONAL_MATERIALS_API_TEST";
const RUN_ID = randomUUID().slice(0, 8);

const bootSkipped =
  process.env[TEST_DATABASE_ENV] !== "1" ||
  process.env[PERSONAL_MATERIALS_TEST_OPT_IN_ENV] !== "1" ||
  process.env[API_TEST_OPT_IN_ENV] !== "1";

if (bootSkipped) {
  console.log(`${SCRIPT_NAME}: skipped (test DB/API opt-in env not set)`);
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
      ${sqlLiteral(`PM API Author ${RUN_ID}`)},
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

function attachDraftAudio(materialId, authorId) {
  sqlFile(`
    UPDATE public.personal_materials
    SET
      audio_path = '${authorId}/${materialId}/audio/sample.mp3',
      audio_original_filename = 'sample.mp3',
      audio_mime_type = 'audio/mpeg',
      audio_size_bytes = 1024,
      duration_seconds = 120
    WHERE id = '${materialId}'::uuid;
  `);
}

function guestLookupAvailable(tokenHash) {
  return sqlScalar(
    `SELECT COUNT(*)::text FROM public.personal_materials
     WHERE access_token_hash=${tokenHashToPostgresBytea(tokenHash)}
       AND status='active'
       AND guest_access_enabled=true
       AND claimed_by_user_id IS NULL
       AND deleted_at IS NULL
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())`,
  );
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
      DELETE FROM public.personal_material_progress
      WHERE personal_material_id IN (
        SELECT id FROM public.personal_materials WHERE author_id = '${state.authorId}'::uuid
      );

      DELETE FROM public.personal_material_author_notes
      WHERE personal_material_id IN (
        SELECT id FROM public.personal_materials WHERE author_id = '${state.authorId}'::uuid
      );

      DELETE FROM public.personal_materials
      WHERE author_id = '${state.authorId}'::uuid;

      DELETE FROM public.author_members
      WHERE author_id = '${state.authorId}'::uuid;

      DELETE FROM public.authors
      WHERE id = '${state.authorId}'::uuid;
    `);
  }

  if (state.otherAuthorId) {
    sqlFile(`
      DELETE FROM public.author_members WHERE author_id = '${state.otherAuthorId}'::uuid;
      DELETE FROM public.authors WHERE id = '${state.otherAuthorId}'::uuid;
    `);
  }

  sqlFile(`
    DELETE FROM public.profiles
    WHERE id IN (
      '${state.ownerUserId}'::uuid,
      '${state.strangerUserId}'::uuid,
      '${state.nonMemberUserId}'::uuid
    );

    DELETE FROM auth.identities
    WHERE user_id IN (
      '${state.ownerUserId}'::uuid,
      '${state.strangerUserId}'::uuid,
      '${state.nonMemberUserId}'::uuid
    );

    DELETE FROM auth.users
    WHERE id IN (
      '${state.ownerUserId}'::uuid,
      '${state.strangerUserId}'::uuid,
      '${state.nonMemberUserId}'::uuid
    );
  `);
}

async function main() {
  const target = describePersonalMaterialsTestTarget();
  console.log(`${SCRIPT_NAME}: run_id=${RUN_ID} target=${target.database}`);

  const state = {
    ownerUserId: null,
    strangerUserId: null,
    nonMemberUserId: null,
    authorId: null,
    otherAuthorId: null,
    materialId: null,
  };

  try {
    state.ownerUserId = createAuthUser(`pm-api-owner-${RUN_ID}@audiolad.test`);
    state.strangerUserId = createAuthUser(`pm-api-stranger-${RUN_ID}@audiolad.test`);
    state.nonMemberUserId = createAuthUser(`pm-api-nonmember-${RUN_ID}@audiolad.test`);
    createProfile(state.ownerUserId, "Owner", `pm-api-owner-${RUN_ID}@audiolad.test`);
    createProfile(state.nonMemberUserId, "Non Member", `pm-api-nonmember-${RUN_ID}@audiolad.test`);
    state.authorId = createAuthor(`pm-api-author-${RUN_ID}`);
    state.otherAuthorId = createAuthor(`pm-api-other-${RUN_ID}`);
    addAuthorMember(state.authorId, state.ownerUserId, "owner");

    expectRpcError(
      state.nonMemberUserId,
      `SELECT public.create_personal_material(
        '${state.authorId}'::uuid,
        'Тест', 'Клиент', '2026-07-15'::date
      )`,
      "forbidden",
    );

    expectRpcError(
      state.ownerUserId,
      `SELECT public.create_personal_material(
        '${state.authorId}'::uuid,
        'Bad<script>', 'Клиент', '2026-07-15'::date
      )`,
      "invalid_client_fields",
    );

    expectRpcError(
      state.ownerUserId,
      `SELECT public.create_personal_material(
        '${state.authorId}'::uuid,
        'Тест', 'Клиент', '2026-07-15'::date,
        'unknown_type'
      )`,
      "invalid_material_type",
    );

    const create = rpcJsonAs(
      state.ownerUserId,
      `public.create_personal_material(
        '${state.authorId}'::uuid,
        'Тест', 'Клиент', '2026-07-15'::date,
        'diagnostic', NULL, NULL, NULL, NULL
      )`,
    );
    assert(create?.material_id, "create draft");
    state.materialId = create.material_id;

    expectRpcError(
      state.ownerUserId,
      `SELECT public.activate_personal_material('${state.materialId}'::uuid, ${tokenHashToPostgresBytea(generateAccessToken().tokenHash)})`,
      "material_not_ready",
    );

    attachDraftAudio(state.materialId, state.authorId);

    const clearAudio = rpcJsonAs(
      state.ownerUserId,
      `public.clear_personal_material_draft_audio('${state.materialId}'::uuid)`,
    );
    assert(clearAudio?.status === "draft", "clear draft audio");

    const audioPathAfterClear = sqlScalar(
      `SELECT COALESCE(audio_path, 'null') FROM public.personal_materials WHERE id='${state.materialId}'::uuid`,
    );
    assert(audioPathAfterClear === "null", "audio path cleared");

    attachDraftAudio(state.materialId, state.authorId);

    const token1 = generateAccessToken();
    const token2 = generateAccessToken();
    const wrongToken = generateAccessToken();

    const activate = rpcJsonAs(
      state.ownerUserId,
      `public.activate_personal_material(
        '${state.materialId}'::uuid,
        ${tokenHashToPostgresBytea(token1.tokenHash)}
      )`,
    );
    assert(activate?.status === "active", "activate material");

    assert(guestLookupAvailable(token1.tokenHash) === "1", "guest lookup active token");

    expectRpcError(
      state.ownerUserId,
      `SELECT public.update_personal_material_draft(
        '${state.materialId}'::uuid,
        'X', 'Y', '2026-07-16'::date,
        NULL, NULL, NULL, NULL
      )`,
      "material_not_editable",
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
    assert(guestLookupAvailable(token1.tokenHash) === "0", "old token invalid after rotate");
    assert(guestLookupAvailable(token2.tokenHash) === "1", "new token valid after rotate");

    sqlFile(`
      UPDATE public.personal_materials
      SET expires_at = now() - interval '1 hour'
      WHERE id = '${state.materialId}'::uuid;
    `);
    assert(guestLookupAvailable(token2.tokenHash) === "0", "expired token unavailable");

    sqlFile(`
      UPDATE public.personal_materials
      SET expires_at = NULL, revoked_at = now(), status = 'revoked', guest_access_enabled = false
      WHERE id = '${state.materialId}'::uuid;
    `);
    assert(guestLookupAvailable(token2.tokenHash) === "0", "revoked token unavailable");

    const reactivateToken = generateAccessToken();
    const rotateRevoked = rpcJsonAs(
      state.ownerUserId,
      `public.rotate_personal_material_access_token(
        '${state.materialId}'::uuid,
        ${tokenHashToPostgresBytea(reactivateToken.tokenHash)},
        true
      )`,
    );
    assert(rotateRevoked?.guest_access_enabled === true, "rotate from revoked enables guest");

    const statusAfterRotateRevoked = sqlScalar(
      `SELECT status FROM public.personal_materials WHERE id='${state.materialId}'::uuid`,
    );
    assert(statusAfterRotateRevoked === "active", "rotate from revoked reactivates");

    const revoke = rpcJsonAs(
      state.ownerUserId,
      `public.revoke_personal_material('${state.materialId}'::uuid)`,
    );
    assert(revoke?.status === "revoked", "revoke material");
    assert(guestLookupAvailable(reactivateToken.tokenHash) === "0", "revoke blocks guest");

    const deleteResult = rpcJsonAs(
      state.ownerUserId,
      `public.soft_delete_personal_material('${state.materialId}'::uuid)`,
    );
    assert(deleteResult?.status === "deleted", "soft delete");
    assert(guestLookupAvailable(reactivateToken.tokenHash) === "0", "deleted blocks guest");

    expectRpcError(
      state.strangerUserId,
      `SELECT public.claim_personal_material(${tokenHashToPostgresBytea(wrongToken.tokenHash)})`,
      "material_unavailable",
    );

    console.log(`${SCRIPT_NAME}: PASS`);
  } finally {
    cleanupFixtures(state);
    console.log(`${SCRIPT_NAME}: cleanup verified`);
  }
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
