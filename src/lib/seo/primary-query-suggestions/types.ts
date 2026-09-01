import type { WordstatSuggestionsPayload } from "@/lib/seo/wordstat/types";

export const PRIMARY_QUERY_SUGGESTIONS_PATH =
  "/api/author/seo/primary-query-suggestions" as const;

export const PRIMARY_QUERY_AI_SUGGESTION_COUNT = 3;
export const PRIMARY_QUERY_AI_MAX_OUTPUT_TOKENS = 400;
export const PRIMARY_QUERY_AI_USER_LIMIT = 8;
export const PRIMARY_QUERY_AI_USER_WINDOW_MS = 15 * 60 * 1000;
export const PRIMARY_QUERY_AI_USER_KEY_PREFIX = "primary-query-ai:user:";

export const PRIMARY_QUERY_SUGGESTIONS_SCHEMA_NAME =
  "primary_query_suggestions" as const;

export type PrimaryQuerySuggestInput = {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  failedSeed: string;
};

export type PrimaryQueryAiErrorCode =
  | "AI_DISABLED"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_PROVIDER"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_OUTPUT"
  | "INVALID_INPUT";

export type PrimaryQueryAiErrorResult = {
  ok: false;
  error: {
    code: PrimaryQueryAiErrorCode;
    message: string;
  };
};

export type PrimaryQueryAiSuccessResult = {
  ok: true;
  suggestions: string[];
  provider: "yandex";
  model: string;
};

export type PrimaryQueryAiResult =
  | PrimaryQueryAiSuccessResult
  | PrimaryQueryAiErrorResult;

export type WordstatClientOutcome =
  | {
      kind: "success";
      data: WordstatSuggestionsPayload;
    }
  | { kind: "no_results" }
  | { kind: "error"; code: string; message: string };

export type PrimaryQueryDiscoveryStage =
  | "wordstat_initial"
  | "ai_suggesting"
  | "wordstat_ai_primary";

export type PrimaryQueryDiscoveryEvent =
  | { type: "stage"; stage: PrimaryQueryDiscoveryStage }
  | { type: "seed"; phrase: string }
  | { type: "wordstat_success"; result: WordstatSuggestionsPayload }
  | { type: "wordstat_error"; code: string; message: string }
  | { type: "ai_alternatives"; suggestions: string[] }
  | { type: "ai_fallback_failed" }
  | { type: "ai_primary_no_results_with_alternatives" };

export type PrimaryQueryDiscoverySummary = {
  wordstatCalls: number;
  aiCalls: number;
  savedPrimary: false;
};
