import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ACCEPTANCE_UNAVAILABLE,
  acceptanceCapabilityEnabled,
  createAcceptanceGate,
  handleOwnerAcceptanceRequest,
  interpretAcceptanceResponse,
  sameAcceptanceReplay,
  validateAcceptanceCommand,
} from "../src/lib/admin/ai-company-acceptance";

const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const taskId = "f030fcae-be3a-4231-9987-24b97efe7501";

const reject = validateAcceptanceCommand({ taskId, action: "reject", comment: "   ", idempotencyKey: key });
assert.equal(reject.ok, false);
if (!reject.ok) assert.equal(reject.message, "Нужно короткое замечание.");

const secretComment = validateAcceptanceCommand({
  taskId,
  action: "reject",
  comment: "не открывается api_key=super-secret-value",
  idempotencyKey: key,
  resultVersion: "v1",
  resultSha: "not-a-sha",
});
assert.equal(secretComment.ok, true);
if (secretComment.ok) {
  assert.match(secretComment.command.comment ?? "", /скрыто/);
  assert.doesNotMatch(secretComment.command.comment ?? "", /super-secret-value/);
  assert.equal(secretComment.command.resultSha, null);
  assert.equal(secretComment.command.resultVersion, "v1");
}

const health = interpretAcceptanceResponse(200, { status: "healthy", ok: true });
assert.equal(health.ok, false);
if (!health.ok) assert.equal(health.keepRow, true);

const missingTime = interpretAcceptanceResponse(200, { ok: true, task_id: taskId, state: "accepted" });
assert.equal(missingTime.ok, true);
if (missingTime.ok) {
  assert.equal(missingTime.at, null);
  assert.equal(missingTime.actor, null);
  assert.equal(missingTime.state, "accepted");
}

const stale = interpretAcceptanceResponse(409, { ok: false, code: "stale_result_version" });
assert.equal(stale.ok, false);
if (!stale.ok) {
  assert.equal(stale.code, "stale_result_version");
  assert.equal(stale.keepRow, true);
}

const conflict = interpretAcceptanceResponse(409, { ok: false, code: "conflict" });
assert.equal(conflict.ok, false);
if (!conflict.ok) assert.equal(conflict.keepRow, true);

assert.equal(acceptanceCapabilityEnabled({ accept: true, reject: true, reopen: true }), true);
assert.equal(acceptanceCapabilityEnabled({ status: "ok" }), false);
assert.equal(interpretAcceptanceResponse(404, { status: "ok" }).ok, false);

const left = validateAcceptanceCommand({ taskId, action: "accept", idempotencyKey: key, resultVersion: "v3" });
const right = validateAcceptanceCommand({ taskId, action: "accept", idempotencyKey: key, resultVersion: "v3" });
assert.equal(left.ok && right.ok && sameAcceptanceReplay(left.command, right.command), true);

let sends = 0;
const gate = createAcceptanceGate();
const pending: { release: (() => void) | null } = { release: null };
const first = gate.run(
  () =>
    new Promise<string>((resolve) => {
      sends += 1;
      pending.release = () => resolve("saved");
    }),
);
const second = gate.run(() => {
  sends += 1;
  return Promise.resolve("second");
});
assert.equal(first, second);
assert.equal(sends, 1);
pending.release?.();
assert.equal(await first, "saved");
assert.equal(gate.busy, false);

const calls: Array<{ url: string; idempotencyKey: string | null; actor: string | null; body: string }> = [];
function fetchImpl(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const href = String(url);
  const headers = new Headers(init?.headers);
  calls.push({
    url: href,
    idempotencyKey: headers.get("Idempotency-Key"),
    actor: headers.get("X-Audiolad-Actor-Id"),
    body: typeof init?.body === "string" ? init.body : "",
  });
  if (href.endsWith("/v1/acceptance/capabilities")) {
    return Promise.resolve(Response.json({ accept: true, reject: true, reopen: true }));
  }
  const payload = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { expected_result_version?: string };
  if (payload.expected_result_version === "v1") {
    return Promise.resolve(Response.json({ ok: false, code: "stale_result_version" }, { status: 409 }));
  }
  return Promise.resolve(
    Response.json({
      ok: true,
      task_id: taskId,
      state: payload.expected_result_version === "reopen" ? "pending" : "accepted",
      actor: "verified-actor",
      at: "2026-10-07T18:30:00.000Z",
      result_version: payload.expected_result_version ?? null,
      result_sha: "abc1234",
    }),
  );
}

const saved = await handleOwnerAcceptanceRequest({
  actorId: "user-1",
  base: "https://core.example",
  token: "server-token",
  fetchImpl: fetchImpl as typeof fetch,
  body: { taskId, action: "accept", idempotencyKey: key, resultVersion: "v2", resultSha: "abc1234" },
});
assert.equal(saved.status, 200);
assert.equal(saved.body.ok, true);
assert.equal(saved.body.at, "2026-10-07T18:30:00.000Z");
assert.equal(saved.body.keepRow, false);
assert.equal(calls.at(-1)?.idempotencyKey, key);
assert.equal(calls.at(-1)?.actor, "user-1");
assert.doesNotMatch(calls.at(-1)?.body ?? "", /server-token/);

const replay = await handleOwnerAcceptanceRequest({
  actorId: "user-1",
  base: "https://core.example",
  token: "server-token",
  fetchImpl: fetchImpl as typeof fetch,
  body: { taskId, action: "accept", idempotencyKey: key, resultVersion: "v2", resultSha: "abc1234" },
});
assert.equal(replay.status, 200);
assert.equal(calls.filter((call) => call.url.endsWith("/acceptance")).length, 2);
assert.equal(calls.filter((call) => call.idempotencyKey === key).length, 2);

const staleSave = await handleOwnerAcceptanceRequest({
  actorId: "user-1",
  base: "https://core.example",
  token: "server-token",
  fetchImpl: fetchImpl as typeof fetch,
  body: { taskId, action: "accept", idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", resultVersion: "v1" },
});
assert.equal(staleSave.status, 409);
assert.equal(staleSave.body.keepRow, true);
assert.equal(staleSave.body.code, "stale_result_version");

const hidden = await handleOwnerAcceptanceRequest({
  actorId: "user-1",
  base: "https://core.example",
  token: "server-token",
  fetchImpl: (async () => Response.json({ status: "ok" }, { status: 404 })) as typeof fetch,
  body: { taskId, action: "accept", idempotencyKey: key },
});
assert.equal(hidden.status, 503);
assert.equal(hidden.body.message, ACCEPTANCE_UNAVAILABLE);
assert.equal(hidden.body.ok, false);

const route = readFileSync("src/app/api/admin/ai-company/acceptance/route.ts", "utf8");
assert.match(route, /requireAdminPermission\("ai_company\.view"\)/);
assert.match(route, /process\.env\.COMPANY_API_TOKEN/);
assert.doesNotMatch(route, /localStorage|Bearer [A-Za-z0-9]/);
const permissions = readFileSync("src/lib/auth/platform-permissions.ts", "utf8");
assert.doesNotMatch(permissions, /ai_company\.accept|ai_company\.manage/);

console.log("ai-company-acceptance-unit: ok");
