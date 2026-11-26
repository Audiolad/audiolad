import { createServiceRoleClient } from "@/lib/supabase/service-role";

const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024 * 1024;

export function readS3QuotaBytes(): number {
  const raw = process.env.TIMEWEB_S3_MUSIC_MASTERS_QUOTA_BYTES?.trim();
  if (raw) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return DEFAULT_QUOTA_BYTES;
}

async function s3LedgerBytes(): Promise<number> {
  const service = createServiceRoleClient();
  let total = 0;
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await service
      .from("music_storage_copies")
      .select("size_bytes,status")
      .eq("target_provider", "timeweb_s3")
      .in("status", ["verified", "cutover", "rolled_back", "copying"])
      .range(offset, offset + 999);
    if (error) throw new Error(`s3_quota_ledger_failed:${error.message}`);
    for (const row of data ?? []) {
      total += Math.max(0, Number(row.size_bytes) || 0);
    }
    if ((data ?? []).length < 1000) return total;
  }
}

export type S3QuotaSnapshot = {
  quotaBytes: number;
  ledgerBytes: number;
  pendingCopyBytes: number;
  projectedBytes: number;
  headroomBytes: number;
  ok: boolean;
};

export async function evaluateS3QuotaBeforeCopy(plannedBatchBytes: number): Promise<S3QuotaSnapshot> {
  const quotaBytes = readS3QuotaBytes();
  const ledgerBytes = await s3LedgerBytes();
  const pendingCopyBytes = Math.max(0, plannedBatchBytes);
  const projectedBytes = ledgerBytes + pendingCopyBytes;
  const headroomBytes = quotaBytes - projectedBytes;
  return {
    quotaBytes,
    ledgerBytes,
    pendingCopyBytes,
    projectedBytes,
    headroomBytes,
    ok: headroomBytes >= 0,
  };
}