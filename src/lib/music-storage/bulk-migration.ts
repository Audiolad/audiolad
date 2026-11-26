import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  copyPilotAsset,
  cutoverPilotAsset,
  pilotByteSize,
  releaseLocalSupabaseCopy,
  type PilotAssetRow,
} from "./pilot-asset-ops";
import {
  assertTempSpaceForBytes,
  DEFAULT_HOST_GUARDS,
  isTransientMusicStorageError,
  readHostGuardSnapshot,
  retryBackoffMs,
  type HostGuardThresholds,
} from "./host-guards";
import { evaluateS3QuotaBeforeCopy, type S3QuotaSnapshot } from "./s3-quota-guard";

export type BulkStage = "copy" | "cutover" | "release-local";

export type BulkMigrationOptions = {
  stage: BulkStage;
  execute: boolean;
  batchSize: number;
  concurrency: number;
  maxAttempts: number;
  afterAssetId: string | null;
  hostGuards: HostGuardThresholds;
};

export type BulkProgressTotals = {
  mastersTotal: number;
  stageEligible: number;
  copiesVerified: number;
  copiesCutover: number;
  copiesFailed: number;
  copiesRolledBack: number;
  localReleased: number;
  onTimewebProvider: number;
  pendingBytes: number;
  percentComplete: number;
};

export type BulkSessionResult = {
  dryRun: boolean;
  stage: BulkStage;
  host: ReturnType<typeof readHostGuardSnapshot>;
  totals: BulkProgressTotals;
  batch: Array<{
    id: string;
    path: string;
    sizeBytes: number;
    copyStatus: string | null;
    provider: string;
    action: string;
  }>;
  results?: Array<{ id: string; outcome: string; error?: string }>;
  paused: boolean;
  pauseReason?: string;
  next?: string;
  s3Quota?: S3QuotaSnapshot;
  lock?: { pid: number; path: string };
};

const ASSET_FIELDS = "id,storage_provider,storage_bucket,storage_path,accepted_mime_type,size_bytes,content_sha256,asset_role,lifecycle_state,created_at";

async function allVerifiedMasters(): Promise<PilotAssetRow[]> {
  const service = createServiceRoleClient();
  const rows: PilotAssetRow[] = [];
  for (;;) {
    const { data, error } = await service
      .from("music_audio_assets")
      .select(ASSET_FIELDS)
      .eq("asset_role", "master")
      .eq("lifecycle_state", "verified")
      .order("created_at", { ascending: true })
      .range(rows.length, rows.length + 999);
    if (error) throw new Error(`master_list_failed:${error.message}`);
    rows.push(...((data ?? []) as PilotAssetRow[]));
    if ((data ?? []).length < 1000) return rows;
  }
}

type CopyLite = {
  asset_id: string;
  status: string;
  attempt_count: number;
  updated_at: string;
  source_released_at: string | null;
  source_sha256: string | null;
  target_sha256: string | null;
};

async function copyMap(): Promise<Map<string, CopyLite>> {
  const service = createServiceRoleClient();
  const map = new Map<string, CopyLite>();
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await service
      .from("music_storage_copies")
      .select("asset_id,status,attempt_count,updated_at,source_released_at,source_sha256,target_sha256")
      .eq("target_provider", "timeweb_s3")
      .range(offset, offset + 999);
    if (error) throw new Error(`copy_list_failed:${error.message}`);
    for (const row of data ?? []) map.set(row.asset_id as string, row as CopyLite);
    if ((data ?? []).length < 1000) return map;
  }
}

function copyNeedsWork(
  asset: PilotAssetRow,
  copy: CopyLite | undefined,
  maxAttempts: number,
): boolean {
  if (!copy) return true;
  if (copy.status === "verified") return false;
  if (copy.status === "cutover" || copy.status === "rolled_back") return false;
  if (copy.status === "copying") {
    const ageMs = Date.now() - Date.parse(copy.updated_at);
    const staleMs = Number(process.env.AUDIOLAD_MUSIC_STORAGE_COPYING_STALE_MS) || 900_000;
    if (ageMs < staleMs) return false;
  }
  if (copy.status === "failed") {
    if (copy.attempt_count >= maxAttempts) return false;
    const waitMs = retryBackoffMs(copy.attempt_count);
    if (Date.now() - Date.parse(copy.updated_at) < waitMs) return false;
    return true;
  }
  return true;
}

function cutoverEligible(asset: PilotAssetRow, copy: CopyLite | undefined): boolean {
  if ((asset.storage_provider ?? "supabase_file") !== "supabase_file") return false;
  if (!copy || (copy.status !== "verified" && copy.status !== "rolled_back")) return false;
  if (!asset.content_sha256 || !copy.source_sha256 || !copy.target_sha256) return false;
  return copy.source_sha256 === asset.content_sha256
    && copy.target_sha256 === asset.content_sha256;
}

function releaseEligible(asset: PilotAssetRow, copy: CopyLite | undefined): boolean {
  if ((asset.storage_provider ?? "supabase_file") !== "timeweb_s3") return false;
  if (!copy || copy.status !== "cutover") return false;
  return !copy.source_released_at;
}

export async function summarizeBulkProgress(stage: BulkStage): Promise<BulkProgressTotals> {
  const masters = await allVerifiedMasters();
  const copies = await copyMap();
  let stageEligible = 0;
  let pendingBytes = 0;
  let copiesVerified = 0;
  let copiesCutover = 0;
  let copiesFailed = 0;
  let copiesRolledBack = 0;
  let localReleased = 0;
  let onTimewebProvider = 0;
  let stageComplete = 0;

  for (const asset of masters) {
    const copy = copies.get(asset.id);
    const size = Number(asset.size_bytes) || 0;
    if ((asset.storage_provider ?? "supabase_file") === "timeweb_s3") onTimewebProvider += 1;
    if (copy?.status === "verified") copiesVerified += 1;
    if (copy?.status === "cutover") copiesCutover += 1;
    if (copy?.status === "failed") copiesFailed += 1;
    if (copy?.status === "rolled_back") copiesRolledBack += 1;
    if (copy?.source_released_at) localReleased += 1;

    let eligible = false;
    if (stage === "copy") {
      eligible = (asset.storage_provider ?? "supabase_file") === "supabase_file"
        && copyNeedsWork(asset, copy, 99);
      if (eligible) pendingBytes += size;
      if (copy?.status === "verified") stageComplete += 1;
    } else if (stage === "cutover") {
      eligible = cutoverEligible(asset, copy);
      if (eligible) pendingBytes += size;
      if ((asset.storage_provider ?? "supabase_file") === "timeweb_s3") stageComplete += 1;
    } else {
      eligible = releaseEligible(asset, copy);
      if (eligible) pendingBytes += size;
      if (copy?.source_released_at) stageComplete += 1;
    }
    if (eligible) stageEligible += 1;
  }

  const percentComplete = masters.length > 0
    ? Math.round((stageComplete / masters.length) * 10_000) / 100
    : 100;

  return {
    mastersTotal: masters.length,
    stageEligible,
    copiesVerified,
    copiesCutover,
    copiesFailed,
    copiesRolledBack,
    localReleased,
    onTimewebProvider,
    pendingBytes,
    percentComplete,
  };
}

export async function planBulkBatch(options: BulkMigrationOptions): Promise<BulkSessionResult> {
  const masters = await allVerifiedMasters();
  const copies = await copyMap();
  const host = readHostGuardSnapshot(options.hostGuards);
  const totals = await summarizeBulkProgress(options.stage);

  const batch: BulkSessionResult["batch"] = [];
  let afterSeen = !options.afterAssetId;

  for (const asset of masters) {
    if (!afterSeen) {
      if (asset.id === options.afterAssetId) afterSeen = true;
      continue;
    }
    const copy = copies.get(asset.id);
    let include = false;
    let action = "skip";
    if (options.stage === "copy") {
      include = (asset.storage_provider ?? "supabase_file") === "supabase_file"
        && copyNeedsWork(asset, copy, options.maxAttempts);
      action = include ? (copy?.status === "failed" ? "retry_copy" : "copy") : "skip";
    } else if (options.stage === "cutover") {
      include = cutoverEligible(asset, copy);
      action = include ? "cutover" : "skip";
    } else {
      include = releaseEligible(asset, copy);
      action = include ? "release_local" : "skip";
    }
    if (!include) continue;
    batch.push({
      id: asset.id,
      path: asset.storage_path,
      sizeBytes: Number(asset.size_bytes) || 0,
      copyStatus: copy?.status ?? null,
      provider: asset.storage_provider ?? "supabase_file",
      action,
    });
    if (batch.length >= options.batchSize) break;
  }

  return {
    dryRun: !options.execute,
    stage: options.stage,
    host,
    totals,
    batch,
    paused: host.level === "critical" || host.level === "pause",
    pauseReason: host.reasons.join(","),
    next: options.execute
      ? "Requires AUDIOLAD_MUSIC_STORAGE_BULK=1"
      : "Re-run with --execute and AUDIOLAD_MUSIC_STORAGE_BULK=1",
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<{ id: string; outcome: string; error?: string }>,
): Promise<Array<{ id: string; outcome: string; error?: string }>> {
  const results: Array<{ id: string; outcome: string; error?: string }> = [];
  let index = 0;
  async function runOne(): Promise<void> {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      const item = items[current];
      try {
        results.push(await worker(item));
      } catch (error) {
        results.push({
          id: (item as { id: string }).id,
          outcome: "error",
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
      }
    }
  }
  const runners = Array.from({ length: Math.max(1, concurrency) }, () => runOne());
  await Promise.all(runners);
  return results;
}

export async function executeBulkBatch(
  options: BulkMigrationOptions,
): Promise<BulkSessionResult> {
  const planned = await planBulkBatch({ ...options, execute: false });
  if (planned.paused) {
    return { ...planned, dryRun: false, results: [], next: "paused_by_host_guard" };
  }

  const masters = await allVerifiedMasters();
  const byId = new Map(masters.map((asset) => [asset.id, asset]));
  const work = planned.batch
    .map((entry) => byId.get(entry.id))
    .filter((asset): asset is PilotAssetRow => Boolean(asset));

  let s3Quota: S3QuotaSnapshot | undefined;
  if (options.stage === "copy" && work.length > 0) {
    const largest = Math.max(...work.map((asset) => pilotByteSize(asset)));
    await assertTempSpaceForBytes(largest);
    const batchBytes = work.reduce((sum, asset) => sum + pilotByteSize(asset), 0);
    s3Quota = await evaluateS3QuotaBeforeCopy(batchBytes);
    if (!s3Quota.ok) {
      return {
        ...planned,
        dryRun: false,
        paused: true,
        pauseReason: "s3_quota_exceeded",
        s3Quota,
        results: [],
        next: "Reduce batch or raise TIMEWEB_S3_MUSIC_MASTERS_QUOTA_BYTES after review",
      };
    }
  }

  const results = await runWithConcurrency(work, options.concurrency, async (asset) => {
    const host = readHostGuardSnapshot(options.hostGuards);
    if (host.level === "critical" || host.level === "pause") {
      return { id: asset.id, outcome: "paused", error: host.reasons.join(",") };
    }
    try {
      const outcome = options.stage === "copy"
        ? await copyPilotAsset(asset)
        : options.stage === "cutover"
          ? await cutoverPilotAsset(asset)
          : await releaseLocalSupabaseCopy(asset);
      return { id: asset.id, outcome };
    } catch (error) {
      if (
        options.stage === "copy"
        && isTransientMusicStorageError(error)
      ) {
        return {
          id: asset.id,
          outcome: "transient_failed",
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        };
      }
      throw error;
    }
  });

  const totals = await summarizeBulkProgress(options.stage);
  return {
    ...planned,
    dryRun: false,
    totals,
    results,
    s3Quota,
    paused: results.some((row) => row.outcome === "paused"),
  };
}

export function parseBulkMigrationOptions(argv: string[]): BulkMigrationOptions {
  let stage: BulkStage = "copy";
  let execute = false;
  let batchSize = 25;
  let concurrency = 1;
  let maxAttempts = 5;
  let afterAssetId: string | null = null;
  const hostGuards = { ...DEFAULT_HOST_GUARDS };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") execute = true;
    else if (argument === "--stage") {
      const value = argv[index + 1];
      if (value !== "copy" && value !== "cutover" && value !== "release-local") {
        throw new Error("--stage must be copy, cutover or release-local");
      }
      stage = value;
      index += 1;
    } else if (argument === "--batch-size") {
      batchSize = Number(argv[index + 1]);
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
        throw new Error("--batch-size must be between 1 and 500");
      }
      index += 1;
    } else if (argument === "--concurrency") {
      concurrency = Number(argv[index + 1]);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
        throw new Error("--concurrency must be between 1 and 4");
      }
      index += 1;
    } else if (argument === "--max-attempts") {
      maxAttempts = Number(argv[index + 1]);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
        throw new Error("--max-attempts must be between 1 and 20");
      }
      index += 1;
    } else if (argument === "--after-asset-id") {
      afterAssetId = argv[index + 1]?.trim() || null;
      if (!afterAssetId) throw new Error("--after-asset-id requires a UUID");
      index += 1;
    } else if (argument === "--disk-pause-percent") {
      hostGuards.diskPausePercent = Number(argv[index + 1]);
      index += 1;
    } else if (argument === "--min-free-gb") {
      hostGuards.minFreeBytes = Number(argv[index + 1]) * 1024 * 1024 * 1024;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return {
    stage,
    execute,
    batchSize,
    concurrency,
    maxAttempts,
    afterAssetId,
    hostGuards,
  };
}