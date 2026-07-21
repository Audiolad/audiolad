#!/usr/bin/env node
/**
 * Return URL field checks for personal materials (isolated test DB).
 *
 * Requires:
 *   AUDIOLAD_TEST_DATABASE=1
 *   AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1
 *   AUDIOLAD_PERSONAL_MATERIALS_API_TEST=1
 */
import { randomUUID } from "node:crypto";

import {
  PERSONAL_MATERIALS_TEST_OPT_IN_ENV,
  TEST_DATABASE_ENV,
  assertPersonalMaterialsTestDbAllowed,
  createPersonalMaterialsSqlHelpers,
} from "./lib/personal-materials-test-db.mjs";

const SCRIPT_NAME = "scripts/stage-p3-personal-materials-return-url-db.mjs";
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
  return `'${String(value).replace(/'/g, "''")}'`;
}

function lastLine(output) {
  return output.split("\n").filter(Boolean).at(-1) ?? "";
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
    throw new Error(`expected rpc error containing "${fragment}"`);
  } catch (error) {
    assert(
      String(error?.message ?? error).toLowerCase().includes(fragment.toLowerCase()),
      `unexpected rpc error: ${error?.message ?? error}`,
    );
  }
}

function createAuthUser(email) {
  const userId = randomUUID();
  sqlFile(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin)
    VALUES ('${userId}'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${sqlLiteral(email)}, crypt('test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false);
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ('${randomUUID()}'::uuid, '${userId}'::uuid, jsonb_build_object('sub', '${userId}', 'email', ${sqlLiteral(email)}), 'email', ${sqlLiteral(userId)}, now(), now(), now());
  `);
  return userId;
}

function createAuthor() {
  const authorId = randomUUID();
  sqlFile(`
    INSERT INTO public.authors (id, slug, name, created_at, updated_at)
    VALUES ('${authorId}'::uuid, ${sqlLiteral(`pm-return-${RUN_ID}`)}, 'Return Test Author', now(), now());
  `);
  return authorId;
}

function addMember(authorId, userId) {
  sqlFile(`
    INSERT INTO public.author_members (author_id, user_id, role, created_at)
    VALUES ('${authorId}'::uuid, '${userId}'::uuid, 'owner', now());
  `);
}

const state = { userId: null, authorId: null, materialId: null };

try {
  state.userId = createAuthUser(`pm-return-${RUN_ID}@test.local`);
  state.authorId = createAuthor();
  addMember(state.authorId, state.userId);

  const create = rpcJsonAs(
    state.userId,
    `public.create_personal_material('${state.authorId}'::uuid, 'Anna', 'Ivanova', '2026-07-15'::date)`,
  );
  assert(create?.material_id, "draft without return url");
  state.materialId = create.material_id;

  const emptyUrl = rpcJsonAs(
    state.userId,
    `public.update_personal_material_draft(
      '${state.materialId}'::uuid,
      'Anna', 'Ivanova', '2026-07-15'::date,
      NULL, NULL, NULL, NULL,
      '   ',
      '   '
    )`,
  );
  assert(emptyUrl?.status === "draft", "blank return fields normalize to null");

  const nullUrl = sqlScalar(
    `SELECT COALESCE(return_url, 'null') FROM public.personal_materials WHERE id='${state.materialId}'::uuid`,
  );
  assert(nullUrl === "null", "empty return_url stored as null");

  const updateOk = rpcJsonAs(
    state.userId,
    `public.update_personal_material_draft(
      '${state.materialId}'::uuid,
      'Anna', 'Ivanova', '2026-07-15'::date,
      NULL, NULL, NULL, NULL,
      'https://example.com/chat',
      'Вернуться в чат с Сергеем Петровым'
    )`,
  );
  assert(updateOk?.status === "draft", "https url saved");

  const savedUrl = sqlScalar(
    `SELECT return_url FROM public.personal_materials WHERE id='${state.materialId}'::uuid`,
  );
  assert(savedUrl === "https://example.com/chat", "return_url persisted");

  expectRpcError(
    state.userId,
    `SELECT public.update_personal_material_draft(
      '${state.materialId}'::uuid,
      'Anna', 'Ivanova', '2026-07-15'::date,
      NULL, NULL, NULL, NULL,
      'javascript:alert(1)',
      NULL
    )`,
    "invalid_return_url",
  );

  expectRpcError(
    state.userId,
    `SELECT public.update_personal_material_draft(
      '${state.materialId}'::uuid,
      'Anna', 'Ivanova', '2026-07-15'::date,
      NULL, NULL, NULL, NULL,
      'data:text/html,test',
      NULL
    )`,
    "invalid_return_url",
  );

  expectRpcError(
    state.userId,
    `SELECT public.update_personal_material_draft(
      '${state.materialId}'::uuid,
      'Anna', 'Ivanova', '2026-07-15'::date,
      NULL, NULL, NULL, NULL,
      '${"https://example.com/".padEnd(2001, "x")}',
      NULL
    )`,
    "invalid_return_url",
  );

  expectRpcError(
    state.userId,
    `SELECT public.update_personal_material_draft(
      '${state.materialId}'::uuid,
      'Anna', 'Ivanova', '2026-07-15'::date,
      NULL, NULL, NULL, NULL,
      'https://example.com/chat',
      '${"A".repeat(121)}'
    )`,
    "invalid_return_button_label",
  );

  console.log(`${SCRIPT_NAME}: PASS`);
} finally {
  if (state.materialId) {
    sqlFile(`DELETE FROM public.personal_materials WHERE id='${state.materialId}'::uuid;`);
  }
  if (state.authorId) {
    sqlFile(`
      DELETE FROM public.author_members WHERE author_id='${state.authorId}'::uuid;
      DELETE FROM public.authors WHERE id='${state.authorId}'::uuid;
    `);
  }
  if (state.userId) {
    sqlFile(`
      DELETE FROM auth.identities WHERE user_id='${state.userId}'::uuid;
      DELETE FROM auth.users WHERE id='${state.userId}'::uuid;
    `);
  }
  console.log(`${SCRIPT_NAME}: cleanup verified`);
}
