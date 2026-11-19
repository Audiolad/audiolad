// t1578u: match job → play-log concordance and the sealed «Отчёт сверки записи».
import "server-only";

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { fetchAllPlaybackFacts } from "@/lib/business-app/playback-facts-query";
import { concordance, type Concordance, type LogPlay, type MatchSegment } from "@/lib/evidence/concordance";
import { evidencePython, loadEvidenceLocation, loadTrackLabels, type EvidenceLocation } from "@/lib/evidence/extract.server";
import { REPORT_CURRENT_DIR, readJob, readJobResult, type MatchJob } from "@/lib/evidence/matcher.server";
import { EVIDENCE_FACT_COLUMNS, formatLocal, localInputToUtc, reconstructPlays, type EvidenceFact } from "@/lib/evidence/play-log";
import { evidenceRoot, loadOrCreateSealKey, sealBytes, sha256Hex } from "@/lib/evidence/storage.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const execFileAsync = promisify(execFile);
type Db = ReturnType<typeof createServiceRoleClient>;

/** Play log read around the recording: ±3 h of the stated start plus the recording length. */
export const CONCORDANCE_MARGIN_MS = 3 * 3600_000;
const CONCORDANCE_MAX_FACTS = 50_000;

export type MatchResult = {
  engine_version: string;
  created_at: string;
  input: { name: string; sha256: string; size_bytes: number; decoded_duration_s: number; probe: { tags?: Record<string, string> } };
  index: { version: string; built_at: string; audfprint_sha256: string; counts: Record<string, number>; olaf: { available: boolean; version: string | null } };
  params: Record<string, number>;
  claimed_refs: Array<{ code: string; title: string; sha256: string; duration_s: number }>;
  windows: Array<{ rec_from_s: number; rec_to_s: number; verdict: { status: string; code?: string; kind?: string }; claimed_verdict?: { status: string } }>;
  segments: Array<MatchSegment & { windows: number; both: number; confidence: string }>;
  summary: { windows: number; catalog_windows: number; control_windows: number; unmatched_windows: number; conflict_windows: number; claimed_windows: number; catalog_tracks: string[] };
};

export type JobConcordance = {
  location: EvidenceLocation;
  claimedStartUtc: string | null;
  claimedSource: "typed" | "file_metadata" | null;
  windowFromUtc: string;
  windowToUtc: string;
  facts: number;
  plays: LogPlay[];
  result: Concordance;
  titles: Record<string, string | null>;
};

function claimedStart(job: MatchJob, result: MatchResult, tz: string): { at: Date | null; source: JobConcordance["claimedSource"] } {
  if (job.recordedAtLocal) {
    const d = localInputToUtc(job.recordedAtLocal, tz);
    if (d) return { at: d, source: "typed" };
  }
  const tags = result.input.probe?.tags ?? {};
  const raw = tags["com.apple.quicktime.creationdate"] || tags["creation_time"];
  const t = raw ? Date.parse(raw) : NaN;
  // Many recorders stamp the END of the recording; the alignment does not depend on it,
  // it only reports the difference.
  return Number.isFinite(t) ? { at: new Date(t), source: "file_metadata" } : { at: null, source: null };
}

export async function computeJobConcordance(job: MatchJob, result: MatchResult, dbIn?: Db):
  Promise<JobConcordance | null> {
  if (!job.locationId) return null;
  const db = dbIn ?? createServiceRoleClient();
  const location = await loadEvidenceLocation(job.locationId, db);
  if (!location) return null;
  const claim = claimedStart(job, result, location.timezone);
  if (!claim.at) return null;
  const durMs = Math.round((result.input.decoded_duration_s || 0) * 1000);
  const from = new Date(claim.at.getTime() - CONCORDANCE_MARGIN_MS - durMs);
  const to = new Date(claim.at.getTime() + CONCORDANCE_MARGIN_MS + durMs);
  const paged = await fetchAllPlaybackFacts(db, {
    organizationId: location.organizationId, locationId: location.id,
    from: from.toISOString(), to: to.toISOString(), maxRows: CONCORDANCE_MAX_FACTS, columns: EVIDENCE_FACT_COLUMNS,
  });
  if (paged.error || paged.truncated) throw new Error("evidence_concordance_facts_failed");
  const facts = paged.rows as EvidenceFact[];
  const ids = [...new Set(facts.map((f) => f.audio_item_id).filter((x): x is string => !!x))];
  const { labels } = await loadTrackLabels(db, ids);
  const playerIds = [...new Set(facts.map((f) => f.player_id).filter((x): x is string => !!x))];
  const playerCodes = new Map<string, string>();
  if (playerIds.length) {
    const { data } = await db.from("business_players").select("id, player_code").in("id", playerIds);
    for (const p of data ?? []) playerCodes.set(p.id as string, p.player_code as string);
  }
  const plays: LogPlay[] = reconstructPlays(facts).map((p) => ({
    code: (p.audioItemId && labels.get(p.audioItemId)?.code) || null,
    estTrackStartAt: p.estTrackStartAt, firstAt: p.firstAt, lastAt: p.lastAt, posFromMs: p.posFromMs, posToMs: p.posToMs,
    playerCode: (p.playerId && playerCodes.get(p.playerId)) || null,
  }));
  const titles: Record<string, string | null> = {};
  for (const l of labels.values()) if (l.code) titles[l.code] = l.title;
  // A start stamped by the device may be the end of the recording; alignment ignores it.
  return {
    location, claimedStartUtc: claim.at.toISOString(), claimedSource: claim.source,
    windowFromUtc: from.toISOString(), windowToUtc: to.toISOString(), facts: facts.length, plays,
    result: concordance(result.segments, plays, claim.at), titles,
  };
}

export async function loadJobView(id: string) {
  const job = await readJob(id);
  if (!job) return null;
  const result = job.state === "done" ? ((await readJobResult(id)) as MatchResult | null) : null;
  let conc: JobConcordance | null = null;
  let concError = false;
  if (result) {
    try {
      conc = await computeJobConcordance(job, result);
    } catch {
      concError = true;
    }
  }
  const published = join(evidenceRoot(), "jobs", id, REPORT_CURRENT_DIR);
  const report = await readFile(join(published, "report.json")).catch(() => null);
  let titles: Record<string, string | null> = {};
  if (result) titles = await titlesByCodes(result.segments.map((s) => s.code)).catch(() => ({}));
  return { job, result, conc, concError, titles, reportSha256: report ? sha256Hex(report) : null, reportPdf: report ? await stat(join(published, "report.pdf")).then(() => true, () => false) : false };
}

export type ReportResult = { ok: true; sha256: string; pdf: boolean } | { ok: false; error: "not_ready" | "storage_error" | "db_error" };

export async function createMatchReport(id: string, actor: { userId: string; email: string | null }): Promise<ReportResult> {
  const job = await readJob(id);
  if (!job || job.state !== "done") return { ok: false, error: "not_ready" };
  const result = (await readJobResult(id)) as MatchResult | null;
  if (!result) return { ok: false, error: "not_ready" };
  let conc: JobConcordance | null = null;
  try {
    conc = await computeJobConcordance(job, result);
  } catch {
    return { ok: false, error: "db_error" };
  }
  const jobDirPath = join(evidenceRoot(), "jobs", id);
  // Every report is built in its own new folder and published by one atomic symlink swap, so
  // parallel runs never share files and a published set (JSON, signature, PDF, key) is always
  // consistent; a failed PDF in a new run cannot leave an older PDF next to the new JSON.
  const reportId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
  const dir = join(jobDirPath, "reports", reportId);
  const titles = await titlesByCodes(result.segments.map((s) => s.code)).catch(() => ({} as Record<string, string | null>));
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const seal = await loadOrCreateSealKey();
    const resultBuf = await readFile(join(jobDirPath, "result.json"));
    await writeFile(join(dir, "result.json"), resultBuf, { mode: 0o600 }); // the set is self-contained
    const tz = conc?.location.timezone ?? "Europe/Moscow";
    const now = new Date();
    const pdfInput = {
      job_id: id,
      created_local: formatLocal(now.toISOString(), tz),
      created_at_utc: now.toISOString(),
      timezone: tz,
      input: result.input,
      claim: job.claim,
      note: job.note,
      index: result.index,
      engine_version: result.engine_version,
      summary: result.summary,
      segments: result.segments.map((s) => ({ ...s, title: titles[s.code] ?? conc?.titles[s.code] ?? null })),
      claimed_refs: result.claimed_refs,
      concordance: conc && {
        location: conc.location, claimed_start_local: conc.claimedStartUtc ? formatLocal(conc.claimedStartUtc, tz) : null,
        claimed_source: conc.claimedSource,
        recording_start_local: conc.result.recordingStartUtc ? formatLocal(conc.result.recordingStartUtc, tz) : null,
        claimed_delta_s: conc.result.claimedDeltaS, catalog_segments: conc.result.catalogSegments,
        confirmed_segments: conc.result.confirmedSegments, order_consistent: conc.result.orderConsistent,
        facts: conc.facts, tolerance_s: conc.result.toleranceS,
        checks: conc.result.checks.map((c) => ({
          ...c, heard_from_local: c.heardFromUtc ? formatLocal(c.heardFromUtc, tz) : null,
          heard_to_local: c.heardToUtc ? formatLocal(c.heardToUtc, tz) : null,
        })),
      },
      seal_fingerprint: seal.fingerprint,
      result_sha256: sha256Hex(resultBuf),
    };
    const inPath = join(dir, ".pdf-input.json");
    await writeFile(inPath, JSON.stringify(pdfInput), { mode: 0o600 });
    let pdf = false;
    try {
      await execFileAsync("nice", ["-n", "10", evidencePython(), resolve(process.cwd(), "scripts/evidence/render_match_pdf.py"),
        "--input", inPath, "--out", join(dir, "report.pdf"), "--fonts", "/usr/share/fonts/truetype/dejavu"], { timeout: 180_000 });
      await stat(join(dir, "report.pdf"));
      await chmod(join(dir, "report.pdf"), 0o600);
      pdf = true;
    } catch (error) {
      console.error("evidence_match_pdf_failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    } finally {
      await rm(inPath, { force: true });
    }
    await writeFile(join(dir, "seal-public.pem"), seal.publicPem, { mode: 0o600 });
    const files = [{ name: "result.json", sha256: sha256Hex(resultBuf), bytes: resultBuf.length }];
    const pem = Buffer.from(seal.publicPem);
    files.push({ name: "seal-public.pem", sha256: sha256Hex(pem), bytes: pem.length });
    if (pdf) {
      const b = await readFile(join(dir, "report.pdf"));
      files.push({ name: "report.pdf", sha256: sha256Hex(b), bytes: b.length });
    }
    const report = {
      schema: "audiolad.evidence.recording-match-report/1",
      job_id: id,
      created_at_utc: now.toISOString(),
      created_by: actor,
      recording: { name: job.input.name, size_bytes: job.input.size, sha256: job.input.sha256, probe: result.input.probe,
        decoded_duration_s: result.input.decoded_duration_s },
      claim: job.claim,
      note: job.note,
      engine: { version: result.engine_version, params: result.params, index: result.index },
      summary: result.summary,
      segments: pdfInput.segments,
      claimed_refs: result.claimed_refs,
      concordance: conc && {
        location: conc.location, claimed_start_utc: conc.claimedStartUtc, claimed_source: conc.claimedSource,
        play_log_window: { from_utc: conc.windowFromUtc, to_utc: conc.windowToUtc, facts: conc.facts },
        result: conc.result,
      },
      files,
      seal: { algorithm: "Ed25519", public_key_sha256: seal.fingerprint, public_key_file: "seal-public.pem",
        note: "Техническая печать сервиса АудиоЛад (не квалифицированная электронная подпись). Подпись в report.sig покрывает точные байты report.json." },
    };
    const buf = Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8");
    await writeFile(join(dir, "report.json"), buf, { mode: 0o600 });
    await writeFile(join(dir, "report.sig"), sealBytes(seal, buf), { mode: 0o600 });
    const tmpLink = join(jobDirPath, `.${REPORT_CURRENT_DIR}-${reportId}`);
    await symlink(join("reports", reportId), tmpLink);
    await rename(tmpLink, join(jobDirPath, REPORT_CURRENT_DIR));
    return { ok: true, sha256: sha256Hex(buf), pdf };
  } catch (error) {
    console.error("evidence_match_report_failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return { ok: false, error: "storage_error" };
  }
}

/** Titles of catalog tracks by AL code (passport first, then audio_items.music_track_code). */
export async function titlesByCodes(codes: string[], db: Db = createServiceRoleClient()): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const list = [...new Set(codes.filter((c) => /^AL-T-[A-Za-z0-9-]+$/.test(c)))];
  if (!list.length) return out;
  const { data: pass } = await db.from("business_track_passports").select("audio_item_id, al_code").in("al_code", list);
  const byItem = new Map((pass ?? []).map((p) => [p.audio_item_id as string, p.al_code as string]));
  const { data: coded } = await db.from("audio_items").select("id, title, music_track_code").in("music_track_code", list);
  for (const it of coded ?? []) out[it.music_track_code as string] = (it.title as string) ?? null;
  if (byItem.size) {
    const { data: items } = await db.from("audio_items").select("id, title").in("id", [...byItem.keys()]);
    for (const it of items ?? []) out[byItem.get(it.id as string) as string] = (it.title as string) ?? null;
  }
  return out;
}
