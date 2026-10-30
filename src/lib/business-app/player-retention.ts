/** One-shot maintenance runner, matching the Studio cleanup script convention. */
export type RetentionResult = {
  cutoff: string | null;
  candidates: number;
  deleted: number;
  batches: number;
};

type Environment = Record<string, string | undefined>;
export type RetentionRpc = (args: {
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
  const enabled = env.BUSINESS_PLAYER_RETENTION_ENABLED === "true";
  const deleteEnabled = env.BUSINESS_PLAYER_RETENTION_DELETE_ENABLED === "true";
  const mode = !enabled ? "disabled" : deleteEnabled ? "delete" : "dry-run";
  const result: RetentionResult = enabled
    ? await rpc({
        p_enabled: true,
        p_delete_enabled: deleteEnabled,
        p_batch_size: 500,
        p_max_batches: 20,
      })
    : { cutoff: null, candidates: 0, deleted: 0, batches: 0 };
  log({ event: "business_player_retention", mode, ...result });
  return result;
}
