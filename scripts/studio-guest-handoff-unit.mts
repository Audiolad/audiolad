import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  STUDIO_GUEST_HANDOFF_CREATE_FAILED_MESSAGE,
  STUDIO_GUEST_HANDOFF_EXPIRED_MESSAGE,
  STUDIO_GUEST_HANDOFF_INVALID_MESSAGE,
  STUDIO_GUEST_HANDOFF_PATH,
  STUDIO_GUEST_HANDOFF_TTL_MS,
  STUDIO_GUEST_HANDOFF_USED_MESSAGE,
  buildGuestHandoffResultPath,
  buildGuestHandoffSafeReturnPath,
  buildGuestHandoffUrl,
  evaluateGuestHandoffCreate,
  evaluateGuestHandoffRedeem,
  guestHandoffResultMessage,
} from "../src/lib/studio/guest-handoff";
import { resolveStudioProjectAccess } from "../src/lib/studio/guest-policy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const guestA = "33333333-3333-4333-8333-333333333333";
const guestB = "44444444-4444-4444-8444-444444444444";
const projectA = "55555555-5555-4555-8555-555555555555";

assert.equal(STUDIO_GUEST_HANDOFF_TTL_MS, 8 * 60 * 1000);
assert.equal(STUDIO_GUEST_HANDOFF_PATH, "/studio/try/handoff");

const guestCreateOk = evaluateGuestHandoffCreate({
  actorKind: "guest",
  projectAccessOk: true,
  projectGuestSessionId: guestA,
  actorSessionId: guestA,
});
assert.deepEqual(guestCreateOk, { ok: true });

const authorCreate = evaluateGuestHandoffCreate({
  actorKind: "author",
  projectAccessOk: true,
  projectGuestSessionId: null,
  actorSessionId: null,
});
assert.equal(authorCreate.ok, false);
if (!authorCreate.ok) {
  assert.equal(authorCreate.error, "forbidden");
}

const noneCreate = evaluateGuestHandoffCreate({
  actorKind: "none",
  projectAccessOk: false,
  projectGuestSessionId: guestA,
  actorSessionId: null,
});
assert.equal(noneCreate.ok, false);
if (!noneCreate.ok) {
  assert.equal(noneCreate.error, "not_found");
}

const guestBCreate = evaluateGuestHandoffCreate({
  actorKind: "guest",
  projectAccessOk: false,
  projectGuestSessionId: guestA,
  actorSessionId: guestB,
});
assert.equal(guestBCreate.ok, false);
if (!guestBCreate.ok) {
  assert.equal(guestBCreate.error, "not_found");
}

const now = new Date("2026-08-19T15:00:00.000Z");
const redeemOk = evaluateGuestHandoffRedeem({
  now,
  handoff: {
    expires_at: "2026-08-19T15:08:00.000Z",
    used_at: null,
    guest_session_id: guestA,
    project_id: projectA,
  },
  sessionStillValid: true,
});
assert.deepEqual(redeemOk, { ok: true, sessionId: guestA, projectId: projectA });
assert.equal(buildGuestHandoffSafeReturnPath(projectA), `/studio/project/${projectA}`);
assert.doesNotMatch(buildGuestHandoffSafeReturnPath(projectA), /[?&]t=/);

const replay = evaluateGuestHandoffRedeem({
  now,
  handoff: {
    expires_at: "2026-08-19T15:08:00.000Z",
    used_at: "2026-08-19T15:01:00.000Z",
    guest_session_id: guestA,
    project_id: projectA,
  },
  sessionStillValid: true,
});
assert.deepEqual(replay, { ok: false, error: "used" });

const expired = evaluateGuestHandoffRedeem({
  now,
  handoff: {
    expires_at: "2026-08-19T14:59:00.000Z",
    used_at: null,
    guest_session_id: guestA,
    project_id: projectA,
  },
  sessionStillValid: true,
});
assert.deepEqual(expired, { ok: false, error: "expired" });

const sessionGone = evaluateGuestHandoffRedeem({
  now,
  handoff: {
    expires_at: "2026-08-19T15:08:00.000Z",
    used_at: null,
    guest_session_id: guestA,
    project_id: projectA,
  },
  sessionStillValid: false,
});
assert.deepEqual(sessionGone, { ok: false, error: "expired" });

assert.deepEqual(
  evaluateGuestHandoffRedeem({ now, handoff: null, sessionStillValid: false }),
  { ok: false, error: "invalid" },
);

assert.equal(
  buildGuestHandoffUrl({ origin: "https://audiolad.ru", token: "opaque-token" }),
  "https://audiolad.ru/studio/try/handoff?t=opaque-token",
);
assert.equal(
  buildGuestHandoffUrl({ origin: "https://audiolad.ru/", token: "opaque-token" }),
  "https://audiolad.ru/studio/try/handoff?t=opaque-token",
);
assert.equal(buildGuestHandoffSafeReturnPath("not-a-uuid"), "/studio/projects");
assert.doesNotMatch(buildGuestHandoffResultPath("expired"), /[?&]t=/);
assert.doesNotMatch(buildGuestHandoffResultPath("used"), /[?&]t=/);
assert.doesNotMatch(buildGuestHandoffResultPath("invalid"), /[?&]t=/);

assert.equal(guestHandoffResultMessage("expired"), STUDIO_GUEST_HANDOFF_EXPIRED_MESSAGE);
assert.equal(guestHandoffResultMessage("used"), STUDIO_GUEST_HANDOFF_USED_MESSAGE);
assert.equal(guestHandoffResultMessage("invalid"), STUDIO_GUEST_HANDOFF_INVALID_MESSAGE);
assert.equal(guestHandoffResultMessage("nope"), STUDIO_GUEST_HANDOFF_INVALID_MESSAGE);

for (const message of [
  STUDIO_GUEST_HANDOFF_EXPIRED_MESSAGE,
  STUDIO_GUEST_HANDOFF_USED_MESSAGE,
  STUDIO_GUEST_HANDOFF_INVALID_MESSAGE,
  STUDIO_GUEST_HANDOFF_CREATE_FAILED_MESSAGE,
]) {
  assert.doesNotMatch(message, /Проект для сохранения не найден/);
  assert.doesNotMatch(message, /Проект не найден/);
}

const guestProjectA = {
  id: projectA,
  status: "active",
  author_id: null,
  guest_session_id: guestA,
};
assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectA,
    actor: { kind: "guest", sessionId: guestB },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectA,
    actor: { kind: "none" },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectA,
    actor: { kind: "guest", sessionId: guestA },
  }).ok,
  true,
);

const migration = await read("supabase/migrations/20260819183000_studio_guest_handoff.sql");
assert.match(migration, /studio_guest_handoffs/);
assert.match(migration, /char_length\(token_hash\) = 64/);
assert.match(migration, /token_hash text NOT NULL UNIQUE/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /studio_guest_handoffs_token_hash_idx/);
assert.match(migration, /studio_guest_handoffs_expires_at_idx/);
assert.match(migration, /REFERENCES public\.studio_guest_sessions/);
assert.match(migration, /REFERENCES public\.studio_projects/);
assert.match(migration, /ON DELETE CASCADE/);
assert.doesNotMatch(migration, /CREATE POLICY/);
assert.doesNotMatch(migration, /\braw_token\b/);
assert.doesNotMatch(migration, /\btoken text\b/);
assert.doesNotMatch(migration, /token_plain/);

const policy = await read("src/lib/studio/guest-handoff.ts");
assert.match(policy, /export function evaluateGuestHandoffCreate/);
assert.match(policy, /export function evaluateGuestHandoffRedeem/);
assert.match(policy, /export function buildGuestHandoffUrl/);
assert.match(policy, /export function buildGuestHandoffSafeReturnPath/);
assert.doesNotMatch(policy, /createServiceRoleClient/);
assert.doesNotMatch(policy, /Проект для сохранения не найден/);

const server = await read("src/lib/studio/server/guest-handoff.ts");
assert.match(server, /import "server-only"/);
assert.match(server, /resolveStudioActor/);
assert.match(server, /resolveStudioProjectAccess/);
assert.match(server, /createGuestToken/);
assert.match(server, /hashGuestToken/);
assert.match(server, /guestTokenHashesEqual/);
assert.match(server, /used_at/);
assert.match(server, /\.is\("used_at", null\)/);
assert.match(server, /\.gt\("expires_at"/);
assert.match(server, /23505/);
assert.match(server, /getPublicRequestOrigin/);
assert.doesNotMatch(server, /writeGuestCookie/);
assert.doesNotMatch(server, /Проект для сохранения не найден/);

const api = await read("src/app/api/studio/guest/handoff/route.ts");
assert.match(api, /export async function POST/);
assert.match(api, /createStudioGuestHandoffUrl/);
assert.match(api, /status: 201/);
assert.doesNotMatch(api, /session\.token/);
assert.doesNotMatch(api, /Проект для сохранения не найден/);

const redeemRoute = await read("src/app/(studio)/studio/try/handoff/route.ts");
assert.match(redeemRoute, /export async function GET/);
assert.match(redeemRoute, /redeemStudioGuestHandoff/);
assert.match(redeemRoute, /response\.cookies\.set/);
assert.match(redeemRoute, /NextResponse\.redirect/);
assert.match(redeemRoute, /303/);
assert.match(redeemRoute, /buildGuestHandoffSafeReturnPath/);
assert.match(redeemRoute, /buildStudioGuestCookieOptions/);
assert.doesNotMatch(redeemRoute, /writeGuestCookie/);
assert.doesNotMatch(redeemRoute, /cookies\(\)/);
assert.doesNotMatch(redeemRoute, /searchParams\.set\("t"/);
assert.doesNotMatch(redeemRoute, /Проект для сохранения не найден/);

const resultPage = await read("src/app/(studio)/studio/try/handoff/result/page.tsx");
assert.match(resultPage, /guestHandoffResultMessage/);
assert.match(resultPage, /index: false/);
assert.doesNotMatch(resultPage, /Проект для сохранения не найден/);
assert.doesNotMatch(resultPage, /Проект не найден/);

const client = await read("src/lib/studio/persistence-client.ts");
assert.match(client, /export async function createStudioGuestHandoff/);
assert.match(client, /\/api\/studio\/guest\/handoff/);
assert.doesNotMatch(client, /token_hash/);

const editor = await read("src/components/studio/StudioEditorShell.tsx");
assert.match(editor, /function StudioInAppRotateHintBanner\(/);
assert.match(editor, /accessMode\?: "author" \| "guest"/);
assert.match(editor, /projectId\?: string/);
assert.match(editor, /<StudioInAppRotateHintBanner/);
assert.match(editor, /accessMode=\{accessMode\}/);
assert.match(editor, /projectId=\{persistedHydration\?\.project\.id\}/);
assert.match(editor, /createStudioGuestHandoff/);
assert.match(editor, /STUDIO_GUEST_HANDOFF_CREATE_FAILED_MESSAGE/);
assert.equal(STUDIO_GUEST_HANDOFF_CREATE_FAILED_MESSAGE, "Не удалось подготовить ссылку. Попробуйте ещё раз.");
assert.match(editor, /Ссылка скопирована/);
assert.match(editor, /Да, хорошо/);

const bannerStart = editor.indexOf("function StudioInAppRotateHintBanner");
const bannerEnd = editor.indexOf("export default function StudioEditorShell");
assert.ok(bannerStart !== -1 && bannerEnd > bannerStart);
const banner = editor.slice(bannerStart, bannerEnd);
assert.match(banner, /performStudioBannerShareCopy/);
assert.match(banner, /createStudioGuestHandoff/);
assert.match(banner, /setCopyFeedback\("error"\)/);
assert.match(banner, /createHandoff: \(id\) => createStudioGuestHandoff\(\{ projectId: id \}\)/);
assert.doesNotMatch(banner, /copyPreparedShareUrl\(window\.location\.href\)/);
assert.doesNotMatch(banner, /Проект для сохранения не найден/);
assert.match(banner, /pathname: window\.location\.pathname/);
assert.match(banner, /href: window\.location\.href/);

const guestMode = await read("src/lib/studio/server/repository.ts");
assert.match(guestMode, /resolveStudioProjectAccess/);

console.log("studio-guest-handoff-unit: ok");
