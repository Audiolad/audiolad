// t1578u M2/M3: offline device time shape check, missing-RPC fallback detection, hourly seal report.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isMissingRpcError, offlineDeviceAtIso } from "../src/lib/business-app/point-usage-offline";
import { registryRowFromIndex } from "../src/lib/evidence/index-registry";
import { buildManifestLedger, factHours, isMissingSchemaError, unavailableLedger } from "../src/lib/evidence/ledger";

const at = Date.parse("2026-11-19T08:00:00.123Z");
assert.equal(offlineDeviceAtIso({ offline: true, at }), "2026-11-19T08:00:00.123Z");
assert.equal(offlineDeviceAtIso({ offline: false, at }), null);
assert.equal(offlineDeviceAtIso({ at }), null);
assert.equal(offlineDeviceAtIso({ offline: true }), null);
assert.equal(offlineDeviceAtIso({ offline: true, at: "2026-11-19" }), null);
assert.equal(offlineDeviceAtIso({ offline: true, at: 1.5e12 + 0.5 }), null);
assert.equal(offlineDeviceAtIso({ offline: true, at: 0 }), null);
assert.equal(offlineDeviceAtIso({ offline: true, at: Date.now() + 400 * 86400_000 }), null);

assert.equal(isMissingRpcError(null), false);
assert.equal(isMissingRpcError({ code: "PGRST202", message: "x" }), true);
assert.equal(isMissingRpcError({ code: "42883", message: "x" }), true);
assert.equal(isMissingRpcError({ code: "42501", message: "invalid_point_token" }), false);
assert.equal(isMissingRpcError({ code: "22023", message: "track_not_eligible" }), false);
assert.equal(isMissingSchemaError({ code: "42703", message: "column x does not exist" }), true);
assert.equal(isMissingSchemaError({ code: "42501", message: "permission denied" }), false);
assert.equal(isMissingSchemaError(null), false);

assert.deepEqual(factHours(["2026-11-19T08:59:59.999Z", "2026-11-19T08:00:00Z", null, "bad", "2026-11-19T10:00:00Z"]),
  ["2026-11-19T08:00:00.000Z", "2026-11-19T10:00:00.000Z"]);

const seal = (iso: string) => ({
  period_start: iso, period_end: new Date(Date.parse(iso) + 3600_000).toISOString(), fact_count: 2, listened_ms: 1,
  facts_sha256: "a".repeat(64), prev_chain_sha256: "0".repeat(64), chain_sha256: "b".repeat(64), canon_version: 1,
});
const created = ["2026-11-19T08:10:00Z", "2026-11-19T08:20:00Z", "2026-11-19T09:05:00Z"];
const s8 = seal("2026-11-19T08:00:00+00:00"); // PostgREST style offset
const s7 = seal("2026-11-19T07:00:00+00:00"); // outside the extract: not listed
const l = buildManifestLedger({
  createdAt: created, seals: [s7, s8],
  checks: [{ period_start: "2026-11-19T08:00:00+00:00", ok: true, chain_ok: true, fact_count: 2 }], head: s8,
});
assert.equal(l.hours_touched, 2);
assert.equal(l.hours_sealed, 1);
assert.equal(l.facts_in_unsealed_hours, 1);
assert.equal(l.all_sealed_hours_verified, true);
assert.equal(l.seals.length, 1);
assert.equal(l.chain_head?.period_start, s8.period_start);
const broken = buildManifestLedger({
  createdAt: created, seals: [s8],
  checks: [{ period_start: s8.period_start, ok: true, chain_ok: false, fact_count: 2 }], head: s8,
});
assert.equal(broken.all_sealed_hours_verified, false);
const unchecked = buildManifestLedger({ createdAt: created, seals: [s8], checks: [], head: s8 });
assert.equal(unchecked.all_sealed_hours_verified, false);
assert.equal(unavailableLedger("migration_not_applied").available, false);

// Route: offline samples go to the new RPC with the device time, falling back to the old one.
const route = readFileSync("src/app/api/business/point/route.ts", "utf8");
assert.match(route, /apply_business_point_usage_sample_offline", \{ \.\.\.sampleArgs, p_device_at: deviceAt \}/);
assert.match(route, /if \(deviceAt && isMissingRpcError\(usageError\)\) \{\n\s+\(\{ error: usageError \} = await supabase\.rpc\("apply_business_point_usage_sample", sampleArgs\)\);/);
// The live (online) sample path is unchanged.
assert.match(route, /await supabase\.rpc\("apply_business_point_usage_sample", \{\n\s+p_token: token, p_client_event_id: sample\.eventId/);
for (const f of ["src/lib/evidence/ledger.ts", "src/lib/business-app/point-usage-offline.ts", "scripts/run-evidence-seal.mts"]) {
  assert.doesNotMatch(readFileSync(f, "utf8"), /—/, f);
}
// M4: registry row from index.json and the append-only registration.
const V = "20261119-120000-0a1b2c3d";
const indexJson = {
  engine_version: "t1578u-2", built_at: "2026-11-19T09:00:00Z", version: V,
  audfprint: { file_sha256: "c".repeat(64) }, olaf: { available: true, version: "olaf 1.0" },
  counts: { catalog: 2, control: 1, failed: 1 },
  tracks: [
    { code: "AL-T-000000001", kind: "catalog", status: "ok", sha256: "d".repeat(64), title: "x" },
    { code: "AL-T-000000002", kind: "catalog", status: "sha256_mismatch", sha256: "e".repeat(64) },
  ],
};
const row = registryRowFromIndex(indexJson, "f".repeat(64), 1234);
assert.ok(row);
assert.equal(row.version, V);
assert.equal(row.audfprint_sha256, "c".repeat(64));
assert.equal(row.catalog_tracks, 2);
assert.deepEqual(row.tracks[0], { code: "AL-T-000000001", kind: "catalog", status: "ok", sha256: "d".repeat(64) });
assert.equal(registryRowFromIndex({ ...indexJson, version: "../x" }, "f".repeat(64), null), null);
assert.equal(registryRowFromIndex(indexJson, "nope", null), null);

const root = mkdtempSync(join(tmpdir(), "evidence-registry-"));
process.env.AUDIOLAD_EVIDENCE_ROOT = root;
mkdirSync(join(root, "index", "versions", V), { recursive: true });
const buf = Buffer.from(JSON.stringify(indexJson));
writeFileSync(join(root, "index", "versions", V, "index.json"), buf);
symlinkSync(join("versions", V), join(root, "index", "current"));
const fileSha = createHash("sha256").update(buf).digest("hex");
const { ensureIndexRegistered, ensureIndexRegisteredSafe } = await import("../src/lib/evidence/index-registry.server");
function registryDb(opts: { missing?: boolean } = {}) {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    from(table: string) {
      assert.equal(table, "evidence_index_versions");
      let v: unknown = null;
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (_c: string, val: unknown) => { v = val; return b; };
      b.limit = () => Promise.resolve(opts.missing
        ? { data: null, error: { code: "PGRST205", message: "Could not find the table" } }
        : { data: rows.filter((r) => r.version === v), error: null });
      b.insert = (r: Record<string, unknown>) => {
        if (rows.some((x) => x.version === r.version)) return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
        rows.push({ ...r, registered_at: "2026-11-19T09:30:00+00:00" });
        return Promise.resolve({ error: null });
      };
      return b;
    },
  };
}
const rdb = registryDb();
const first = await ensureIndexRegistered(rdb as never, null);
assert.equal(first?.status, "registered_now");
assert.equal(first?.index_json_sha256, fileSha);
assert.equal(rdb.rows.length, 1);
assert.equal(rdb.rows[0].catalog_tracks, 2);
const second = await ensureIndexRegistered(rdb as never, V);
assert.equal(second?.status, "registered");
assert.equal(rdb.rows.length, 1);
// The file changed after registration: reported, never overwritten.
rdb.rows[0].index_json_sha256 = "0".repeat(64);
assert.equal((await ensureIndexRegistered(rdb as never, V))?.status, "mismatch");
assert.equal((await ensureIndexRegistered(registryDb() as never, "20261119-120000-ffffffff"))?.status, "not_on_disk");
assert.equal((await ensureIndexRegistered(registryDb({ missing: true }) as never, V))?.status, "unavailable");
assert.equal(await ensureIndexRegistered(registryDb() as never, "../../etc"), null);
// A match keeps its own copy of the index.json it ran on: registered from it after the version
// folder is gone (pruned by a rebuild); a copy of another version is ignored.
{
  const V2 = "20261119-130000-0a1b2c3e";
  const JOB = "20261119-131000-0badc0de";
  mkdirSync(join(root, "jobs", JOB), { recursive: true });
  const copy = Buffer.from(JSON.stringify({ ...indexJson, version: V2 }));
  writeFileSync(join(root, "jobs", JOB, "index.json"), copy);
  const db2 = registryDb();
  const r2 = await ensureIndexRegistered(db2 as never, V2, { jobId: JOB });
  assert.equal(r2?.status, "registered_now");
  assert.equal(r2?.index_json_sha256, createHash("sha256").update(copy).digest("hex"));
  assert.equal((await ensureIndexRegistered(registryDb() as never, V, { jobId: JOB }))?.status, "registered_now");
  assert.equal((await ensureIndexRegistered(registryDb() as never, V2, { jobId: "../x" }))?.status, "not_on_disk");
}
assert.equal((await ensureIndexRegisteredSafe(V, { from() { throw new Error("boom"); } } as never))?.status, "error");
{
  // Without a reachable database: never throws (null without env, an error entry with a dummy one).
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await ensureIndexRegisteredSafe(V);
  assert.ok(r === null || r.status === "error", JSON.stringify(r));
  if (saved.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
}

console.log("evidence-ledger-unit OK");
