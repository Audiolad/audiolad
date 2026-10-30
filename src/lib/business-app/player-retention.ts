/** One-shot maintenance runner, matching the Studio cleanup script convention. */
export type RetentionResult = {
  cutoff: string | null;
  candidates: number;
  deleted: number;
  batches: number;
};

export const BUSINESS_PLAYER_RETENTION_DEFAULT_DAYS = 400;
export const BUSINESS_PLAYER_RETENTION_DAYS_ERROR =
  "BUSINESS_PLAYER_RETENTION_DAYS must be an integer between 30 and 3650";

function retentionDays(value: string | undefined): number {
  if (value === undefined) return BUSINESS_PLAYER_RETENTION_DEFAULT_DAYS;
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value))
      || Number(value) < 30 || Number(value) > 3650) {
    throw new Error(BUSINESS_PLAYER_RETENTION_DAYS_ERROR);
  }
  return Number(value);
}

type Environment = Record<string, string | undefined>;
export type RetentionRpc = (args: {
  p_retention_days: number;
  p_enabled: boolean;
  p_delete_enabled: boolean;
  p_batch_size: number;
  p_max_batches: number;
}) => Promise<RetentionResult>;

export async function runPlayerRetention(
  env: Environment,
  rpc: RetentionRpc,
  log: (entry: object) => void,
) {
  const days = retentionDays(env.BUSINESS_PLAYER_RETENTION_DAYS);
  const enabled = env.BUSINESS_PLAYER_RETENTION_ENABLED === "true";
  const deleteEnabled = env.BUSINESS_PLAYER_RETENTION_DELETE_ENABLED === "true";
  const mode = !enabled ? "disabled" : deleteEnabled ? "delete" : "dry-run";
  const result: RetentionResult = enabled
    ? await rpc({
        p_retention_days: days,
        p_enabled: true,
        p_delete_enabled: deleteEnabled,
        p_batch_size: 500,
        p_max_batches: 20,
      })
    : { cutoff: null, candidates: 0, deleted: 0, batches: 0 };
  log({ event: "business_player_retention", mode, ...result });
  return result;
}
