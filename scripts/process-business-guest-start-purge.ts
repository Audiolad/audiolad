import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Hourly 48 h retention of guest-start network identifiers (task 253821e0).
// Runs regardless of the guest flag and of traffic. Prints one JSON line,
// counts only, no identifiers.
const BATCH = 5000;
const MAX_ROUNDS = 20;

async function main() {
  const client = createServiceRoleClient();
  let hitsDeleted = 0;
  let startsCleared = 0;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, error } = await client.rpc("business_guest_start_purge", { p_batch: BATCH });
    if (error) throw new Error("business_guest_start_purge_failed");
    const hits = Number((data as { hits_deleted?: number } | null)?.hits_deleted ?? 0);
    const starts = Number((data as { starts_cleared?: number } | null)?.starts_cleared ?? 0);
    hitsDeleted += hits;
    startsCleared += starts;
    if (hits < BATCH && starts < BATCH) break;
  }
  console.log(JSON.stringify({ hits_deleted: hitsDeleted, starts_cleared: startsCleared }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "business_guest_start_purge_runner_failed");
  process.exitCode = 1;
});
