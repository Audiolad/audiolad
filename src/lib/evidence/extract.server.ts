// t1578u: signed play-log extract («выписка журнала воспроизведения»).
// Reads playback_usage_facts of one venue for a window (all pages, never a silent cut),
// writes plays.csv + facts.csv + extract.pdf + manifest.json (SHA-256 of every file) and
// manifest.sig: an Ed25519 «техническая печать сервиса» over the exact manifest bytes.
// Read-only towards the database. Never touches the hall player.
import "server-only";

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { fetchAllPlaybackFacts } from "@/lib/business-app/playback-facts-query";
import {
  EVIDENCE_FACT_COLUMNS,
  factsCsv,
  formatLocal,
  playsCsv,
  reconstructPlays,
  type EvidenceFact,
  type TrackLabel,
} from "@/lib/evidence/play-log";
import { evidenceRoot, extractDir, extractsDir, EVIDENCE_ID_RE, loadOrCreateSealKey, sealBytes, sha256Hex } from "@/lib/evidence/storage.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const execFileAsync = promisify(execFile);

export const EXTRACT_MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;
export const EXTRACT_MAX_FACTS = 200_000;
export const EVIDENCE_PYTHON_DEFAULT = "/var/lib/audiolad/evidence-matcher/.venv/bin/python";
const PDF_FONT_DIR = "/usr/share/fonts/truetype/dejavu";

export function evidencePython(env: NodeJS.Dict<string> = process.env): string {
  return env.AUDIOLAD_EVIDENCE_PYTHON?.trim() || EVIDENCE_PYTHON_DEFAULT;
}

type Db = ReturnType<typeof createServiceRoleClient>;

export type EvidenceLocation = {
  id: string;
  organizationId: string;
  name: string;
  organizationName: string;
  timezone: string;
  address: string;
  status: string;
};

const LOCATION_COLUMNS = "id, organization_id, name, timezone, address_line1, city, status";
const LOCATIONS_PAGE = 1000;
const LOCATIONS_MAX = 50_000;

type LocationRow = Record<string, unknown>;

async function withOrgNames(db: Db, rows: LocationRow[]): Promise<EvidenceLocation[]> {
  const orgIds = [...new Set(rows.map((r) => r.organization_id as string))];
  const orgNames = new Map<string, string>();
  for (let i = 0; i < orgIds.length; i += 200) {
    const { data, error } = await db.from("business_organizations").select("id, name").in("id", orgIds.slice(i, i + 200));
    if (error) throw new Error("evidence_organizations_failed");
    for (const o of data ?? []) orgNames.set(o.id as string, (o.name as string) ?? "");
  }
  return rows.map((r) => ({
    id: r.id as string,
    organizationId: r.organization_id as string,
    name: (r.name as string) ?? "",
    organizationName: orgNames.get(r.organization_id as string) ?? "",
    timezone: (r.timezone as string) || "Europe/Moscow",
    address: [r.city, r.address_line1].filter((x) => typeof x === "string" && x.trim()).join(", "),
    status: (r.status as string) ?? "",
  }));
}

/** All venues for the picker, page by page (no silent cut at one server page). */
export async function listEvidenceLocations(db: Db = createServiceRoleClient()): Promise<EvidenceLocation[]> {
  const rows: LocationRow[] = [];
  while (rows.length < LOCATIONS_MAX) {
    const { data, error } = await db
      .from("business_locations")
      .select(LOCATION_COLUMNS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(rows.length, rows.length + LOCATIONS_PAGE - 1);
    if (error) throw new Error("evidence_locations_failed");
    const batch = (data ?? []) as LocationRow[];
    rows.push(...batch);
    if (batch.length < LOCATIONS_PAGE) break;
  }
  return withOrgNames(db, rows);
}

/** One venue by id, independent of the picker list. */
export async function loadEvidenceLocation(id: string, db: Db = createServiceRoleClient()): Promise<EvidenceLocation | null> {
  const { data, error } = await db.from("business_locations").select(LOCATION_COLUMNS).eq("id", id).limit(1);
  if (error) throw new Error("evidence_location_failed");
  const row = (data ?? [])[0] as LocationRow | undefined;
  if (!row || row.id !== id) return null;
  return (await withOrgNames(db, [row]))[0] ?? null;
}

export type ExtractFile = { name: string; sha256: string; bytes: number };

export type ExtractManifest = {
  schema: "audiolad.evidence.play-log-extract/1";
  extract_id: string;
  created_at_utc: string;
  created_by: { user_id: string; email: string | null };
  location: EvidenceLocation;
  window: { from_utc: string; to_utc: string; from_local: string; to_local: string; timezone: string };
  source: {
    table: "public.playback_usage_facts";
    filters: string;
    time_basis: string;
    rows_read: number;
    pages: number;
    complete: true;
  };
  counts: { facts: number; plays: number; players: number; tracks: number };
  players: Array<{ id: string; code: string | null; name: string | null }>;
  tracks: Array<{
    audio_item_id: string;
    al_code: string | null;
    title: string | null;
    passport_status: string | null;
    master_sha256: string | null;
    fingerprint_sha256: string | null;
  }>;
  files: ExtractFile[];
  seal: { algorithm: "Ed25519"; public_key_sha256: string; public_key_file: "seal-public.pem"; note: string };
  pdf_rendered: boolean;
};

export type ExtractResult =
  | { ok: true; id: string; manifestSha256: string; facts: number; plays: number; pdf: boolean }
  | { ok: false; error: "bad_window" | "window_too_long" | "no_location" | "too_many_facts" | "db_error" | "storage_error" };

async function loadLabels(db: Db, ids: string[]) {
  const labels = new Map<string, TrackLabel>();
  const tracks: ExtractManifest["tracks"] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [items, passports] = await Promise.all([
      db.from("audio_items").select("id, title, music_track_code").in("id", chunk),
      db.from("business_track_passports")
        .select("audio_item_id, al_code, status, master_sha256, fingerprint_sha256")
        .in("audio_item_id", chunk),
    ]);
    if (items.error || passports.error) throw new Error("evidence_labels_failed");
    const pass = new Map((passports.data ?? []).map((p) => [p.audio_item_id as string, p]));
    const itemMap = new Map((items.data ?? []).map((it) => [it.id as string, it]));
    for (const id of chunk) {
      const it = itemMap.get(id);
      const p = pass.get(id);
      const code = ((p?.al_code as string) || (it?.music_track_code as string) || null) ?? null;
      const title = (it?.title as string) ?? null;
      labels.set(id, { code, title });
      tracks.push({
        audio_item_id: id,
        al_code: code,
        title,
        passport_status: (p?.status as string) ?? null,
        master_sha256: (p?.master_sha256 as string) ?? null,
        fingerprint_sha256: (p?.fingerprint_sha256 as string) ?? null,
      });
    }
  }
  tracks.sort((a, b) => String(a.al_code).localeCompare(String(b.al_code)));
  return { labels, tracks };
}

function newExtractId(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const d = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  const t = `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  return `${d}-${t}-${randomBytes(4).toString("hex")}`;
}

async function renderPdf(dir: string, input: unknown): Promise<boolean> {
  const helper = resolve(process.cwd(), "scripts/evidence/render_extract_pdf.py");
  const inPath = join(dir, ".pdf-input.json");
  await writeFile(inPath, JSON.stringify(input), { mode: 0o600 });
  try {
    await execFileAsync("nice", ["-n", "10", evidencePython(), helper, "--input", inPath, "--out", join(dir, "extract.pdf"),
      "--fonts", PDF_FONT_DIR], { timeout: 180_000, maxBuffer: 1024 * 1024 });
    await stat(join(dir, "extract.pdf"));
    await chmod(join(dir, "extract.pdf"), 0o600);
    return true;
  } catch (error) {
    console.error("evidence_pdf_failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return false;
  } finally {
    await rm(inPath, { force: true });
  }
}

export async function createPlayLogExtract(input: {
  locationId: string;
  fromUtc: Date;
  toUtc: Date;
  actor: { userId: string; email: string | null };
  /** Tests pass a fake client; production uses the service role. */
  db?: Db;
}): Promise<ExtractResult> {
  const from = input.fromUtc.getTime();
  const to = input.toUtc.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return { ok: false, error: "bad_window" };
  if (to - from > EXTRACT_MAX_WINDOW_MS) return { ok: false, error: "window_too_long" };

  let db: Db;
  try {
    db = input.db ?? createServiceRoleClient();
  } catch {
    return { ok: false, error: "db_error" };
  }
  let location: EvidenceLocation | null;
  try {
    location = await loadEvidenceLocation(input.locationId, db);
  } catch {
    return { ok: false, error: "db_error" };
  }
  if (!location) return { ok: false, error: "no_location" };

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();
  const paged = await fetchAllPlaybackFacts(db, {
    organizationId: location.organizationId,
    locationId: location.id,
    from: fromIso,
    to: toIso,
    maxRows: EXTRACT_MAX_FACTS,
    columns: EVIDENCE_FACT_COLUMNS,
  });
  if (paged.error) return { ok: false, error: "db_error" };
  // Evidence must be complete: an incomplete extract is refused, never produced.
  if (paged.truncated) return { ok: false, error: "too_many_facts" };
  const facts = paged.rows as EvidenceFact[];

  const audioIds = [...new Set(facts.map((f) => f.audio_item_id).filter((x): x is string => !!x))];
  const playerIds = [...new Set(facts.map((f) => f.player_id).filter((x): x is string => !!x))];
  let labels: Map<string, TrackLabel>;
  let tracks: ExtractManifest["tracks"];
  const players: ExtractManifest["players"] = [];
  try {
    ({ labels, tracks } = await loadLabels(db, audioIds));
    if (playerIds.length) {
      const { data, error } = await db.from("business_players").select("id, player_code, display_name").in("id", playerIds);
      if (error) throw new Error("evidence_players_failed");
      const byId = new Map((data ?? []).map((p) => [p.id as string, p]));
      for (const id of playerIds) {
        const p = byId.get(id);
        players.push({ id, code: (p?.player_code as string) ?? null, name: (p?.display_name as string) ?? null });
      }
    }
  } catch {
    return { ok: false, error: "db_error" };
  }
  const playerCodes = new Map(players.filter((p) => p.code).map((p) => [p.id, p.code as string]));
  const plays = reconstructPlays(facts);
  const tz = location.timezone;

  const now = new Date();
  const id = newExtractId(now);
  const root = evidenceRoot();
  const finalDir = extractDir(id, root);
  const tmpDir = `${finalDir}.partial`;
  try {
    await mkdir(tmpDir, { recursive: true, mode: 0o700 });
    const seal = await loadOrCreateSealKey(root);
    const files: ExtractFile[] = [];
    const put = async (name: string, body: string | Buffer) => {
      const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
      await writeFile(join(tmpDir, name), buf, { mode: 0o600 });
      files.push({ name, sha256: sha256Hex(buf), bytes: buf.length });
    };
    // UTF-8 BOM so Excel opens Cyrillic titles correctly; the hash covers the exact bytes.
    await put("plays.csv", "\ufeff" + playsCsv(plays, labels, playerCodes, tz));
    await put("facts.csv", "\ufeff" + factsCsv(facts, labels, tz));
    await put("seal-public.pem", seal.publicPem);
    // Written before the manifest so its hash is sealed too (no manifest hash inside: no cycle).
    await put("VERIFY.txt", verifyText(seal.fingerprint));

    const window = {
      from_utc: fromIso, to_utc: toIso, from_local: formatLocal(fromIso, tz), to_local: formatLocal(toIso, tz), timezone: tz,
    };
    const pdf = await renderPdf(tmpDir, {
      extract_id: id,
      created_at_utc: now.toISOString(),
      created_local: formatLocal(now.toISOString(), tz),
      location,
      window,
      counts: { facts: facts.length, plays: plays.length, players: players.length, tracks: tracks.length },
      players,
      files: files.filter((f) => f.name.endsWith(".csv")),
      seal_fingerprint: seal.fingerprint,
      plays: plays.map((p) => ({
        first_local: formatLocal(p.firstAt, tz),
        last_local: formatLocal(p.lastAt, tz),
        player: (p.playerId && playerCodes.get(p.playerId)) || "",
        code: (p.audioItemId && labels.get(p.audioItemId)?.code) || "",
        title: (p.audioItemId && labels.get(p.audioItemId)?.title) || "",
        pos_from_s: Math.round(p.posFromMs / 1000),
        pos_to_s: Math.round(p.posToMs / 1000),
        facts: p.facts,
      })),
    });
    if (pdf) {
      const buf = await readFile(join(tmpDir, "extract.pdf"));
      files.push({ name: "extract.pdf", sha256: sha256Hex(buf), bytes: buf.length });
    }
    // Nothing unsealed may stay in the folder (e.g. a half-written PDF after a renderer crash).
    const listed = new Set(files.map((f) => f.name));
    for (const name of await readdir(tmpDir)) {
      if (!listed.has(name)) await rm(join(tmpDir, name), { recursive: true, force: true });
    }

    const manifest: ExtractManifest = {
      schema: "audiolad.evidence.play-log-extract/1",
      extract_id: id,
      created_at_utc: now.toISOString(),
      created_by: { user_id: input.actor.userId, email: input.actor.email },
      location,
      window,
      source: {
        table: "public.playback_usage_facts",
        filters: "usage_kind = 'business' AND organization_id = location.organization_id AND location_id = location.id AND listened_ms > 0 AND occurred_at BETWEEN window.from_utc AND window.to_utc",
        time_basis: "occurred_at – время сервера в момент приёма отметки плеера (NTP); position_ms – позиция в треке по данным плеера",
        rows_read: facts.length,
        pages: paged.pages,
        complete: true,
      },
      counts: { facts: facts.length, plays: plays.length, players: players.length, tracks: tracks.length },
      players,
      tracks,
      files,
      seal: {
        algorithm: "Ed25519",
        public_key_sha256: seal.fingerprint,
        public_key_file: "seal-public.pem",
        note: "Техническая печать сервиса АудиоЛад (не квалифицированная электронная подпись). Подпись в manifest.sig покрывает точные байты manifest.json.",
      },
      pdf_rendered: pdf,
    };
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
    await writeFile(join(tmpDir, "manifest.json"), manifestBuf, { mode: 0o600 });
    await writeFile(join(tmpDir, "manifest.sig"), sealBytes(seal, manifestBuf), { mode: 0o600 });
    const manifestSha256 = sha256Hex(manifestBuf);
    await rename(tmpDir, finalDir);
    return { ok: true, id, manifestSha256, facts: facts.length, plays: plays.length, pdf };
  } catch (error) {
    console.error("evidence_extract_storage_failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, error: "storage_error" };
  }
}

function verifyText(fingerprint: string): string {
  return [
    "Проверка выписки журнала воспроизведения АудиоЛад",
    "",
    `SHA-256 открытого ключа печати (seal-public.pem, DER): ${fingerprint}`,
    "",
    "1. Хеши файлов: sha256sum plays.csv facts.csv extract.pdf seal-public.pem VERIFY.txt – сравнить с полем files в manifest.json.",
    "2. Печать: openssl pkeyutl -verify -pubin -inkey seal-public.pem -rawin -in manifest.json -sigfile manifest.sig",
    "   Ожидаемый ответ: Signature Verified Successfully.",
    "3. Любое изменение manifest.json или файлов делает проверку неуспешной.",
    "",
  ].join("\n");
}

export type ExtractListItem = {
  id: string;
  createdAtUtc: string;
  locationName: string;
  organizationName: string;
  fromLocal: string;
  toLocal: string;
  timezone: string;
  facts: number;
  plays: number;
  manifestSha256: string;
  files: string[];
};

export async function listExtracts(limit = 50): Promise<ExtractListItem[]> {
  const dir = extractsDir();
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => EVIDENCE_ID_RE.test(n));
  } catch {
    return [];
  }
  names.sort().reverse();
  const out: ExtractListItem[] = [];
  for (const name of names.slice(0, limit)) {
    try {
      const buf = await readFile(join(dir, name, "manifest.json"));
      const m = JSON.parse(buf.toString("utf8")) as ExtractManifest;
      out.push({
        id: name,
        createdAtUtc: m.created_at_utc,
        locationName: m.location.name,
        organizationName: m.location.organizationName,
        fromLocal: m.window.from_local,
        toLocal: m.window.to_local,
        timezone: m.window.timezone,
        facts: m.counts.facts,
        plays: m.counts.plays,
        manifestSha256: sha256Hex(buf),
        files: [...m.files.map((f) => f.name), "manifest.json", "manifest.sig"],
      });
    } catch {
      // A broken folder is skipped, never shown half-read.
    }
  }
  return out;
}

export const EXTRACT_DOWNLOADABLE = new Set([
  "plays.csv", "facts.csv", "extract.pdf", "manifest.json", "manifest.sig", "seal-public.pem", "VERIFY.txt",
]);

export async function readExtractFile(id: string, name: string): Promise<Buffer | null> {
  if (!EVIDENCE_ID_RE.test(id) || !EXTRACT_DOWNLOADABLE.has(name)) return null;
  try {
    return await readFile(join(extractDir(id), name));
  } catch {
    return null;
  }
}
