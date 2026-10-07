import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ACCEPTANCE_UNAVAILABLE,
  COMPANY_ACTOR,
  coreAcceptanceBody,
  createAcceptanceGate,
  handleOwnerAcceptanceRequest,
  interpretAcceptanceResponse,
  safeResultVersion,
  sameAcceptanceReplay,
  validateAcceptanceCommand,
  validateRejectionComment,
} from "../src/lib/admin/ai-company-acceptance";

const key = "idem-key-1";
const taskId = "f030fcae-be3a-4231-9987-24b97efe7501";
const version = "ab".repeat(32);
const nextVersion = "cd".repeat(32);

assert.equal(safeResultVersion(version), version);
assert.equal(safeResultVersion("result-4"), null);
assert.equal(validateRejectionComment("коротко"), "Нужно замечание от 8 до 500 символов.");
assert.equal(validateRejectionComment("ok"), "Замечание не может быть одним словом вроде ok, yes, no или done.");
assert.equal(validateRejectionComment("DONE"), "Замечание не может быть одним словом вроде ok, yes, no или done.");
assert.equal(validateRejectionComment("время прослушивания в админке не отображается"), null);

const missing = validateAcceptanceCommand({ taskId, decision: "rejected", comment: "   ", idempotencyKey: key, resultVersion: version });
assert.equal(missing.ok, false);
if (!missing.ok) assert.equal(missing.code, "comment_required");

const oneWord = validateAcceptanceCommand({ taskId, decision: "rejected", comment: "failed", idempotencyKey: key, resultVersion: version });
assert.equal(oneWord.ok, false);
if (!oneWord.ok) assert.equal(oneWord.code, "invalid_comment");

const poisoned = validateAcceptanceCommand({
  taskId,
  decision: "accepted",
  idempotencyKey: key,
  resultVersion: version,
  actor: "sergey",
  decided_at: "2026-10-07T18:30:00.000Z",
});
assert.equal(poisoned.ok, false);
if (!poisoned.ok) assert.equal(poisoned.code, "actor_in_body");

const command = validateAcceptanceCommand({
  taskId,
  decision: "rejected",
  comment: "не открывается api_key=super-secret-value",
  idempotencyKey: key,
  resultVersion: version.toUpperCase(),
});
assert.equal(command.ok, true);
if (command.ok) {
  assert.match(command.command.comment ?? "", /скрыто/);
  assert.doesNotMatch(command.command.comment ?? "", /super-secret-value/);
  assert.equal(command.command.resultVersion, version);
  const body = coreAcceptanceBody(command.command);
  assert.deepEqual(Object.keys(body).sort(), ["comment", "decision", "expected_result_version", "idempotency_key"]);
  assert.equal(body.decision, "rejected");
  assert.equal("actor" in body, false);
  assert.equal("production_verified" in body, false);
}

const health = interpretAcceptanceResponse(200, { status: "healthy", production_verified: true, ok: true });
assert.equal(health.ok, false);
if (!health.ok) assert.equal(health.keepRow, true);

const missingTime = interpretAcceptanceResponse(200, { task_id: taskId, decision: "accepted", archive: true });
assert.equal(missingTime.ok, true);
if (missingTime.ok) {
  assert.equal(missingTime.at, null);
  assert.equal(missingTime.actor, null);
  assert.equal(missingTime.archive, true);
  assert.equal(missingTime.decision, "accepted");
}

const stale = interpretAcceptanceResponse(409, { code: "stale_result", result_version: nextVersion });
assert.equal(stale.ok, false);
if (!stale.ok) {
  assert.equal(stale.code, "stale_result");
  assert.equal(stale.keepRow, true);
  assert.equal(stale.resultVersion, nextVersion);
  assert.match(stale.message, new RegExp(nextVersion));
}

for (const code of ["idempotency_conflict", "not_archived", "gate_open", "result_not_presented", "historical_blocked", "task_closed"]) {
  const outcome = interpretAcceptanceResponse(409, { code });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.keepRow, true);
}
assert.equal(interpretAcceptanceResponse(401, { code: "unauthorized" }).ok, false);
assert.equal(interpretAcceptanceResponse(403, { code: "actor_not_authenticated" }).ok, false);
assert.equal(interpretAcceptanceResponse(404, { code: "not_found" }).ok, false);
assert.equal(interpretAcceptanceResponse(413, { code: "payload_too_large" }).ok, false);
assert.equal(interpretAcceptanceResponse(500, { code: "internal_error" }).ok, false);

const left = validateAcceptanceCommand({ taskId, decision: "accepted", idempotencyKey: key, resultVersion: version });
const right = validateAcceptanceCommand({ taskId, decision: "accepted", idempotencyKey: key, resultVersion: version });
const other = validateAcceptanceCommand({ taskId, decision: "reopen", idempotencyKey: key, resultVersion: version });
assert.equal(left.ok && right.ok && sameAcceptanceReplay(left.command, right.command), true);
assert.equal(left.ok && other.ok && sameAcceptanceReplay(left.command, other.command), false);

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

const calls: Array<{ url: string; actor: string | null; idempotencyHeader: string | null; body: string }> = [];
function fetchImpl(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const raw = typeof init?.body === "string" ? init.body : "";
  calls.push({
    url: String(url),
    actor: headers.get("X-Company-Actor"),
    idempotencyHeader: headers.get("Idempotency-Key"),
    body: raw,
  });
  const payload = JSON.parse(raw || "{}") as { expected_result_version?: string; decision?: string; idempotency_key?: string };
  if (payload.expected_result_version === nextVersion) {
    return Promise.resolve(Response.json({ code: "stale_result", result_version: version }, { status: 409 }));
  }
  return Promise.resolve(
    Response.json({
      task_id: taskId,
      decision: payload.decision,
      actor: "sergey",
      decided_at: "2026-10-07T18:30:00.000Z",
      result_version: version,
      comment: null,
      user_acceptance: payload.decision,
      presentation: true,
      next_action: null,
      owner: "executive",
      idempotent: calls.filter((call) => call.body.includes(payload.idempotency_key ?? "none")).length > 1,
      production_verified: false,
      archive: payload.decision === "accepted",
    }),
  );
}

const saved = await handleOwnerAcceptanceRequest({
  base: "https://core.example",
  token: "server-token",
  fetchImpl: fetchImpl as typeof fetch,
  body: { taskId, decision: "accepted", idempotencyKey: key, resultVersion: version },
});
assert.equal(saved.status, 200);
assert.equal(saved.body.ok, true);
assert.equal(saved.body.at, "2026-10-07T18:30:00.000Z");
assert.equal(saved.body.keepRow, false);
assert.equal(saved.body.archive, true);
assert.equal(calls.at(-1)?.actor, COMPANY_ACTOR);
assert.equal(calls.at(-1)?.idempotencyHeader, null);
assert.match(calls.at(-1)?.body ?? "", /"idempotency_key":"idem-key-1"/);
assert.doesNotMatch(calls.at(-1)?.body ?? "", /server-token|actor|production_verified|decided_at/);

const replay = await handleOwnerAcceptanceRequest({
  base: "https://core.example",
  token: "server-token",
  fetchImpl: fetchImpl as typeof fetch,
  body: { taskId, decision: "accepted", idempotencyKey: key, resultVersion: version },
});
assert.equal(replay.status, 200);
assert.equal(replay.body.idempotent, true);
assert.equal(calls.filter((call) => call.body.includes(`"idempotency_key":"${key}"`)).length, 2);

const staleSave = await handleOwnerAcceptanceRequest({
  base: "https://core.example",
  token: "server-token",
  fetchImpl: fetchImpl as typeof fetch,
  body: { taskId, decision: "accepted", idempotencyKey: "another-key", resultVersion: nextVersion },
});
assert.equal(staleSave.status, 409);
assert.equal(staleSave.body.keepRow, true);
assert.equal(staleSave.body.code, "stale_result");
assert.equal(staleSave.body.resultVersion, version);

const hidden = await handleOwnerAcceptanceRequest({
  base: null,
  token: null,
  body: { taskId, decision: "accepted", idempotencyKey: key, resultVersion: version },
});
assert.equal(hidden.status, 503);
assert.equal(hidden.body.message, ACCEPTANCE_UNAVAILABLE);

const route = readFileSync("src/app/api/admin/ai-company/acceptance/route.ts", "utf8");
assert.match(route, /requireAdminPermission\("ai_company\.view"\)/);
assert.match(route, /process\.env\.COMPANY_API_TOKEN/);
assert.doesNotMatch(route, /localStorage|X-Audiolad-Actor|acceptance\/capabilities/);
const permissions = readFileSync("src/lib/auth/platform-permissions.ts", "utf8");
assert.doesNotMatch(permissions, /ai_company\.accept|ai_company\.manage/);

console.log("ai-company-acceptance-unit: ok");
