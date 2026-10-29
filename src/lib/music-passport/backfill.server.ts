/**
 * Music Passport backfill – DB snapshot (service role, reads only). The only
 * write path is enqueueJazzRelaxTrackForBackfill in jazz-relax-pilot.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isAudioPrepareInFlight, mapProductNormalizeJobToPrepareStatus } from "@/lib/author-products/audio-prepare-status";
import { authorIdsWithVerifiedRights } from "@/lib/business-admission/agreement-list";
import { resolveJazzRelaxAnalysisAudio } from "@/lib/music-passport/jazz-relax-pilot";
import { chunkIds } from "@/lib/supabase/chunk";

import type { BackfillAuthor, BackfillRunStatus, BackfillTrackInput } from "./backfill-plan";

type Db = SupabaseClient;

function fail(stage: string): never {
  throw new Error(`music_passport_backfill_read_failed:${stage}`);
}

async function inChunks<T>(
  ids: readonly string[],
  load: (chunk: string[]) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  stage: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of chunkIds([...new Set(ids)])) {
    const { data, error } = await load(chunk);
    if (error) fail(stage);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

/** Business-admitted (verified-rights) authors with their owner account. */
export async function loadVerifiedBusinessAuthors(db: Db): Promise<BackfillAuthor[]> {
  const verifications: { owner_user_id: string; status: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("business_rightsholder_verifications")
      .select("owner_user_id, status").eq("status", "verified").range(from, from + 999);
    if (error) fail("verifications");
    const page = (data ?? []) as { owner_user_id: string; status: string }[];
    verifications.push(...page.filter((row) => row.owner_user_id && row.status === "verified"));
    if (page.length < 1000) break;
  }
  const owners = [...new Set(verifications.map((row) => row.owner_user_id))];
  const memberships = await inChunks<{ user_id: string; author_id: string; role: string }>(
    owners,
    (chunk) => db.from("author_members").select("user_id, author_id, role").in("user_id", chunk).eq("role", "owner"),
    "members",
  );
  const verifiedIds = authorIdsWithVerifiedRights(verifications, memberships);
  const ownerByAuthor = new Map<string, string>();
  for (const member of memberships) {
    if (verifiedIds.has(member.author_id) && !ownerByAuthor.has(member.author_id)) {
      ownerByAuthor.set(member.author_id, member.user_id);
    }
  }
  const authors = await inChunks<{ id: string; slug: string | null; name: string | null }>(
    [...verifiedIds],
    (chunk) => db.from("authors").select("id, slug, name").in("id", chunk),
    "authors",
  );
  return authors.flatMap((author) => {
    const ownerUserId = ownerByAuthor.get(author.id);
    if (!ownerUserId) return [];
    return [{ id: author.id, slug: author.slug ?? author.id, name: author.name ?? "", ownerUserId }];
  });
}

export type BackfillSnapshot = {
  tracks: BackfillTrackInput[];
  /** practice id → order rank (oldest product first). */
  practiceOrder: Map<string, number>;
};

export async function loadBackfillSnapshot(db: Db, authors: readonly BackfillAuthor[]): Promise<BackfillSnapshot> {
  const practices = await inChunks<{ id: string; author_id: string; created_at: string }>(
    authors.map((author) => author.id),
    (chunk) => db.from("practices").select("id, author_id, created_at")
      .in("author_id", chunk).eq("product_kind", "music").is("deleted_at", null),
    "practices",
  );
  practices.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const practiceOrder = new Map(practices.map((practice, index) => [practice.id, index]));
  const authorByPractice = new Map(practices.map((practice) => [practice.id, practice.author_id]));

  type Item = {
    id: string;
    practice_id: string;
    position: number | null;
    audio_path: string | null;
    file_size_bytes: number | null;
    desired_music_master_asset_id: string | null;
    desired_product_audio_normalize_job_id: string | null;
  };
  const items = await inChunks<Item>(
    practices.map((practice) => practice.id),
    (chunk) => db.from("audio_items")
      .select("id, practice_id, position, audio_path, file_size_bytes, desired_music_master_asset_id, desired_product_audio_normalize_job_id")
      .in("practice_id", chunk),
    "audio_items",
  );
  const itemIds = items.map((item) => item.id);

  const masters = await inChunks<{
    id: string; audio_item_id: string; asset_role: string; lifecycle_state: string;
    storage_bucket: string; storage_path: string | null; size_bytes: number | null;
  }>(
    items.filter((item) => !item.audio_path?.trim() && item.desired_music_master_asset_id)
      .map((item) => item.desired_music_master_asset_id as string),
    (chunk) => db.from("music_audio_assets")
      .select("id, audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path, size_bytes").in("id", chunk),
    "masters",
  );
  const masterById = new Map(masters.map((row) => [row.id, row]));

  const jobs = await inChunks<{ id: string; status: string | null }>(
    items.map((item) => item.desired_product_audio_normalize_job_id).filter((id): id is string => Boolean(id)),
    (chunk) => db.from("product_audio_normalize_jobs").select("id, status").in("id", chunk),
    "prepare_jobs",
  );
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  const active = await inChunks<{ audio_item_id: string }>(
    itemIds,
    (chunk) => db.from("music_passport_versions").select("audio_item_id").in("audio_item_id", chunk).eq("status", "active"),
    "passports",
  );
  const withPassport = new Set(active.map((row) => row.audio_item_id));

  const links = await inChunks<{ audio_item_id: string; analyzer_run_id: string; created_at: string }>(
    itemIds,
    (chunk) => db.from("music_passport_analysis_links")
      .select("audio_item_id, analyzer_run_id, created_at").in("audio_item_id", chunk),
    "links",
  );
  links.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestRunByItem = new Map<string, string>();
  for (const link of links) latestRunByItem.set(link.audio_item_id, link.analyzer_run_id);
  const runs = await inChunks<{ id: string; status: BackfillRunStatus }>(
    [...latestRunByItem.values()],
    (chunk) => db.from("music_analyzer_runs").select("id, status").in("id", chunk),
    "runs",
  );
  const runStatus = new Map(runs.map((run) => [run.id, run.status]));

  const tracks = items.map((item): BackfillTrackInput => {
    const master = item.desired_music_master_asset_id ? masterById.get(item.desired_music_master_asset_id) : undefined;
    const analysis = resolveJazzRelaxAnalysisAudio({
      audioItemId: item.id,
      audioPath: item.audio_path,
      desiredMasterAssetId: item.desired_music_master_asset_id,
      master: master
        ? {
            id: master.id,
            audioItemId: master.audio_item_id,
            assetRole: master.asset_role,
            lifecycleState: master.lifecycle_state,
            storageBucket: master.storage_bucket,
            storagePath: master.storage_path,
          }
        : null,
    });
    const job = item.desired_product_audio_normalize_job_id ? jobById.get(item.desired_product_audio_normalize_job_id) : undefined;
    const prepare = mapProductNormalizeJobToPrepareStatus(typeof job?.status === "string" ? job.status : null);
    const runId = latestRunByItem.get(item.id);
    return {
      audioItemId: item.id,
      practiceId: item.practice_id,
      authorId: authorByPractice.get(item.practice_id) ?? "",
      position: item.position,
      hasPassport: withPassport.has(item.id),
      latestRunStatus: runId ? runStatus.get(runId) ?? null : null,
      source: analysis.kind === "missing_audio" ? "missing" : analysis.kind,
      sizeBytes: analysis.kind === "music_master" ? master?.size_bytes ?? null : item.file_size_bytes,
      prepareInFlight: isAudioPrepareInFlight(prepare),
      prepareFailed: prepare === "failed",
    };
  });
  return { tracks, practiceOrder };
}

/** Queued + processing analyzer runs across every source (author wizard, admin, backfill). */
export async function countGlobalAnalyzerInflight(db: Db): Promise<number> {
  const { count, error } = await db.from("music_analyzer_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "processing"]);
  if (error || typeof count !== "number") fail("analyzer_queue");
  return count;
}
