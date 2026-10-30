/** One bounded pass. No scheduler is registered. Disabled without explicit opt-in. */
import { createClient } from "@supabase/supabase-js";
import { BUSINESS_PLAYER_RETENTION_DAYS_ERROR_CODE, runPlayerRetention } from "../src/lib/business-app/player-retention";

void runPlayerRetention(process.env, async (args) => {
  // Even credentials/client creation are skipped when the job is disabled.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("business_player_retention_environment_missing");
  const service = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await service.rpc("cleanup_business_player_listening_history", args)
    .abortSignal(AbortSignal.timeout(60_000));
  if (error || !data?.[0]) throw new Error("business_player_retention_rpc_failed");
  return data[0];
}, (entry) => console.log(JSON.stringify(entry))).catch((error: unknown) => {
  // Do not print credentials, URLs, row identifiers or upstream error details.
  console.error(JSON.stringify({ event: "business_player_retention", status: "failed",
    ...(error instanceof Error && error.message === BUSINESS_PLAYER_RETENTION_DAYS_ERROR_CODE
      ? { error: BUSINESS_PLAYER_RETENTION_DAYS_ERROR_CODE } : {}),
  }));
  process.exitCode = 1;
});
