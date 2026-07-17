/**
 * Server-side contact sync helper placeholder.
 * Actual sync is performed by DB trigger + RPC after signup.
 */
export type SyncEmailContactResult =
  | { ok: true; contactId: string | null }
  | { ok: false; code: string };

export async function syncEmailContactForUser(
  userId: string,
): Promise<SyncEmailContactResult> {
  void userId;
  return {
    ok: false,
    code: "use_database_rpc",
  };
}
