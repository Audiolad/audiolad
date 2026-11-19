// t1578u: match jobs – chunked upload, background start, sealed report. The engine is
// replaced by a fake that writes a result, so this runs without numpy/Olaf.
import assert from "node:assert/strict";
import { createPublicKey, verify, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "evidence-matcher-unit-"));
process.env.AUDIOLAD_EVIDENCE_ROOT = root;
const fake = join(root, "fake-engine.sh");
// Fake python: `<engine.py> match ... --out X --status S` → writes a result and status done.
writeFileSync(fake, `#!/bin/sh
out=""; st=""; prev=""
for a; do case "$prev" in --out) out="$a";; --status) st="$a";; esac; prev="$a"; done
cat > "$out" <<'JSON'
{"engine_version":"t1578u-1","created_at":"2026-11-19T08:00:00Z","input":{"name":"input.m4a","sha256":"x","size_bytes":7,"decoded_duration_s":30,"probe":{"tags":{}}},
 "index":{"version":"v1","built_at":"2026-11-19T07:00:00Z","audfprint_sha256":"a","counts":{"catalog":149,"control":18,"failed":0},"olaf":{"available":true,"version":"3.3.3"}},
 "params":{"window_s":10,"hop_s":5},"claimed_refs":[],"windows":[],
 "segments":[{"code":"AL-T-000001697","kind":"catalog","rec_from_s":0,"rec_to_s":20,"track_from_s":50,"track_to_s":70,"windows":3,"both":2,"confidence":"high"}],
 "summary":{"windows":5,"catalog_windows":3,"control_windows":0,"unmatched_windows":2,"conflict_windows":0,"claimed_windows":0,"catalog_tracks":["AL-T-000001697"]}}
JSON
echo '{"state":"done"}' > "$st"
`, { mode: 0o700 });
process.env.AUDIOLAD_EVIDENCE_PYTHON = fake;

const m = await import("../src/lib/evidence/matcher.server");
const r = await import("../src/lib/evidence/match-report.server");
const actor = { userId: "u1", email: null };

// Validation.
assert.deepEqual(await m.createJob({ actor, fileName: "a.exe", size: 5, claim: null, locationId: null, recordedAtLocal: null, note: null }), { ok: false, error: "bad_file" });
assert.deepEqual(await m.createJob({ actor, fileName: "a.m4a", size: m.MATCH_MAX_INPUT_BYTES + 1, claim: null, locationId: null, recordedAtLocal: null, note: null }), { ok: false, error: "too_large" });

const created = await m.createJob({ actor, fileName: "Запись акта.m4a", size: 7, claim: null, locationId: null, recordedAtLocal: null, note: "акт 15" });
assert.equal(created.ok, true);
if (!created.ok) throw new Error("unreachable");
const id = created.id;
assert.match(id, m.EVIDENCE_JOB_ID_RE);

// Chunks: gap refused, retry idempotent, overflow refused.
const enc = (s: string) => new TextEncoder().encode(s);
assert.deepEqual(await m.appendChunk(id, "input", 3, enc("xyz")), { ok: false, error: "bad_offset" });
assert.deepEqual(await m.appendChunk(id, "input", 0, enc("abc")), { ok: true, received: 3 });
assert.deepEqual(await m.appendChunk(id, "input", 0, enc("abc")), { ok: true, received: 3 });
assert.deepEqual(await m.appendChunk(id, "input", 3, enc("defgh")), { ok: false, error: "too_large" });
assert.deepEqual(await m.appendChunk(id, "claim", 0, enc("a")), { ok: false, error: "not_found" });
assert.deepEqual(await m.appendChunk("../../etc", "input", 0, enc("a")), { ok: false, error: "not_found" });

// No index yet: refused, upload stays open.
assert.deepEqual(await m.finishUploadAndStart(id), { ok: false, error: "no_index" });
// Fake index.
mkdirSync(join(root, "index", "versions", "v1"), { recursive: true });
writeFileSync(join(root, "index", "versions", "v1", "index.json"), JSON.stringify({ version: "v1", built_at: "2026-11-19T07:00:00Z", counts: { catalog: 149, control: 18, failed: 0 }, olaf: { available: true, version: "3.3.3" }, tracks: [] }));
symlinkSync(join(root, "index", "versions", "v1"), join(root, "index", "current"));
const state = await m.loadEngineState();
assert.equal(state.ready, true);
assert.equal(state.index?.counts.catalog, 149);

// Incomplete upload refused.
assert.deepEqual(await m.finishUploadAndStart(id), { ok: false, error: "incomplete" });
assert.deepEqual(await m.appendChunk(id, "input", 3, enc("defg")), { ok: true, received: 7 });
assert.deepEqual(await m.finishUploadAndStart(id), { ok: true });
// Upload closed after start.
assert.deepEqual(await m.appendChunk(id, "input", 7, enc("z")), { ok: false, error: "closed" });

let job = await m.readJob(id);
for (let i = 0; i < 50 && job?.state !== "done"; i++) {
  await new Promise((res) => setTimeout(res, 100));
  job = await m.readJob(id);
}
assert.equal(job?.state, "done");
assert.equal(job?.input.sha256, createHash("sha256").update("abcdefg").digest("hex"));
assert.ok(existsSync(join(root, "jobs", id, "input.m4a")));

// Sealed report (no venue given → no concordance, still sealed).
const rep = await r.createMatchReport(id, actor);
assert.equal(rep.ok, true, JSON.stringify(rep));
const dir = join(root, "jobs", id, "report-current");
const buf = readFileSync(join(dir, "report.json"));
const report = JSON.parse(buf.toString("utf8"));
assert.equal(report.recording.sha256, job?.input.sha256);
assert.equal(report.summary.catalog_tracks[0], "AL-T-000001697");
assert.equal(report.concordance, null);
const pub = createPublicKey(readFileSync(join(dir, "seal-public.pem")));
assert.equal(verify(null, buf, pub, readFileSync(join(dir, "report.sig"))), true);
for (const f of report.files) {
  assert.equal(createHash("sha256").update(readFileSync(join(dir, f.name))).digest("hex"), f.sha256, f.name);
}

// A second report is a new set; the published one stays consistent (JSON ↔ signature ↔ files).
const [ra, rb] = await Promise.all([r.createMatchReport(id, actor), r.createMatchReport(id, actor)]);
assert.equal(ra.ok && rb.ok, true);
{
  const b2 = readFileSync(join(dir, "report.json"));
  assert.equal(verify(null, b2, pub, readFileSync(join(dir, "report.sig"))), true);
  for (const f of JSON.parse(b2.toString("utf8")).files) {
    assert.equal(createHash("sha256").update(readFileSync(join(dir, f.name))).digest("hex"), f.sha256, f.name);
  }
}
// A re-run whose PDF fails publishes a set without PDF: the old PDF is no longer offered.
assert.equal(existsSync(join(dir, "report.pdf")), true);
process.env.AUDIOLAD_EVIDENCE_PYTHON = "/bin/false";
assert.equal((await r.createMatchReport(id, actor)).ok, true);
process.env.AUDIOLAD_EVIDENCE_PYTHON = fake;
assert.equal(existsSync(join(dir, "report.pdf")), false);
assert.equal((await r.loadJobView(id))?.reportPdf, false);
assert.equal(m.jobFilePath(id, "report.pdf"), join(root, "jobs", id, "report-current", "report.pdf"));

// Download allowlist.
assert.equal(m.jobFilePath(id, "input.m4a"), null);
assert.equal(m.jobFilePath(id, "../keys/seal-ed25519.pem"), null);
assert.equal(m.jobFilePath("x/../y", "report.json"), null);
assert.ok(m.jobFilePath(id, "report.json"));
assert.equal((await m.listJobs()).length, 1); // before the second job

// Overlapping duplicate chunks (two requests at once) never double-write.
const c2 = await m.createJob({ actor, fileName: "b.m4a", size: 6, claim: { fileName: "claim.mp3", size: 4, label: "Трек из претензии" }, locationId: null, recordedAtLocal: null, note: null });
if (!c2.ok) throw new Error("create failed");
const dup = await Promise.all([m.appendChunk(c2.id, "input", 0, enc("abc")), m.appendChunk(c2.id, "input", 0, enc("abc")), m.appendChunk(c2.id, "input", 0, enc("abc"))]);
for (const d of dup) assert.deepEqual(d, { ok: true, received: 3 });
assert.equal(readFileSync(join(root, "jobs", c2.id, "input.part")).toString(), "abc");
await Promise.all([m.appendChunk(c2.id, "input", 3, enc("def")), m.appendChunk(c2.id, "input", 3, enc("def"))]);
assert.equal(readFileSync(join(root, "jobs", c2.id, "input.part")).toString(), "abcdef");
// Incomplete claim: nothing is renamed, finish can be retried after the claim is complete.
assert.deepEqual(await m.appendChunk(c2.id, "claim", 0, enc("cl")), { ok: true, received: 2 });
assert.deepEqual(await m.finishUploadAndStart(c2.id), { ok: false, error: "incomplete" });
assert.ok(existsSync(join(root, "jobs", c2.id, "input.part")));
assert.deepEqual(await m.appendChunk(c2.id, "claim", 2, enc("im")), { ok: true, received: 4 });
const fin = await Promise.all([m.finishUploadAndStart(c2.id), m.finishUploadAndStart(c2.id)]);
assert.deepEqual(fin[0], { ok: true });
assert.deepEqual(fin[1], { ok: false, error: "not_found" });
assert.ok(existsSync(join(root, "jobs", c2.id, "claim.mp3")));

// Build status: a crashed engine (dead pid) does not block a new build forever.
const now = Date.parse("2026-11-19T10:00:00Z");
assert.equal(m.buildBusy(null, now), false);
assert.equal(m.buildBusy({ state: "done" }, now), false);
assert.equal(m.buildBusy({ state: "running", pid: 4242 }, now, () => true), true);
assert.equal(m.buildBusy({ state: "running", pid: 4242 }, now, () => false), false);
assert.equal(m.buildBusy({ state: "running" }, now), false); // no pid, no time
assert.equal(m.buildBusy({ state: "waiting", startedAt: "2026-11-19T09:55:00Z" }, now), true);
assert.equal(m.buildBusy({ state: "waiting", startedAt: "2026-11-19T09:40:00Z" }, now), false);
writeFileSync(join(root, "index", "build-status.json"), JSON.stringify({ state: "running", pid: 2147483646, startedAt: "2026-11-19T09:00:00Z" }));
assert.equal((await m.loadEngineState()).build?.state, "failed");

// Static guards: owner checks and same-origin on the upload route.
const up = readFileSync("src/app/api/admin/business-evidence/upload/route.ts", "utf8");
assert.match(up, /isSameOriginRequest/);
assert.match(up, /getPlatformOwnerSessionIfOwner/);
assert.match(readFileSync("src/app/api/admin/business-evidence/job/route.ts", "utf8"), /getPlatformOwnerSessionIfOwner/);
assert.match(readFileSync("src/app/(platform)/admin/business-evidence/jobs/[id]/page.tsx", "utf8"), /requirePlatformOwnerAccess/);
const actions = readFileSync("src/app/(platform)/admin/business-evidence/actions.ts", "utf8");
assert.equal(actions.match(/export async function/g)?.length, actions.match(/requirePlatformOwnerAccess\(BUSINESS_EVIDENCE_HREF\)/g)?.length);
for (const f of ["src/components/admin/BusinessEvidenceMatcherPanel.tsx", "src/components/admin/BusinessEvidenceJobActions.tsx",
  "src/app/(platform)/admin/business-evidence/jobs/[id]/page.tsx", "src/lib/evidence/constants.ts", "scripts/evidence/render_match_pdf.py",
  "docs/business/evidence-matching.md"]) {
  assert.doesNotMatch(readFileSync(f, "utf8"), /—/, f);
}
// The hall player is not imported by any evidence module.
for (const f of ["src/lib/evidence/matcher.server.ts", "src/lib/evidence/match-report.server.ts"]) {
  assert.doesNotMatch(readFileSync(f, "utf8"), /BusinessCabinetPlayer|hall-report-queue|cabinet-player-client/);
}
console.log("evidence-matcher-unit OK");
