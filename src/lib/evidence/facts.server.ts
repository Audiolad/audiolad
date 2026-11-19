// t1578u: reads the evidence columns of playback_usage_facts for one venue and window, with the
// M2 offline marker when migration 20270330120000 is applied and without it before.
import "server-only";

import { fetchAllPlaybackFacts, type PagedFactsResult } from "@/lib/business-app/playback-facts-query";
import { isMissingSchemaError } from "@/lib/evidence/ledger";
import { EVIDENCE_FACT_COLUMNS, EVIDENCE_FACT_COLUMNS_LEGACY } from "@/lib/evidence/play-log";

type Client = Parameters<typeof fetchAllPlaybackFacts>[0];
type Window = Omit<Parameters<typeof fetchAllPlaybackFacts>[1], "columns">;

export async function fetchEvidenceFacts(db: Client, window: Window): Promise<PagedFactsResult> {
  const paged = await fetchAllPlaybackFacts(db, { ...window, columns: EVIDENCE_FACT_COLUMNS });
  if (paged.error && isMissingSchemaError(paged.error)) {
    return fetchAllPlaybackFacts(db, { ...window, columns: EVIDENCE_FACT_COLUMNS_LEGACY });
  }
  return paged;
}
