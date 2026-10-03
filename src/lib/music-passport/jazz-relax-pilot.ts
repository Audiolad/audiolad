import { randomUUID } from "node:crypto";

import { isAudioPrepareInFlight, mapProductNormalizeJobToPrepareStatus } from "@/lib/author-products/audio-prepare-status";
import { PRACTICE_AUDIO_BUCKET } from "@/lib/author-products/product-audio-upload-contract";
import { isJazzRelaxAuthor } from "@/lib/authors/jazz-relax";
import { readMusicAnalyzerPassport, readMusicAnalyzerStructuredFacts } from "@/lib/music-analyzer-runs/passport";
import {
  MUSIC_ANALYZER_MAX_UPLOAD_BYTES,
  MUSIC_ANALYZER_RUNS_BUCKET,
} from "@/lib/music-analyzer-runs/constants";
import { buildRunStoragePath, safeAudioFilename, sha256Hex } from "@/lib/music-analyzer-runs/policy";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  ALBUM_PASSPORT_AGGREGATION_VERSION,
  albumPassportPromptFacts,
  albumPassportSummaryLines,
  attributesFromStructuredFacts,
  buildAlbumPassportDraft,
  nextDescriptionAlbumBinding,
  parseStoredStructuredFacts,
  sanitizeAnalysisVersion,
  storedFactsFromStructured,
  type AlbumFailedTrack,
  type AlbumPassportDraft,
  type AlbumPassportSource,
  type AlbumTrackSnapshot,
} from "@/lib/music-passport/album-aggregate";
import {
  albumPassportMatchesTracks,
  readAlbumPassportDisplay,
} from "@/lib/music-passport/album-passport-display";
import {
  buildJazzRelaxPassportView,
  type JazzRelaxPassportTrackView,
  type JazzRelaxPassportView,
} from "@/lib/music-passport/jazz-relax-status";

export class JazzRelaxPassportError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "JazzRelaxPassportError";
  }
}

export function assertJazzRelaxMusicPassport(input: {
  authorId: string | null | undefined;
  productKind: string | null | undefined;
}): void {
  if (!isJazzRelaxAuthor(input.authorId) || input.productKind?.trim() !== "music") {
    throw new JazzRelaxPassportError("jazz_relax_passport_forbidden", 403);
  }
}

type AudioRow = {
  id: string;
  title: string | null;
  position: number | null;
  audio_path: string | null;
  original_file_name: string | null;
  file_size_bytes: number | null;
  desired_product_audio_normalize_job_id: string | null;
};

type LinkRow = {
  id: string;
  audio_item_id: string;
  analyzer_run_id: string;
  source_sha256: string;
  track_title: string;
  created_at: string;
};

type RunRow = {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  sha256: string;
  error_code: string | null;
  finished_at: string | null;
  analyzer_version: string | null;
  analyzer_git_commit: string | null;
  normalized_json: unknown;
};

type PassportRow = {
  id: string;
  audio_item_id: string;
  analyzer_run_id: string | null;
  analyzer_version_text: string | null;
  analyzer_git_commit: string | null;
  analysis_version: string;
  structured_fields: unknown;
};

type AlbumRow = {
  id: string;
  version: number;
  status: "pending" | "completed" | "partial" | "failed";
  bpm_profile: unknown;
  key_profile: unknown;
  genre_profile: unknown;
  style_profile: unknown;
  mood_profile: unknown;
  instrument_profile: unknown;
  character_profile: unknown;
  sources: unknown;
  analyzer_version: string;
  analyzer_git_commit: string | null;
  aggregation_version: string;
  source_fingerprint: string;
};

const HEX_COMMIT = /^[0-9a-fA-F]{7,64}$/;

function service() {
  return createServiceRoleClient();
}

function commitOrNull(value: string | null | undefined): string | null {
  if (!value || !HEX_COMMIT.test(value)) return null;
  return value;
}

function analyzerFilename(audioPath: string, originalName: string | null): string {
  const fromPath = audioPath.split("/").pop() ?? "";
  const safe = safeAudioFilename(originalName?.trim() || fromPath || "track.mp3");
  if (/\.(mp3|wav)$/i.test(safe)) return safe;
  return audioPath.toLowerCase().endsWith(".wav") ? "track.wav" : "track.mp3";
}

function observedAt(finishedAt: string | null): string {
  const parsed = finishedAt ? Date.parse(finishedAt) : Number.NaN;
  if (Number.isFinite(parsed) && parsed < Date.now() - 1000) {
    return new Date(parsed).toISOString();
  }
  return new Date(Date.now() - 2000).toISOString();
}

async function loadTracks(practiceId: string): Promise<AudioRow[]> {
  const { data, error } = await service()
    .from("audio_items")
    .select("id, title, position, audio_path, original_file_name, file_size_bytes, desired_product_audio_normalize_job_id")
    .eq("practice_id", practiceId)
    .order("position", { ascending: true });
  if (error) throw new JazzRelaxPassportError("passport_storage_failed", 500);
  return (data ?? []) as AudioRow[];
}

async function loadPrepareState(items: AudioRow[]): Promise<{
  failed: Set<string>;
  inflight: Set<string>;
}> {
  const failed = new Set<string>();
  const inflight = new Set<string>();
  const ids = items
    .map((item) => item.desired_product_audio_normalize_job_id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { failed, inflight };
  const { data, error } = await service()
    .from("product_audio_normalize_jobs")
    .select("id, audio_item_id, status")
    .in("id", ids);
  if (error) throw new JazzRelaxPassportError("passport_storage_failed", 500);
  const byJob = new Map((data ?? []).map((job) => [job.id as string, job]));
  for (const item of items) {
    const job = item.desired_product_audio_normalize_job_id
      ? byJob.get(item.desired_product_audio_normalize_job_id)
      : null;
    const status = mapProductNormalizeJobToPrepareStatus(
      typeof job?.status === "string" ? job.status : null,
    );
    if (status === "failed") failed.add(item.id);
    if (isAudioPrepareInFlight(status)) inflight.add(item.id);
  }
  return { failed, inflight };
}

async function loadLinks(practiceId: string): Promise<LinkRow[]> {
  const { data, error } = await service()
    .from("music_passport_analysis_links")
    .select("id, audio_item_id, analyzer_run_id, source_sha256, track_title, created_at")
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: true });
  if (error) throw new JazzRelaxPassportError("passport_storage_failed", 500);
  return (data ?? []) as LinkRow[];
}

async function loadRuns(ids: string[]): Promise<Map<string, RunRow>> {
  const map = new Map<string, RunRow>();
  if (ids.length === 0) return map;
  const { data, error } = await service()
    .from("music_analyzer_runs")
    .select("id, status, sha256, error_code, finished_at, analyzer_version, analyzer_git_commit, normalized_json")
    .in("id", ids);
  if (error) throw new JazzRelaxPassportError("passport_storage_failed", 500);
  for (const row of data ?? []) map.set(row.id as string, row as RunRow);
  return map;
}

async function loadPassportsByRun(runIds: string[]): Promise<Map<string, PassportRow>> {
  const map = new Map<string, PassportRow>();
  if (runIds.length === 0) return map;
  const { data, error } = await service()
    .from("music_passport_versions")
    .select("id, audio_item_id, analyzer_run_id, analyzer_version_text, analyzer_git_commit, analysis_version, structured_fields")
    .in("analyzer_run_id", runIds);
  if (error) throw new JazzRelaxPassportError("passport_storage_failed", 500);
  for (const row of data ?? []) {
    if (row.analyzer_run_id) map.set(row.analyzer_run_id as string, row as PassportRow);
  }
  return map;
}

async function loadAlbums(practiceId: string): Promise<AlbumRow[]> {
  const { data, error } = await service()
    .from("music_album_passports")
    .select("id, version, status, bpm_profile, key_profile, genre_profile, style_profile, mood_profile, instrument_profile, character_profile, sources, analyzer_version, analyzer_git_commit, aggregation_version, source_fingerprint")
    .eq("practice_id", practiceId)
    .order("version", { ascending: true });
  if (error) throw new JazzRelaxPassportError("passport_storage_failed", 500);
  return (data ?? []) as AlbumRow[];
}

function latestLinks(links: LinkRow[]): Map<string, LinkRow> {
  const map = new Map<string, LinkRow>();
  for (const link of links) map.set(link.audio_item_id, link);
  return map;
}

async function materializeRun(input: {
  audioItemId: string;
  run: RunRow;
}): Promise<string | null> {
  const facts = readMusicAnalyzerStructuredFacts(input.run.normalized_json);
  const stored = storedFactsFromStructured(facts);
  const sourceRef = `analyzer-run:${input.run.id}`;
  const attributes = attributesFromStructuredFacts(facts, sourceRef);
  const { data, error } = await service().rpc("append_music_passport_from_analyzer_run", {
    p_audio_item_id: input.audioItemId,
    p_analyzer_run_id: input.run.id,
    p_analysis_version: sanitizeAnalysisVersion(input.run.analyzer_version),
    p_analyzer_version_text: (input.run.analyzer_version ?? "").slice(0, 200) || null,
    p_analyzer_git_commit: commitOrNull(input.run.analyzer_git_commit),
    p_source_sha256: input.run.sha256,
    p_observed_at: observedAt(input.run.finished_at),
    p_structured_fields: stored,
    p_attributes: attributes,
  });
  if (error || !data || typeof data !== "object") {
    console.error("jazz_relax_passport_append_failed", error?.message ?? "empty");
    return null;
  }
  const passportId = (data as { passport_id?: unknown }).passport_id;
  return typeof passportId === "string" ? passportId : null;
}

async function insertAlbum(practiceId: string, draft: AlbumPassportDraft): Promise<string | null> {
  const { data, error } = await service().rpc("insert_music_album_passport", {
    p_practice_id: practiceId,
    p_status: draft.status,
    p_aggregation_version: draft.aggregationVersion,
    p_analyzer_version: draft.analyzerVersion.slice(0, 200),
    p_analyzer_git_commit: commitOrNull(draft.analyzerGitCommit),
    p_sources: draft.sources,
    p_bpm_profile: draft.bpmProfile,
    p_key_profile: draft.keyProfile,
    p_genre_profile: draft.genreProfile,
    p_style_profile: draft.styleProfile,
    p_mood_profile: draft.moodProfile,
    p_instrument_profile: draft.instrumentProfile,
    p_character_profile: draft.characterProfile,
    p_source_fingerprint: draft.sourceFingerprint,
  });
  if (error || typeof data !== "string") {
    console.error("jazz_relax_album_passport_insert_failed", error?.message ?? "empty");
    return null;
  }
  return data;
}

function draftFromAlbumRow(row: AlbumRow): AlbumPassportDraft | null {
  if (
    !row.bpm_profile || !row.key_profile || !row.genre_profile
    || !row.style_profile || !row.mood_profile || !row.instrument_profile
    || !row.character_profile || !Array.isArray(row.sources)
  ) {
    return null;
  }
  return {
    aggregationVersion: ALBUM_PASSPORT_AGGREGATION_VERSION,
    status: row.status,
    analyzerVersion: row.analyzer_version,
    analyzerGitCommit: row.analyzer_git_commit,
    sources: row.sources as AlbumPassportSource[],
    bpmProfile: row.bpm_profile as AlbumPassportDraft["bpmProfile"],
    keyProfile: row.key_profile as AlbumPassportDraft["keyProfile"],
    genreProfile: row.genre_profile as AlbumPassportDraft["genreProfile"],
    styleProfile: row.style_profile as AlbumPassportDraft["styleProfile"],
    moodProfile: row.mood_profile as AlbumPassportDraft["moodProfile"],
    instrumentProfile: row.instrument_profile as AlbumPassportDraft["instrumentProfile"],
    characterProfile: row.character_profile as AlbumPassportDraft["characterProfile"],
    sourceFingerprint: row.source_fingerprint,
  };
}

async function syncPassports(practiceId: string): Promise<void> {
  const links = await loadLinks(practiceId);
  const runs = await loadRuns(links.map((link) => link.analyzer_run_id));
  const passports = await loadPassportsByRun(links.map((link) => link.analyzer_run_id));
  for (const link of links) {
    const run = runs.get(link.analyzer_run_id);
    if (!run || run.status !== "succeeded" || passports.has(run.id)) continue;
    await materializeRun({ audioItemId: link.audio_item_id, run });
  }

  const tracks = await loadTracks(practiceId);
  const prepare = await loadPrepareState(tracks);
  const prepareFailed = prepare.failed;
  const inflight = prepare.inflight;
  const freshLinks = await loadLinks(practiceId);
  const freshRuns = await loadRuns(freshLinks.map((link) => link.analyzer_run_id));
  const freshPassports = await loadPassportsByRun(freshLinks.map((link) => link.analyzer_run_id));
  const latest = latestLinks(freshLinks);
  const succeeded: AlbumTrackSnapshot[] = [];
  const failed: AlbumFailedTrack[] = [];
  let pending = false;
  let uncovered = false;
  for (const track of tracks) {
    const link = latest.get(track.id);
    const run = link ? freshRuns.get(link.analyzer_run_id) : null;
    const passport = link ? freshPassports.get(link.analyzer_run_id) : null;
    if (!run) {
      uncovered = true;
      continue;
    }
    if (run.status === "queued" || run.status === "processing") {
      pending = true;
      continue;
    }
    if (run.status === "succeeded" && passport) {
      const facts = parseStoredStructuredFacts(passport.structured_fields);
      if (!facts) {
        failed.push({ audioItemId: track.id, runId: run.id });
        continue;
      }
      succeeded.push({
        audioItemId: track.id,
        passportId: passport.id,
        runId: run.id,
        analyzerVersion: passport.analyzer_version_text ?? passport.analysis_version,
        analyzerGitCommit: passport.analyzer_git_commit,
        facts,
      });
      continue;
    }
    failed.push({ audioItemId: track.id, runId: run.id });
  }
  if (pending || uncovered || tracks.length === 0) return;
  if (prepareFailed.size > 0 || inflight.size > 0) return;
  const draft = buildAlbumPassportDraft({ succeeded, failed });
  if (draft.status === "completed" && succeeded.length !== tracks.length) return;
  await insertAlbum(practiceId, draft);
}

async function downloadTrack(audioPath: string): Promise<Uint8Array> {
  const { data, error } = await service().storage.from(PRACTICE_AUDIO_BUCKET).download(audioPath);
  if (error || !data) throw new JazzRelaxPassportError("track_audio_missing", 400);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MUSIC_ANALYZER_MAX_UPLOAD_BYTES) {
    throw new JazzRelaxPassportError("track_audio_unusable", 400);
  }
  return bytes;
}

async function enqueueTrack(input: {
  practiceId: string;
  userId: string;
  track: AudioRow;
}): Promise<void> {
  const audioPath = input.track.audio_path?.trim() ?? "";
  const bytes = await downloadTrack(audioPath);
  const sha = sha256Hex(bytes);
  const filename = analyzerFilename(audioPath, input.track.original_file_name);
  const mime = filename.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg";
  const runId = randomUUID();
  const storagePath = buildRunStoragePath(runId, filename);
  const uploaded = await service()
    .storage
    .from(MUSIC_ANALYZER_RUNS_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploaded.error) throw new JazzRelaxPassportError("analyzer_upload_failed", 500);
  const { error: enqueueError } = await service().rpc("enqueue_music_analyzer_run", {
    p_id: runId,
    p_created_by: input.userId,
    p_source_filename: filename,
    p_sha256: sha,
    p_byte_size: bytes.byteLength,
    p_mime_type: mime,
    p_storage_path: storagePath,
  });
  if (enqueueError) {
    await service().storage.from(MUSIC_ANALYZER_RUNS_BUCKET).remove([storagePath]);
    throw new JazzRelaxPassportError("analyzer_enqueue_failed", 500);
  }
  const { error: linkError } = await service().from("music_passport_analysis_links").insert({
    practice_id: input.practiceId,
    audio_item_id: input.track.id,
    analyzer_run_id: runId,
    source_sha256: sha,
    track_title: (input.track.title ?? "Трек").trim().slice(0, 300) || "Трек",
  });
  if (linkError) throw new JazzRelaxPassportError("passport_storage_failed", 500);
}

function trackBlock(track: AudioRow, prepareFailed: Set<string>, inflight: Set<string>): string | null {
  if (!track.audio_path?.trim()) return "missing_audio";
  if (inflight.has(track.id)) return "preparing";
  if (prepareFailed.has(track.id)) return "prepare_failed";
  if (typeof track.file_size_bytes === "number" && track.file_size_bytes > MUSIC_ANALYZER_MAX_UPLOAD_BYTES) {
    return "file_too_large";
  }
  return null;
}

function bareTrack(
  input: Omit<JazzRelaxPassportTrackView, "productPassport">,
): JazzRelaxPassportTrackView {
  return { ...input, productPassport: null };
}

function attachFrozenTrackPassports(
  tracks: JazzRelaxPassportTrackView[],
  draft: AlbumPassportDraft,
  runs: Map<string, RunRow>,
): JazzRelaxPassportTrackView[] {
  return tracks.map((track) => {
    if (track.state !== "ready") return track;
    const source = draft.sources.find((item) => (
      item.outcome === "succeeded" && item.audio_item_id === track.audioItemId
    ));
    if (!source || source.track_passport_version_id !== track.passportVersionId) return track;
    const run = source.music_analyzer_run_id ? runs.get(source.music_analyzer_run_id) : null;
    if (!run || run.status !== "succeeded") return track;
    const passport = readMusicAnalyzerPassport({ normalized: run.normalized_json });
    return {
      ...track,
      productPassport: {
        filename: track.title,
        analyzedAt: run.finished_at,
        passport: {
          ...passport,
          taxonomy: null,
          prompt: null,
        },
      },
    };
  });
}

function matchSettledAlbum(
  albums: AlbumRow[],
  tracks: JazzRelaxPassportTrackView[],
): { row: AlbumRow; draft: AlbumPassportDraft } | null {
  for (const row of [...albums].reverse()) {
    if (row.status !== "completed" && row.status !== "partial") continue;
    const draft = draftFromAlbumRow(row);
    if (!draft || !albumPassportMatchesTracks(draft, tracks)) continue;
    return { row, draft };
  }
  return null;
}

async function viewFor(practiceId: string): Promise<JazzRelaxPassportView> {
  const tracks = await loadTracks(practiceId);
  const prepare = await loadPrepareState(tracks);
  const prepareFailed = prepare.failed;
  const inflightPrepare = prepare.inflight;
  const links = await loadLinks(practiceId);
  const latest = latestLinks(links);
  const runs = await loadRuns([...latest.values()].map((link) => link.analyzer_run_id));
  const passports = await loadPassportsByRun([...latest.values()].map((link) => link.analyzer_run_id));
  const albums = await loadAlbums(practiceId);
  const trackViews: JazzRelaxPassportTrackView[] = tracks.map((track) => {
    const title = (track.title ?? "Трек").trim() || "Трек";
    const block = trackBlock(track, prepareFailed, inflightPrepare);
    if (block === "missing_audio") {
      return bareTrack({ audioItemId: track.id, title, state: "missing_audio", errorCode: block, passportVersionId: null, runId: null });
    }
    if (block) {
      return bareTrack({ audioItemId: track.id, title, state: "not_ready", errorCode: block, passportVersionId: null, runId: null });
    }
    const link = latest.get(track.id);
    const run = link ? runs.get(link.analyzer_run_id) : null;
    const passport = link ? passports.get(link.analyzer_run_id) : null;
    if (!link || !run) {
      return bareTrack({ audioItemId: track.id, title, state: "not_ready", errorCode: "not_started", passportVersionId: null, runId: null });
    }
    if (run.status === "queued") {
      return bareTrack({ audioItemId: track.id, title, state: "queued", errorCode: null, passportVersionId: null, runId: run.id });
    }
    if (run.status === "processing") {
      return bareTrack({ audioItemId: track.id, title, state: "processing", errorCode: null, passportVersionId: null, runId: run.id });
    }
    if (run.status === "succeeded" && passport) {
      return bareTrack({ audioItemId: track.id, title, state: "ready", errorCode: null, passportVersionId: passport.id, runId: run.id });
    }
    return bareTrack({
      audioItemId: track.id,
      title,
      state: "failed",
      errorCode: run.error_code ?? (run.status === "succeeded" ? "passport_write_failed" : "analyze_failed"),
      passportVersionId: null,
      runId: run.id,
    });
  });
  const running = trackViews.some((track) => track.state === "queued" || track.state === "processing");
  const matched = running ? null : matchSettledAlbum(albums, trackViews);
  const tracksForView = matched ? attachFrozenTrackPassports(trackViews, matched.draft, runs) : trackViews;
  const album = matched
    ? readAlbumPassportDisplay({
      id: matched.row.id,
      version: matched.row.version,
      draft: matched.draft,
    })
    : null;
  return buildJazzRelaxPassportView({
    tracks: tracksForView,
    completedAlbumPassportVersionId: matched?.row.status === "completed" ? matched.row.id : null,
    album,
    summary: matched?.draft.status === "completed"
      ? albumPassportSummaryLines(matched.draft)
      : [],
  });
}

export async function getJazzRelaxPassportStatus(input: {
  practiceId: string;
  authorId: string | null | undefined;
  productKind: string | null | undefined;
}): Promise<JazzRelaxPassportView> {
  assertJazzRelaxMusicPassport(input);
  await syncPassports(input.practiceId);
  return viewFor(input.practiceId);
}

export async function runJazzRelaxPassportAction(input: {
  practiceId: string;
  authorId: string | null | undefined;
  productKind: string | null | undefined;
  userId: string;
  action: "start" | "retry" | "reanalyze";
  audioItemId?: string | null;
}): Promise<JazzRelaxPassportView> {
  assertJazzRelaxMusicPassport(input);
  await syncPassports(input.practiceId);
  const tracks = await loadTracks(input.practiceId);
  const prepare = await loadPrepareState(tracks);
  const prepareFailed = prepare.failed;
  const inflightPrepare = prepare.inflight;
  const links = await loadLinks(input.practiceId);
  const latest = latestLinks(links);
  const runs = await loadRuns([...latest.values()].map((link) => link.analyzer_run_id));
  const passports = await loadPassportsByRun([...latest.values()].map((link) => link.analyzer_run_id));
  const pendingSources: AlbumPassportSource[] = [];

  for (const track of tracks) {
    if (input.audioItemId && track.id !== input.audioItemId) continue;
    const block = trackBlock(track, prepareFailed, inflightPrepare);
    if (block) {
      if (input.action === "reanalyze" || input.audioItemId) {
        throw new JazzRelaxPassportError("tracks_not_ready", 400);
      }
      continue;
    }
    const link = latest.get(track.id);
    const run = link ? runs.get(link.analyzer_run_id) : null;
    const passport = link ? passports.get(link.analyzer_run_id) : null;
    if (input.action === "retry") {
      if (!run || run.status !== "failed") continue;
    } else if (input.action === "start") {
      if (run && (run.status === "queued" || run.status === "processing")) continue;
      if (run?.status === "succeeded" && passport) {
        const bytes = await downloadTrack(track.audio_path ?? "");
        if (sha256Hex(bytes) === run.sha256) continue;
      }
    }
    const before = new Set(links.map((item) => item.analyzer_run_id));
    await enqueueTrack({ practiceId: input.practiceId, userId: input.userId, track });
    const after = await loadLinks(input.practiceId);
    const created = after.find((item) => item.audio_item_id === track.id && !before.has(item.analyzer_run_id));
    if (created) {
      pendingSources.push({
        outcome: "pending",
        audio_item_id: track.id,
        track_passport_version_id: null,
        music_analyzer_run_id: created.analyzer_run_id,
        analyzer_version: null,
        analyzer_git_commit: null,
      });
    }
  }

  if (input.action === "start" && pendingSources.length === 0 && tracks.every((track) => trackBlock(track, prepareFailed, inflightPrepare))) {
    throw new JazzRelaxPassportError("tracks_not_ready", 400);
  }

  if (pendingSources.length > 0) {
    const freshLinks = await loadLinks(input.practiceId);
    const freshLatest = latestLinks(freshLinks);
    const freshRuns = await loadRuns([...freshLatest.values()].map((link) => link.analyzer_run_id));
    const freshPassports = await loadPassportsByRun(
      [...freshLatest.values()].map((link) => link.analyzer_run_id),
    );
    const pendingIds = new Set(pendingSources.map((source) => source.audio_item_id));
    const succeeded: AlbumTrackSnapshot[] = [];
    const failed: AlbumFailedTrack[] = [];
    const pending = [...pendingSources];
    for (const track of tracks) {
      if (pendingIds.has(track.id)) continue;
      const link = freshLatest.get(track.id);
      const run = link ? freshRuns.get(link.analyzer_run_id) : null;
      const passport = link ? freshPassports.get(link.analyzer_run_id) : null;
      if (!run) continue;
      if (run.status === "queued" || run.status === "processing") {
        pending.push({
          outcome: "pending",
          audio_item_id: track.id,
          track_passport_version_id: null,
          music_analyzer_run_id: run.id,
          analyzer_version: null,
          analyzer_git_commit: null,
        });
        continue;
      }
      if (run.status === "succeeded" && passport) {
        const facts = parseStoredStructuredFacts(passport.structured_fields);
        if (facts) {
          succeeded.push({
            audioItemId: track.id,
            passportId: passport.id,
            runId: run.id,
            analyzerVersion: passport.analyzer_version_text ?? passport.analysis_version,
            analyzerGitCommit: passport.analyzer_git_commit,
            facts,
          });
          continue;
        }
      }
      failed.push({ audioItemId: track.id, runId: run.id });
    }
    await insertAlbum(
      input.practiceId,
      buildAlbumPassportDraft({ succeeded, failed, pending }),
    );
  }

  await syncPassports(input.practiceId);
  return viewFor(input.practiceId);
}

export async function jazzRelaxAlbumFactsForDescription(input: {
  practiceId: string;
  authorId: string | null | undefined;
  productKind: string | null | undefined;
}): Promise<{
  albumPassportVersionId: string | null;
  facts: string | null;
  alreadyBound: boolean;
}> {
  if (!isJazzRelaxAuthor(input.authorId) || input.productKind?.trim() !== "music") {
    return { albumPassportVersionId: null, facts: null, alreadyBound: false };
  }
  const { data: practice, error } = await service()
    .from("practices")
    .select("description_generation_metadata")
    .eq("id", input.practiceId)
    .maybeSingle();
  if (error || !practice) {
    throw new JazzRelaxPassportError("passport_storage_failed", 500);
  }
  const metadata = practice.description_generation_metadata as { generated_from_album_passport_version_id?: unknown } | null;
  const bound = typeof metadata?.generated_from_album_passport_version_id === "string"
    ? metadata.generated_from_album_passport_version_id
    : null;
  const albums = await loadAlbums(input.practiceId);
  const completed = [...albums].reverse().find((album) => album.status === "completed") ?? null;
  const versionId = nextDescriptionAlbumBinding({
    existingVersionId: bound,
    generatedFromVersionId: completed?.id ?? null,
  });
  if (!versionId) {
    return {
      albumPassportVersionId: null,
      facts: null,
      alreadyBound: false,
    };
  }
  const row = albums.find((album) => album.id === versionId) ?? null;
  const draft = row ? draftFromAlbumRow(row) : null;
  if (!draft) {
    return {
      albumPassportVersionId: versionId,
      facts: [
        "Музыкальный паспорт этой версии не опубликован.",
        "Не указывай BPM, тональность, жанр, стиль, настроение или инструменты.",
      ].join("\n"),
      alreadyBound: Boolean(bound),
    };
  }
  return {
    albumPassportVersionId: versionId,
    facts: albumPassportPromptFacts(draft),
    alreadyBound: Boolean(bound),
  };
}

export async function bindJazzRelaxDescriptionAlbumPassport(input: {
  practiceId: string;
  albumPassportVersionId: string;
}): Promise<string | null> {
  const { data, error } = await service().rpc("bind_description_album_passport", {
    p_practice_id: input.practiceId,
    p_album_passport_id: input.albumPassportVersionId,
  });
  if (error) {
    console.error("jazz_relax_description_bind_failed", error.message);
    return null;
  }
  return typeof data === "string" ? data : null;
}
