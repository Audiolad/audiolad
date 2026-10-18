import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account-level acceptance (owner decision 10.10.2026, Sergey 18.10.2026 18:26): one personal acceptance
 * by the account owner covers every current and future author workspace of that owner. Existing
 * per-workspace rows still count. Source of truth: SQL public.author_terms_covering_acceptances
 * (migration 20270110120000), service_role only. No I/O besides that RPC.
 */
export type CoveringAcceptance = {
  authorId: string;
  acceptanceId: string;
  termsVersionId: string;
  acceptedAt: string;
  acceptedByUserId: string | null;
  /** Workspace where the acceptance row was recorded (may differ from authorId). */
  sourceAuthorId: string;
};

type Row = {
  author_id: string;
  acceptance_id: string;
  terms_version_id: string;
  accepted_at: string;
  accepted_by_user_id: string | null;
  source_author_id: string;
};

export async function listCoveringAcceptances(
  client: SupabaseClient,
  authorIds: readonly string[],
): Promise<CoveringAcceptance[]> {
  const ids = [...new Set(authorIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await client.rpc("author_terms_covering_acceptances", { p_author_ids: ids });
  if (error) throw new Error("author_terms_covering_acceptances_failed");
  return ((data ?? []) as Row[]).map((r) => ({
    authorId: String(r.author_id),
    acceptanceId: String(r.acceptance_id),
    termsVersionId: String(r.terms_version_id),
    acceptedAt: String(r.accepted_at),
    acceptedByUserId: r.accepted_by_user_id ? String(r.accepted_by_user_id) : null,
    sourceAuthorId: String(r.source_author_id),
  }));
}

/** Prefer the workspace's own row, then the earliest acceptance (stable). */
export function pickCoveringAcceptance(
  rows: readonly CoveringAcceptance[],
  authorId: string,
  termsVersionId: string,
): CoveringAcceptance | null {
  const matching = rows.filter((r) => r.authorId === authorId && r.termsVersionId === termsVersionId);
  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => {
    const own = Number(b.sourceAuthorId === authorId) - Number(a.sourceAuthorId === authorId);
    if (own !== 0) return own;
    return a.acceptedAt < b.acceptedAt ? -1 : a.acceptedAt > b.acceptedAt ? 1 : a.acceptanceId.localeCompare(b.acceptanceId);
  })[0];
}

/**
 * Which OTHER owned workspaces to promote after an acceptance: only those waiting in
 * commercial_onboarding AND actually covered now (account-level rule re-checked per workspace).
 * Never trust the click alone: e.g. after a workspace transfer, the old owner's row covers only that
 * workspace, not the new owner's other workspaces (Codex review acct-r1).
 */
export function selectAccountWorkspacesToActivate(input: {
  acceptingAuthorId: string;
  waitingAuthorIds: readonly string[];
  coveredAuthorIds: ReadonlySet<string>;
}): string[] {
  return [...new Set(input.waitingAuthorIds)].filter(
    (id) => id !== input.acceptingAuthorId && input.coveredAuthorIds.has(id),
  );
}
