// t1578u: end-to-end extract with a fake database: complete paging, refusal when the window
// does not fit, file hashes in manifest.json and a valid Ed25519 seal over its exact bytes.
import assert from "node:assert/strict";
import { createPublicKey, verify, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, existsSync, readdirSync } from "node:fs";
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

// Same key on the second extract.
const res2 = await createPlayLogExtract({ locationId: LOC, fromUtc, toUtc, actor, db: fakeDb(makeFacts(10)) as never });
assert.equal(res2.ok, true);
if (res2.ok) {
  const m2 = JSON.parse(readFileSync(join(root, "extracts", res2.id, "manifest.json"), "utf8"));
  assert.equal(m2.seal.public_key_sha256, manifest.seal.public_key_sha256);
}
const list = await listExtracts();
assert.equal(list.length, 2);

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

// Static guards.
const page = readFileSync("src/app/(platform)/admin/business-evidence/page.tsx", "utf8");
assert.match(page, /requirePlatformOwnerAccess/);
const action = readFileSync("src/app/(platform)/admin/business-evidence/actions.ts", "utf8");
assert.match(action, /requirePlatformOwnerAccess/);
const route = readFileSync("src/app/api/admin/business-evidence/extract/route.ts", "utf8");
assert.match(route, /getPlatformOwnerSessionIfOwner/);
for (const f of [page, action, route, readFileSync("src/components/admin/BusinessEvidenceExtractPanel.tsx", "utf8"),
  readFileSync("scripts/evidence/render_extract_pdf.py", "utf8"), readFileSync("src/lib/evidence/extract.server.ts", "utf8")]) {
  assert.doesNotMatch(f, /—/);
}
const nav = readFileSync("src/lib/admin/nav.ts", "utf8");
assert.match(nav, /href: BUSINESS_EVIDENCE_HREF,\n\s+label: "Сверка записей",\n\s+requiredPermission: "admin_panel.access",\n\s+ownerOnly: true/);

console.log("evidence-extract-unit OK");
