import { PRIMARY_QUERY_SUGGESTIONS_PATH } from "@/lib/seo/primary-query-suggestions/types";
import type { PrimaryQuerySuggestInput } from "@/lib/seo/primary-query-suggestions/types";
import { wordstatClientErrorMessage } from "@/lib/seo/wordstat/errors";
import type { WordstatSuggestionsPayload } from "@/lib/seo/wordstat/types";
import type { WordstatClientOutcome } from "@/lib/seo/primary-query-suggestions/types";

export function buildPrimaryQuerySuggestionsRequest(
  input: PrimaryQuerySuggestInput,
): {
  url: typeof PRIMARY_QUERY_SUGGESTIONS_PATH;
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    body: string;
  };
} {
  return {
    url: PRIMARY_QUERY_SUGGESTIONS_PATH,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        subtitle: input.subtitle,
        description: input.description,
        productKind: input.productKind,
        failedSeed: input.failedSeed,
      }),
    },
  };
}

function readErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code : null;
}

export function classifyWordstatClientPayload(
  responseOk: boolean,
  payload: unknown,
): WordstatClientOutcome {
  if (payload && typeof payload === "object") {
    const record = payload as {
      suggestions?: unknown;
      code?: unknown;
      phrase?: unknown;
    };

    if (record.code === "NO_RESULTS") {
      return { kind: "no_results" };
    }

    if (Array.isArray(record.suggestions)) {
      if (
        record.suggestions.length > 0 &&
        typeof record.phrase === "string"
      ) {
        return {
          kind: "success",
          data: payload as WordstatSuggestionsPayload,
        };
      }

      return { kind: "no_results" };
    }
  }

  return {
    kind: "error",
    code: readErrorCode(payload) ?? "UPSTREAM_ERROR",
    message: wordstatClientErrorMessage(payload),
  };
}

export function shouldAllowAiFallback(input: {
  allowAiFallback: boolean;
  outcomeKind: WordstatClientOutcome["kind"];
  aiAlreadyUsed: boolean;
}): boolean {
  return (
    input.allowAiFallback &&
    !input.aiAlreadyUsed &&
    input.outcomeKind === "no_results"
  );
}
