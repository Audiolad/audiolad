// t1578u: end-to-end extract with a fake database: complete paging, refusal when the window
// does not fit, file hashes in manifest.json and a valid Ed25519 seal over its exact bytes.
import assert from "node:assert/strict";
import { createPublicKey, verify, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "evidence-unit-"));
process.env.AUDIOLAD_EVIDENCE_ROOT = root;

const { createPlayLogExtract, listEvidenceLocations, listExtracts, readExtractFile } = await import("../src/lib/evidence/extract.server");

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const PLAYER = "33333333-3333-4333-8333-333333333333";
const TRACK_A = "44444444-4444-4444-8444-444444444444";
const TRACK_B = "55555555-5555-4555-8555-555555555555";
const T0 = Date.parse("2026-11-10T09:00:00.000Z");

function makeFacts(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const track = Math.floor(i / 18) % 2 === 0 ? TRACK_A : TRACK_B;
    return {
      id: `f-${String(i).padStart(6, "0")}`,
      occurred_at: new Date(T0 + i * 10_000).toISOString(),
      created_at: new Date(T0 + i * 10_000 + 40).toISOString(),
      audio_item_id: track, player_id: PLAYER, zone_id: null,
      listened_ms: 10_000, position_ms: ((i % 18) + 1) * 10_000,
      listening_key: `k-${Math.floor(i / 18)}`, phase: "advance", sample_seq: i + 1, reject_reason: null,
    };
  });
}

function fakeDb(facts: unknown[], extraLocations: unknown[] = []) {
  const tables: Record<string, unknown[]> = {
    business_locations: [...extraLocations, { id: LOC, organization_id: ORG, name: "Зал у окна", timezone: "Europe/Moscow", address_line1: "ул. Тестовая, 1", city: "Москва", status: "active" }],
    business_organizations: [{ id: ORG, name: "Кофейня «Тест»" }],
    audio_items: [{ id: TRACK_A, title: "Утро, кофе", music_track_code: "AL-T-000000001" }, { id: TRACK_B, title: "=Вечер", music_track_code: null }],
    business_track_passports: [{ audio_item_id: TRACK_B, al_code: "AL-T-000000002", status: "approved", master_sha256: "a".repeat(64), fingerprint_sha256: "b".repeat(64) }],
    business_players: [{ id: PLAYER, player_code: "AL-P-000000009", display_name: "Зал" }],
  };
  return {
    from(table: string) {
      let rows = (table === "playback_usage_facts" ? facts : tables[table] ?? []) as Array<Record<string, unknown>>;
      const b: Record<string, unknown> = {};
      for (const m of ["select", "gt", "gte", "lte", "order", "in"]) b[m] = () => b;
      b.eq = (col: string, val: unknown) => {
        if (table !== "playback_usage_facts") rows = rows.filter((r) => r[col] === val);
        return b;
      };
      b.limit = () => Promise.resolve({ data: rows, error: null });
      b.range = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, Math.min(to, from + 999) + 1), error: null });
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
      return b;
    },
  };
}

const actor = { userId: "66666666-6666-4666-8666-666666666666", email: null };
const fromUtc = new Date(T0 - 60_000);
const toUtc = new Date(T0 + 3 * 3600_000);

// 2 500 facts: three pages, nothing lost.
const facts = makeFacts(2500);
const res = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: fakeDb(facts) as never });
assert.equal(res.ok, true, JSON.stringify(res));
if (!res.ok) throw new Error("unreachable");
assert.equal(res.facts, 2500);
assert.ok(res.plays >= 138 && res.plays <= 140, String(res.plays));

const dir = join(root, "extracts", res.id);
const manifestBuf = readFileSync(join(dir, "manifest.json"));
const manifest = JSON.parse(manifestBuf.toString("utf8"));
assert.equal(manifest.source.rows_read, 2500);
assert.equal(manifest.source.complete, true);
assert.equal(manifest.location.organizationName, "Кофейня «Тест»");
assert.equal(manifest.players[0].code, "AL-P-000000009");
assert.deepEqual(manifest.tracks.map((t: { al_code: string }) => t.al_code), ["AL-T-000000001", "AL-T-000000002"]);
// Every file of the folder except the manifest and its signature is listed and hashed.
assert.deepEqual(
  readdirSync(dir).filter((n) => n !== "manifest.json" && n !== "manifest.sig").sort(),
  manifest.files.map((f: { name: string }) => f.name).sort(),
);
for (const f of manifest.files) {
  const buf = readFileSync(join(dir, f.name));
  assert.equal(createHash("sha256").update(buf).digest("hex"), f.sha256, f.name);
  assert.equal(buf.length, f.bytes);
}
const factsCsv = readFileSync(join(dir, "facts.csv"), "utf8");
assert.equal(factsCsv.trim().split("\r\n").length, 2501);
const playsCsv = readFileSync(join(dir, "plays.csv"), "utf8");
assert.match(playsCsv, /'=Вечер/);
// Seal: valid on the exact bytes, invalid after one changed byte.
const pub = createPublicKey(readFileSync(join(dir, "seal-public.pem")));
const sig = readFileSync(join(dir, "manifest.sig"));
assert.equal(verify(null, manifestBuf, pub, sig), true);
const tampered = Buffer.from(manifestBuf);
tampered[10] ^= 1;
assert.equal(verify(null, tampered, pub, sig), false);
assert.equal(createHash("sha256").update(pub.export({ type: "spki", format: "der" })).digest("hex"), manifest.seal.public_key_sha256);
try {
  const out = execFileSync("openssl", ["pkeyutl", "-verify", "-pubin", "-inkey", join(dir, "seal-public.pem"), "-rawin",
    "-in", join(dir, "manifest.json"), "-sigfile", join(dir, "manifest.sig")]).toString();
  assert.match(out, /Signature Verified Successfully/);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
// Private key stays 0600 and is never downloadable.
assert.equal(statSync(join(root, "keys", "seal-ed25519.pem")).mode & 0o777, 0o600);
assert.equal(await readExtractFile(res.id, "../keys/seal-ed25519.pem"), null);
assert.equal(await readExtractFile("../../etc", "manifest.json"), null);
assert.ok((await readExtractFile(res.id, "plays.csv"))?.length);
if (process.env.EVIDENCE_TEST_REQUIRE_PDF === "1") {
  assert.equal(manifest.pdf_rendered, true);
  assert.ok(existsSync(join(dir, "extract.pdf")));
}
assert.ok(!readdirSync(dir).some((n) => n.startsWith(".")));
// No ledger RPC in this fake database: the extract is made and says so (migration not applied).
assert.equal(manifest.schema, "audiolad.evidence.play-log-extract/2");
assert.equal(manifest.ledger.available, false);
assert.match(readFileSync(join(dir, "VERIFY.txt"), "utf8"), /Печати часов журнала в этой выписке недоступны/);
assert.match(factsCsv.split("\r\n")[0], /,client_offline,device_occurred_at_utc$/);

// A renderer that crashes mid-write leaves nothing unsealed in the published folder.
{
  const fake = join(root, "fake-python.sh");
  writeFileSync(fake, '#!/bin/sh\nfor a; do case "$prev" in --out) printf partial > "$a.tmp"; printf partial > "$a";; esac; prev="$a"; done\nexit 1\n', { mode: 0o700 });
  const saved = process.env.AUDIOLAD_EVIDENCE_PYTHON;
  process.env.AUDIOLAD_EVIDENCE_PYTHON = fake;
  const crashed = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: fakeDb(makeFacts(20)) as never });
  if (saved === undefined) delete process.env.AUDIOLAD_EVIDENCE_PYTHON;
  else process.env.AUDIOLAD_EVIDENCE_PYTHON = saved;
  assert.equal(crashed.ok, true);
  if (crashed.ok) {
    assert.equal(crashed.pdf, false);
    const cdir = join(root, "extracts", crashed.id);
    const m3 = JSON.parse(readFileSync(join(cdir, "manifest.json"), "utf8"));
    assert.deepEqual(
      readdirSync(cdir).filter((n) => n !== "manifest.json" && n !== "manifest.sig").sort(),
      m3.files.map((f: { name: string }) => f.name).sort(),
    );
    assert.ok(!existsSync(join(cdir, "extract.pdf")));
    assert.ok(!existsSync(join(cdir, "extract.pdf.tmp")));
  }
}

// Same key on the second extract.
const res2 = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: fakeDb(makeFacts(10)) as never });
assert.equal(res2.ok, true);
if (res2.ok) {
  const m2 = JSON.parse(readFileSync(join(root, "extracts", res2.id, "manifest.json"), "utf8"));
  assert.equal(m2.seal.public_key_sha256, manifest.seal.public_key_sha256);
}
const list = await listExtracts();
assert.equal(list.length, 3);

// Refusals: never an incomplete or unbounded extract.
const big = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: fakeDb(makeFacts(200_001)) as never });
assert.deepEqual(big, { ok: false, error: "too_many_facts" });
const long = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc: new Date(fromUtc.getTime() + 8 * 86400_000), actor, db: fakeDb([]) as never });
assert.deepEqual(long, { ok: false, error: "window_too_long" });
const nowhere = await createPlayLogExtract({ locationId: ORG, fromUtc, toUtc, actor, db: fakeDb([]) as never });
assert.deepEqual(nowhere, { ok: false, error: "no_location" });

// Venue lookup does not depend on the picker list; the picker list is read page by page.
{
  const many = Array.from({ length: 2400 }, (_, i) => ({
    id: `loc-${i}`, organization_id: ORG, name: `Точка ${i}`, timezone: "Europe/Moscow", address_line1: null, city: null, status: "active",
  }));
  const db = fakeDb(makeFacts(5), many) as never;
  const all = await listEvidenceLocations(db);
  assert.equal(all.length, 2401);
  assert.equal(new Set(all.map((l) => l.id)).size, 2401);
  assert.equal(all[2400].id, LOC);
  const one = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db });
  assert.equal(one.ok, true);
}

// t1578u M3: hourly seals in the manifest; M2 columns with a fallback before the migration.
{
  const H = 3600_000;
  const hour0 = Math.floor(T0 / H) * H;
  const seal = (k: number) => ({
    period_start: new Date(hour0 + k * H).toISOString(), period_end: new Date(hour0 + (k + 1) * H).toISOString(),
    fact_count: 360, listened_ms: 3_600_000, facts_sha256: String(k).repeat(64).slice(0, 64),
    prev_chain_sha256: "0".repeat(64), chain_sha256: String(k + 1).repeat(64).slice(0, 64), canon_version: 1,
  });
  const seals = [seal(0), seal(1), seal(2)];
  const ledgerDb = (rows: unknown[], opts: { tampered?: boolean; legacyOnly?: boolean } = {}) => {
    const base = fakeDb(rows) as unknown as { from(t: string): Record<string, unknown> };
    const calls: string[] = [];
    return {
      calls,
      rpc(name: string, args: Record<string, unknown>) {
        calls.push(name);
        if (name === "seal_playback_usage_facts") return Promise.resolve({ data: 0, error: null });
        if (name === "verify_playback_usage_fact_seal") {
          const ok = !(opts.tampered && args.p_period_start === seals[1].period_start);
          return Promise.resolve({ data: [{ period_start: args.p_period_start, ok, chain_ok: true, fact_count: 360 }], error: null });
        }
        return Promise.resolve({ data: null, error: { code: "PGRST202", message: "not found" } });
      },
      from(table: string) {
        if (table === "playback_usage_facts" && opts.legacyOnly) {
          const b = base.from(table);
          let cols = "";
          const select = b.select as (c: string) => unknown;
          b.select = (c: string) => { cols = c; select(c); return b; };
          const range = b.range as (f: number, t: number) => Promise<unknown>;
          b.range = (f: number, t: number) => /client_offline/.test(cols)
            ? Promise.resolve({ data: null, error: { code: "42703", message: "column playback_usage_facts.client_offline does not exist" } })
            : range(f, t);
          return b;
        }
        if (table !== "playback_usage_fact_seals") return base.from(table);
        const out = [...seals];
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.gte = () => b;
        b.lte = () => b;
        b.order = (_c: string, o: { ascending: boolean }) => { out.sort((x, y) => (o.ascending ? 1 : -1) * x.period_start.localeCompare(y.period_start)); return b; };
        b.limit = (n: number) => Promise.resolve({ data: out.slice(0, n), error: null });
        return b;
      },
    };
  };
  const rows = makeFacts(2500); // created_at 09:00:00.040 … 15:56:30.040 UTC: 7 hours
  const db = ledgerDb(rows);
  const r = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: db as never });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unreachable");
  const ldir = join(root, "extracts", r.id);
  const m = JSON.parse(readFileSync(join(ldir, "manifest.json"), "utf8"));
  assert.equal(db.calls[0], "seal_playback_usage_facts");
  assert.equal(m.ledger.available, true);
  assert.equal(m.ledger.hours_touched, 7);
  assert.equal(m.ledger.hours_sealed, 3);
  assert.equal(m.ledger.all_sealed_hours_verified, true);
  assert.equal(m.ledger.facts_in_unsealed_hours, 2500 - 3 * 360);
  assert.equal(m.ledger.chain_head.period_start, seals[2].period_start);
  assert.equal(m.ledger.seals[1].chain_sha256, seals[1].chain_sha256);
  const verifyTxt = readFileSync(join(ldir, "VERIFY.txt"), "utf8");
  assert.match(verifyTxt, /запечатано 3 из 7 ч/);
  assert.match(verifyTxt, /перепроверены базой при выписке: да/);
  // VERIFY.txt is itself hashed in the manifest.
  assert.equal(m.files.find((f: { name: string }) => f.name === "VERIFY.txt").sha256, createHash("sha256").update(verifyTxt).digest("hex"));

  const bad = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: ledgerDb(rows, { tampered: true }) as never });
  assert.equal(bad.ok, true);
  if (bad.ok) {
    const mb = JSON.parse(readFileSync(join(root, "extracts", bad.id, "manifest.json"), "utf8"));
    assert.equal(mb.ledger.all_sealed_hours_verified, false);
    assert.equal(mb.ledger.seals[1].verified, false);
    assert.match(readFileSync(join(root, "extracts", bad.id, "VERIFY.txt"), "utf8"), /при выписке: НЕТ/);
  }

  const legacy = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: ledgerDb(makeFacts(30), { legacyOnly: true }) as never });
  assert.equal(legacy.ok, true, JSON.stringify(legacy));
}

// Static guards.
const page = readFileSync("src/app/(platform)/admin/business-evidence/page.tsx", "utf8");
assert.match(page, /requirePlatformOwnerAccess/);
const action = readFileSync("src/app/(platform)/admin/business-evidence/actions.ts", "utf8");
assert.match(action, /requirePlatformOwnerAccess/);
const route = readFileSync("src/app/api/admin/business-evidence/extract/route.ts", "utf8");
assert.match(route, /getPlatformOwnerSessionIfOwner/);
for (const f of [page, action, route, readFileSync("src/components/admin/BusinessEvidenceExtractPanel.tsx", "utf8"),
  readFileSync("scripts/evidence/render_extract_pdf.py", "utf8"), readFileSync("src/lib/evidence/extract.server.ts", "utf8"),
  readFileSync("src/lib/evidence/ledger.ts", "utf8"), readFileSync("src/lib/evidence/ledger.server.ts", "utf8")]) {
  assert.doesNotMatch(f, /—/);
}
const nav = readFileSync("src/lib/admin/nav.ts", "utf8");
assert.match(nav, /href: BUSINESS_EVIDENCE_HREF,\n\s+label: "Сверка записей",\n\s+requiredPermission: "admin_panel.access",\n\s+ownerOnly: true/);

console.log("evidence-extract-unit OK");
