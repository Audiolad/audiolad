import type { NotifyIndexNowResult } from "@/lib/seo/indexnow/notify";
import type {
  EnqueueSearchRecrawlInput,
  EnqueueSearchRecrawlResult,
} from "@/lib/seo/search-recrawl/memory";

export async function recordIndexNowFailures(input: {
  urls: readonly string[];
  reason: string;
  result: NotifyIndexNowResult;
  entityType?: string | null;
  entityId?: string | null;
  enqueue: (item: EnqueueSearchRecrawlInput) => Promise<EnqueueSearchRecrawlResult>;
}): Promise<void> {
  if (input.result.status !== "failed" && input.result.status !== "partial") {
    return;
  }

  const failedUrls = input.result.batchResults
    .filter((batch) => !batch.http.ok)
    .flatMap((batch) => batch.urls);
  const targets = failedUrls.length > 0 ? failedUrls : input.result.status === "failed" ? input.urls : [];
  const seen = new Set<string>();

  for (const url of targets) {
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    await input.enqueue({
      url,
      engine: "indexnow",
      reason: input.reason,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });
  }
}
