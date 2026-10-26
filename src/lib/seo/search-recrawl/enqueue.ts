import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isAudioladRecrawlUrl } from "@/lib/seo/search-recrawl/origin";
import type {
  EnqueueSearchRecrawlInput,
  EnqueueSearchRecrawlResult,
} from "@/lib/seo/search-recrawl/memory";

type EnqueueRpcRow = {
  id?: unknown;
  outcome?: unknown;
};

function logEnqueue(
  event: string,
  fields: Record<string, string | number | boolean | null>,
): void {
  console.info(
    `[search-recrawl] ${new Date().toISOString()} ${event}`,
    fields,
  );
}

function readEnqueueRow(data: unknown): EnqueueSearchRecrawlResult {
  const row = Array.isArray(data) ? (data[0] as EnqueueRpcRow | undefined) : (data as EnqueueRpcRow | null);
  const outcome = row?.outcome;
  const id = typeof row?.id === "string" ? row.id : "";

  if ((outcome === "inserted" || outcome === "deduped") && id) {
    return { outcome, id };
  }

  if (outcome === "rejected") {
    return { outcome: "rejected", reason: "foreign_origin" };
  }

  return { outcome: "failed" };
}

/**
 * Persist one audiolad.ru URL. Never throws. Service role only.
 * A pending row for the same engine and URL is refreshed, not duplicated.
 */
export async function enqueueSearchRecrawl(
  input: EnqueueSearchRecrawlInput,
): Promise<EnqueueSearchRecrawlResult> {
  const url = input.url.trim();

  if (!isAudioladRecrawlUrl(url)) {
    logEnqueue("rejected", {
      engine: input.engine,
      reason: input.reason,
      url: url || null,
      outcome: "foreign_origin",
    });
    return { outcome: "rejected", reason: "foreign_origin" };
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("enqueue_search_recrawl", {
      p_url: url,
      p_engine: input.engine,
      p_reason: input.reason,
      p_entity_type: input.entityType ?? null,
      p_entity_id: input.entityId ?? null,
    });

    if (error) {
      logEnqueue("enqueue_failed", {
        engine: input.engine,
        reason: input.reason,
        url,
      });
      return { outcome: "failed" };
    }

    const result = readEnqueueRow(data);
    logEnqueue(result.outcome, {
      engine: input.engine,
      reason: input.reason,
      url,
    });
    return result;
  } catch {
    logEnqueue("enqueue_failed", {
      engine: input.engine,
      reason: input.reason,
      url,
    });
    return { outcome: "failed" };
  }
}
