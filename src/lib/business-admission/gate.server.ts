import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

type GateClient = Pick<ReturnType<typeof createServiceRoleClient>, "rpc">;

/**
 * Manual Business gate. Missing RPC or a failed read stays off, so a deploy
 * before the migration keeps today's cabinet. Only an explicit true turns it on.
 */
export async function businessManualContentGateEnabled(db: GateClient): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("business_manual_content_gate_enabled");
    return !error && data === true;
  } catch {
    return false;
  }
}
