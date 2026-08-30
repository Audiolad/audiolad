import { classifyWordstatClientPayload } from "@/lib/seo/primary-query-suggestions/client";
import { WORDSTAT_ERROR_MESSAGES } from "@/lib/seo/wordstat/errors";
import { sanitizePrimaryQuerySuggestions } from "@/lib/seo/primary-query-suggestions/validate";
import type {
  PrimaryQueryDiscoveryEvent,
  PrimaryQueryDiscoverySummary,
  PrimaryQuerySuggestInput,
  WordstatClientOutcome,
} from "@/lib/seo/primary-query-suggestions/types";

export type PrimaryQueryDiscoveryProduct = Omit<
  PrimaryQuerySuggestInput,
  "failedSeed"
>;

export type PrimaryQueryDiscoveryDeps = {
  fetchWordstat: (phrase: string) => Promise<WordstatClientOutcome>;
  fetchAiSuggestions: (
    input: PrimaryQuerySuggestInput,
  ) => Promise<{ ok: true; suggestions: string[] } | { ok: false }>;
};

export async function runPrimaryQueryDiscovery(
  input: {
    initialSeed: string;
    product: PrimaryQueryDiscoveryProduct;
    allowAiFallback: boolean;
  },
  deps: PrimaryQueryDiscoveryDeps,
  emit: (event: PrimaryQueryDiscoveryEvent) => void,
): Promise<PrimaryQueryDiscoverySummary> {
  const summary: PrimaryQueryDiscoverySummary = {
    wordstatCalls: 0,
    aiCalls: 0,
    savedPrimary: false,
  };

  emit({ type: "stage", stage: "wordstat_initial" });
  emit({ type: "seed", phrase: input.initialSeed });

  const first = await deps.fetchWordstat(input.initialSeed);
  summary.wordstatCalls += 1;

  if (first.kind === "success") {
    emit({ type: "wordstat_success", result: first.data });
    return summary;
  }

  if (first.kind === "error") {
    emit({
      type: "wordstat_error",
      code: first.code,
      message: first.message,
    });
    return summary;
  }

  if (!input.allowAiFallback) {
    emit({
      type: "wordstat_error",
      code: "NO_RESULTS",
      message: WORDSTAT_ERROR_MESSAGES.NO_RESULTS,
    });
    return summary;
  }

  emit({ type: "stage", stage: "ai_suggesting" });
  const ai = await deps.fetchAiSuggestions({
    title: input.product.title,
    subtitle: input.product.subtitle,
    description: input.product.description,
    productKind: input.product.productKind,
    failedSeed: input.initialSeed,
  });
  summary.aiCalls += 1;

  const suggestions =
    ai.ok
      ? sanitizePrimaryQuerySuggestions(ai.suggestions, input.initialSeed)
      : [];

  if (suggestions.length < 1) {
    emit({ type: "ai_fallback_failed" });
    return summary;
  }

  const [primarySuggestion, ...alternatives] = suggestions;
  emit({ type: "seed", phrase: primarySuggestion });
  emit({ type: "ai_alternatives", suggestions: alternatives });
  emit({ type: "stage", stage: "wordstat_ai_primary" });

  const second = await deps.fetchWordstat(primarySuggestion);
  summary.wordstatCalls += 1;

  if (second.kind === "success") {
    emit({ type: "wordstat_success", result: second.data });
    return summary;
  }

  if (second.kind === "no_results" && alternatives.length > 0) {
    emit({ type: "ai_primary_no_results_with_alternatives" });
    return summary;
  }

  if (second.kind === "no_results") {
    emit({
      type: "wordstat_error",
      code: "NO_RESULTS",
      message: WORDSTAT_ERROR_MESSAGES.NO_RESULTS,
    });
    return summary;
  }

  emit({
    type: "wordstat_error",
    code: second.code,
    message: second.message,
  });
  return summary;
}

export { classifyWordstatClientPayload };
