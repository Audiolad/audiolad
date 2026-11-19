// t1578u: recording ↔ catalog matcher («Сверка записей»): index builds and match jobs.
// Heavy work runs in a detached Python process (nice 19, ionice idle) that survives a PM2
// restart (setsid -f) and takes the host-wide heavy-job lock, so it never competes with
// hall streaming and never runs twice at once. Read-only towards the database.
import "server-only";

import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import { access, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import { evidenceRoot } from "@/lib/evidence/storage.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Db = ReturnType<typeof createServiceRoleClient>;

export const EVIDENCE_JOB_ID_RE = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$/;
export const MATCH_MAX_INPUT_BYTES = 500 * 1024 * 1024;
export const MATCH_MAX_CLAIM_BYTES = 150 * 1024 * 1024;
export const UPLOAD_CHUNK_MAX_BYTES = 3 * 1024 * 1024;
const SIGNED_URL_TTL_S = 6 * 3600;

export function evidencePythonBin(env: NodeJS.Dict<string> = process.env): string {
  return env.AUDIOLAD_EVIDENCE_PYTHON?.trim() || join(evidenceRoot(env), ".venv/bin/python");
}

export function evidenceOlafBin(env: NodeJS.Dict<string> = process.env): string {
  return env.AUDIOLAD_EVIDENCE_OLAF?.trim() || join(evidenceRoot(env), "bin/olaf");
}

function enginePath() {
  return resolve(process.cwd(), "scripts/evidence/evidence_match.py");
}

function paths(root = evidenceRoot()) {
  return {
    root,
    index: join(root, "index"),
    versions: join(root, "index", "versions"),
    current: join(root, "index", "current"),
    buildStatus: join(root, "index", "build-status.json"),
    buildLog: join(root, "index", "build.log"),
    lock: join(root, "locks", "heavy.lock"),
    jobs: join(root, "jobs"),
    control: join(root, "control", "control.json"),
  };
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(path: string, data: unknown) {
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
  await rename(tmp, path);
}

function newId(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}-${randomBytes(4).toString("hex")}`;
}

async function exists(path: string, mode = fsConstants.F_OK) {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

/** Starts a throttled engine run that outlives this process. Output goes to a log file. */
async function spawnHeavy(args: string[], logPath: string): Promise<void> {
  const ionice = (await exists("/usr/bin/ionice", fsConstants.X_OK)) ? ["ionice", "-c3"] : [];
  const fh = await open(logPath, "a", 0o600);
  try {
    const stdio: StdioOptions = ["ignore", fh.fd, fh.fd];
    const child: ChildProcess = spawn("setsid", ["-f", "nice", "-n", "19", ...ionice, evidencePythonBin(), enginePath(), ...args], {
      detached: true,
      stdio,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8", EVIDENCE_OLAF_BIN: evidenceOlafBin() } as unknown as NodeJS.ProcessEnv,
    });
    await new Promise<void>((ok, fail) => {
      child.once("error", fail);
      child.once("spawn", () => ok());
    });
    child.unref();
  } finally {
    await fh.close();
  }
}

// ------------------------------------------------------------------ index

export type IndexInfo = {
  version: string;
  builtAt: string;
  counts: { catalog: number; control: number; failed: number };
  olaf: { available: boolean; version: string | null };
  audfprintSha256: string | null;
  sizeBytes: number | null;
  failed: Array<{ code: string; status: string }>;
};

export type BuildStatus = { state: "waiting" | "running" | "done" | "failed"; done?: number; total?: number; error?: string; at?: string; since?: string; startedAt?: string; version?: string; pid?: number };

export type EngineState = {
  ready: boolean;
  pythonOk: boolean;
  olafOk: boolean;
  index: IndexInfo | null;
  build: BuildStatus | null;
};

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else if (e.isFile()) total += (await stat(p)).size;
  }
  return total;
}

export async function loadEngineState(): Promise<EngineState> {
  const p = paths();
  const pythonOk = await exists(evidencePythonBin(), fsConstants.X_OK);
  const olafOk = await exists(evidenceOlafBin(), fsConstants.X_OK);
  let index: IndexInfo | null = null;
  const raw = await readJson<Record<string, any>>(join(p.current, "index.json")); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (raw) {
    let sizeBytes: number | null = null;
    try {
      sizeBytes = await dirSize(await realpath(p.current));
    } catch {
      sizeBytes = null;
    }
    index = {
      version: String(raw.version ?? ""),
      builtAt: String(raw.built_at ?? ""),
      counts: raw.counts ?? { catalog: 0, control: 0, failed: 0 },
      olaf: raw.olaf ?? { available: false, version: null },
      audfprintSha256: raw.audfprint?.file_sha256 ?? null,
      sizeBytes,
      failed: (raw.tracks ?? []).filter((t: { status: string }) => t.status !== "ok").map((t: { code: string; status: string }) => ({ code: t.code, status: t.status })),
    };
  }
  let build = await readJson<BuildStatus>(p.buildStatus);
  // A running/waiting status whose engine is gone (killed, reboot) is shown as failed.
  if (build && (build.state === "running" || build.state === "waiting") && !buildBusy(build)) {
    build = { ...build, state: "failed", error: build.error ?? "interrupted" };
  }
  return { ready: pythonOk && !!index, pythonOk, olafOk, index, build };
}

type ManifestEntry = { code: string; kind: "catalog" | "control"; url: string; sha256: string | null; title: string | null };

async function catalogEntries(db: Db): Promise<ManifestEntry[]> {
  const passports: Array<Record<string, unknown>> = [];
  for (;;) {
    const { data, error } = await db
      .from("business_track_passports")
      .select("audio_item_id, al_code, stored_master_asset_id, stored_master_sha256")
      .eq("status", "approved")
      .order("audio_item_id", { ascending: true })
      .range(passports.length, passports.length + 999);
    if (error) throw new Error("evidence_passports_failed");
    passports.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const entries: ManifestEntry[] = [];
  for (let i = 0; i < passports.length; i += 200) {
    const chunk = passports.slice(i, i + 200);
    const assetIds = chunk.map((p) => p.stored_master_asset_id as string).filter(Boolean);
    const [{ data: assets, error }, { data: items }] = await Promise.all([
      db.from("music_audio_assets").select("id, storage_bucket, storage_path, audio_item_id, asset_role").in("id", assetIds),
      db.from("audio_items").select("id, title").in("id", chunk.map((p) => p.audio_item_id as string)),
    ]);
    if (error) throw new Error("evidence_assets_failed");
    const byId = new Map((assets ?? []).map((a) => [a.id as string, a]));
    const titles = new Map((items ?? []).map((it) => [it.id as string, (it.title as string) ?? null]));
    for (const p of chunk) {
      const a = byId.get(p.stored_master_asset_id as string);
      if (!a || a.audio_item_id !== p.audio_item_id || a.storage_bucket !== "music-masters" || !p.al_code) continue;
      const { data: signed, error: sErr } = await db.storage.from(String(a.storage_bucket)).createSignedUrl(String(a.storage_path), SIGNED_URL_TTL_S);
      if (sErr || !signed?.signedUrl) throw new Error("evidence_signed_url_failed");
      entries.push({
        code: String(p.al_code), kind: "catalog", url: signed.signedUrl,
        sha256: (p.stored_master_sha256 as string) ?? null, title: titles.get(p.audio_item_id as string) ?? null,
      });
    }
  }
  return entries;
}

async function controlEntries(): Promise<ManifestEntry[]> {
  const p = paths();
  const ctrl = await readJson<{ tracks: Array<{ code: string; title: string; sha256: string; file: string }> }>(p.control);
  if (!ctrl) return [];
  return ctrl.tracks.map((t) => ({
    code: t.code, kind: "control" as const, url: "", sha256: t.sha256, title: t.title,
    path: join(p.root, "control", t.file),
  })) as unknown as ManifestEntry[];
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Whether a build is still in progress. The engine records its pid in every running/waiting
 * status: a dead pid means the build crashed (SIGKILL, reboot) and a new one may start. Without
 * a pid (the request was written but the engine has not started yet) the status counts as busy
 * for 10 minutes; a status without any usable time is not busy.
 */
export function buildBusy(status: BuildStatus | null, now = Date.now(), alive: (pid: number) => boolean = pidAlive): boolean {
  if (!status || (status.state !== "running" && status.state !== "waiting")) return false;
  if (typeof status.pid === "number" && Number.isInteger(status.pid) && status.pid > 0) return alive(status.pid);
  const since = Date.parse(status.startedAt ?? status.since ?? "");
  return Number.isFinite(since) && now - since < 10 * 60_000;
}

export type StartBuildResult = { ok: true; version: string } | { ok: false; error: "busy" | "not_installed" | "no_tracks" | "db_error" | "spawn_failed" };

export async function startIndexBuild(): Promise<StartBuildResult> {
  if (!(await exists(evidencePythonBin(), fsConstants.X_OK))) return { ok: false, error: "not_installed" };
  if (buildStarting) return { ok: false, error: "busy" };
  buildStarting = true;
  try {
    return await startIndexBuildLocked();
  } finally {
    buildStarting = false;
  }
}

/** In-process guard: two clicks at once must not both pass the status check. */
let buildStarting = false;

async function startIndexBuildLocked(): Promise<StartBuildResult> {
  const p = paths();
  if (buildBusy(await readJson<BuildStatus>(p.buildStatus))) return { ok: false, error: "busy" };
  let entries: ManifestEntry[];
  try {
    entries = [...(await catalogEntries(createServiceRoleClient())), ...(await controlEntries())];
  } catch {
    return { ok: false, error: "db_error" };
  }
  if (!entries.some((e) => e.kind === "catalog")) return { ok: false, error: "no_tracks" };
  const version = newId();
  await mkdir(p.versions, { recursive: true, mode: 0o700 });
  // Old versions and crashed leftovers are pruned by the engine itself under the heavy lock.
  await mkdir(join(p.root, "locks"), { recursive: true, mode: 0o700 });
  // The manifest carries short-lived signed URLs: 0600, deleted by the engine on start.
  const manifest = join(p.index, `.manifest-${version}.json`);
  await writeFile(manifest, JSON.stringify({ tracks: entries.map((e) => ({ ...e, url: e.url || undefined })) }), { mode: 0o600 });
  await writeJsonAtomic(p.buildStatus, { state: "waiting", startedAt: new Date().toISOString(), version, total: entries.length, done: 0 });
  try {
    await spawnHeavy([
      "build", "--manifest", manifest, "--delete-manifest", "--out", join(p.versions, version), "--version", version,
      "--status", p.buildStatus, "--lock", p.lock, "--activate-link", p.current, "--prune", "--olaf", evidenceOlafBin(),
    ], p.buildLog);
  } catch {
    await rm(manifest, { force: true });
    await writeJsonAtomic(p.buildStatus, { state: "failed", error: "spawn_failed", at: new Date().toISOString() });
    return { ok: false, error: "spawn_failed" };
  }
  return { ok: true, version };
}

// ------------------------------------------------------------------ match jobs

export type JobSlot = "input" | "claim";

export type MatchJob = {
  id: string;
  createdAtUtc: string;
  createdBy: { userId: string; email: string | null };
  state: "uploading" | "queued" | "waiting" | "running" | "done" | "failed";
  input: { name: string; size: number; ext: string; sha256?: string };
  claim: { name: string; size: number; ext: string; label: string; sha256?: string } | null;
  locationId: string | null;
  recordedAtLocal: string | null;
  note: string | null;
  error?: string;
};

const EXT_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|amr|3gp|mp4|mov|webm|wma)$/i;

export function safeExt(name: string): string | null {
  const m = EXT_RE.exec(name.trim());
  return m ? m[1].toLowerCase() : null;
}

function jobDir(id: string) {
  if (!EVIDENCE_JOB_ID_RE.test(id)) throw new Error("evidence_bad_job");
  return join(paths().jobs, id);
}

export async function readJob(id: string): Promise<MatchJob | null> {
  if (!EVIDENCE_JOB_ID_RE.test(id)) return null;
  const job = await readJson<MatchJob>(join(jobDir(id), "job.json"));
  if (!job) return null;
  if (job.state === "queued" || job.state === "waiting" || job.state === "running") {
    const st = await readJson<{ state: string; error?: string }>(join(jobDir(id), "status.json"));
    if (st?.state === "waiting" || st?.state === "running" || st?.state === "failed") job.state = st.state as MatchJob["state"];
    if (st?.state === "done" && (await exists(join(jobDir(id), "result.json")))) job.state = "done";
    if (st?.error) job.error = st.error;
  }
  return job;
}

export async function createJob(input: {
  actor: { userId: string; email: string | null };
  fileName: string;
  size: number;
  claim: { fileName: string; size: number; label: string } | null;
  locationId: string | null;
  recordedAtLocal: string | null;
  note: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: "bad_file" | "too_large" | "storage_error" }> {
  const ext = safeExt(input.fileName);
  if (!ext || !Number.isInteger(input.size) || input.size <= 0) return { ok: false, error: "bad_file" };
  if (input.size > MATCH_MAX_INPUT_BYTES) return { ok: false, error: "too_large" };
  let claim: MatchJob["claim"] = null;
  if (input.claim) {
    const cext = safeExt(input.claim.fileName);
    if (!cext || !Number.isInteger(input.claim.size) || input.claim.size <= 0) return { ok: false, error: "bad_file" };
    if (input.claim.size > MATCH_MAX_CLAIM_BYTES) return { ok: false, error: "too_large" };
    claim = { name: input.claim.fileName.slice(0, 200), size: input.claim.size, ext: cext, label: input.claim.label.slice(0, 200) };
  }
  const id = newId();
  try {
    await mkdir(paths().jobs, { recursive: true, mode: 0o700 });
    await mkdir(jobDir(id), { mode: 0o700 });
    const job: MatchJob = {
      id, createdAtUtc: new Date().toISOString(), createdBy: input.actor, state: "uploading",
      input: { name: input.fileName.slice(0, 200), size: input.size, ext }, claim,
      locationId: input.locationId, recordedAtLocal: input.recordedAtLocal, note: input.note?.slice(0, 500) ?? null,
    };
    await writeJsonAtomic(join(jobDir(id), "job.json"), job);
    return { ok: true, id };
  } catch {
    return { ok: false, error: "storage_error" };
  }
}

/** Serialises uploads and finish of one job inside this process. */
const jobQueues = new Map<string, Promise<unknown>>();
function withJobLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = jobQueues.get(id) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  jobQueues.set(id, tail);
  void tail.then(() => {
    if (jobQueues.get(id) === tail) jobQueues.delete(id);
  });
  return run;
}

/**
 * Stores one chunk. `offset` must equal the bytes already stored, so a retried chunk is
 * ignored (idempotent) and a gap is refused. Chunks of one job are serialised, and the bytes
 * are written at `offset` (not appended), so even two overlapping requests from different
 * processes can only write the same range and never exceed the declared size.
 */
export function appendChunk(id: string, slot: JobSlot, offset: number, body: Uint8Array):
  Promise<{ ok: true; received: number } | { ok: false; error: "not_found" | "bad_offset" | "too_large" | "closed" }> {
  if (!EVIDENCE_JOB_ID_RE.test(id)) return Promise.resolve({ ok: false, error: "not_found" });
  return withJobLock(id, () => appendChunkLocked(id, slot, offset, body));
}

async function appendChunkLocked(id: string, slot: JobSlot, offset: number, body: Uint8Array):
  Promise<{ ok: true; received: number } | { ok: false; error: "not_found" | "bad_offset" | "too_large" | "closed" }> {
  if (!Number.isInteger(offset) || offset < 0) return { ok: false, error: "bad_offset" };
  const job = await readJob(id);
  if (!job) return { ok: false, error: "not_found" };
  if (job.state !== "uploading") return { ok: false, error: "closed" };
  const expected = slot === "input" ? job.input.size : job.claim?.size;
  if (!expected) return { ok: false, error: "not_found" };
  if (body.byteLength > UPLOAD_CHUNK_MAX_BYTES) return { ok: false, error: "too_large" };
  const part = join(jobDir(id), `${slot}.part`);
  let have = 0;
  try {
    have = (await stat(part)).size;
  } catch {
    have = 0;
  }
  if (offset + body.byteLength > expected) return { ok: false, error: "too_large" };
  if (offset + body.byteLength <= have) return { ok: true, received: have };
  if (offset !== have) return { ok: false, error: "bad_offset" };
  const fh = await open(part, fsConstants.O_RDWR | fsConstants.O_CREAT, 0o600);
  try {
    await fh.write(body, 0, body.byteLength, offset);
  } finally {
    await fh.close();
  }
  return { ok: true, received: offset + body.byteLength };
}

async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((ok, fail) => {
    createReadStream(path).on("data", (c) => h.update(c)).on("end", () => ok()).on("error", fail);
  });
  return h.digest("hex");
}

type FinishResult = { ok: true } | { ok: false; error: "not_found" | "incomplete" | "no_index" | "spawn_failed" };

export function finishUploadAndStart(id: string): Promise<FinishResult> {
  if (!EVIDENCE_JOB_ID_RE.test(id)) return Promise.resolve({ ok: false, error: "not_found" });
  return withJobLock(id, () => finishLocked(id));
}

async function finishLocked(id: string): Promise<FinishResult> {
  const job = await readJob(id);
  if (!job || job.state !== "uploading") return { ok: false, error: "not_found" };
  const dir = jobDir(id);
  const state = await loadEngineState();
  if (!state.ready) return { ok: false, error: "no_index" };
  // Every file must be complete before anything is renamed: an incomplete claim leaves the
  // job as it was, so the upload can continue and finish can be retried.
  const slots: Array<{ slot: JobSlot; size: number; ext: string }> = [{ slot: "input", size: job.input.size, ext: job.input.ext }];
  if (job.claim) slots.push({ slot: "claim", size: job.claim.size, ext: job.claim.ext });
  for (const x of slots) {
    const st = await stat(join(dir, `${x.slot}.part`)).catch(() => null);
    if (!st || st.size !== x.size) return { ok: false, error: "incomplete" };
  }
  // Cross-process claim of the finish (e.g. old and new server during a deploy cutover).
  try {
    await (await open(join(dir, "finish.claim"), "wx", 0o600)).close();
  } catch {
    return { ok: false, error: "not_found" };
  }
  const done: Record<string, { path: string; sha256: string }> = {};
  for (const x of slots) {
    const final = join(dir, `${x.slot}.${x.ext}`);
    await rename(join(dir, `${x.slot}.part`), final);
    done[x.slot] = { path: final, sha256: await sha256File(final) };
  }
  const inp = done.input;
  job.input.sha256 = inp.sha256;
  let claimPath: string | null = null;
  if (job.claim && done.claim) {
    job.claim.sha256 = done.claim.sha256;
    claimPath = done.claim.path;
  }
  job.state = "queued";
  await writeJsonAtomic(join(dir, "job.json"), job);
  const args = [
    "match", "--index", paths().current, "--input", inp.path, "--out", join(dir, "result.json"),
    "--status", join(dir, "status.json"), "--lock", paths().lock, "--olaf", evidenceOlafBin(),
  ];
  if (claimPath && job.claim) args.push("--extra", `${claimPath}::${job.claim.label || job.claim.name}`);
  try {
    await writeJsonAtomic(join(dir, "status.json"), { state: "waiting", since: new Date().toISOString() });
    await spawnHeavy(args, join(dir, "engine.log"));
  } catch {
    job.state = "failed";
    job.error = "spawn_failed";
    await writeJsonAtomic(join(dir, "job.json"), job);
    return { ok: false, error: "spawn_failed" };
  }
  return { ok: true };
}

export async function readJobResult(id: string): Promise<Record<string, unknown> | null> {
  if (!EVIDENCE_JOB_ID_RE.test(id)) return null;
  return readJson(join(jobDir(id), "result.json"));
}

export async function listJobs(limit = 30): Promise<MatchJob[]> {
  let names: string[] = [];
  try {
    names = (await readdir(paths().jobs)).filter((n) => EVIDENCE_JOB_ID_RE.test(n));
  } catch {
    return [];
  }
  names.sort().reverse();
  const out: MatchJob[] = [];
  for (const n of names.slice(0, limit)) {
    const j = await readJob(n);
    if (j) out.push(j);
  }
  return out;
}

/** The published report set of a job: a symlink to reports/<report id>/, swapped atomically. */
export const REPORT_CURRENT_DIR = "report-current";

export function jobFilePath(id: string, name: string): string | null {
  if (!EVIDENCE_JOB_ID_RE.test(id)) return null;
  if (name === "result.json") return join(jobDir(id), name);
  if (!["report.json", "report.sig", "report.pdf", "seal-public.pem"].includes(name)) return null;
  return join(jobDir(id), REPORT_CURRENT_DIR, name);
}
