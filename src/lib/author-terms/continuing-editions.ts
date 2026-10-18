import type { SupabaseClient } from "@supabase/supabase-js";

import { listCoveringAcceptances } from "@/lib/author-terms/covering-acceptances";

/**
 * Commercial continuation of an earlier Author Terms edition (Sergey 17.10.2026, still binding 18.10):
 * once 2.0 is current, authors who accepted 1.2 keep every 1.2 commercial feature (sales, payouts,
 * Studio) with NO end date. This must hold even when the app flag AUDIOLAD_UNIFIED_AGREEMENT_ENABLED
 * is off (e.g. the flag is turned off or lost on a redeploy while the DB is already switched),
 * otherwise flipping the flag would be a forced cut-off. Never grants AudioLad Business.
 *
 * Flag-independent and safe before the migration: `select("*")` never names the
 * commercial_access_continues column, so it works whether or not migration 20270109120000 ran.
 * Before the 2.0 switch no edition carries the flag and this returns an empty set (old behaviour).
 */
export async function listContinuingEditionIds(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from("author_terms_versions")
    .select("*")
    .eq("document_key", "author-terms");
  if (error) throw new Error("author_terms_continuing_editions_lookup_failed");
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => row.commercial_access_continues === true && row.is_current !== true)
    .map((row) => String(row.id));
}

/** Authors (subset of `authorIds`) covered (account level) by an acceptance of an edition that keeps commercial access. */
export async function loadAuthorsOnContinuingEdition(
  client: SupabaseClient,
  authorIds: readonly string[],
): Promise<Set<string>> {
  if (authorIds.length === 0) return new Set();
  const editionIds = await listContinuingEditionIds(client);
  if (editionIds.length === 0) return new Set();
  let covering;
  try {
    covering = await listCoveringAcceptances(client, authorIds);
  } catch {
    throw new Error("author_terms_continuing_acceptances_lookup_failed");
  }
  const editions = new Set(editionIds);
  return new Set(covering.filter((row) => editions.has(row.termsVersionId)).map((row) => row.authorId));
}
