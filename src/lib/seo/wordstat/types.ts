export const WORDSTAT_GET_TOP_PATH = "/v2/wordstat/topRequests";
export const WORDSTAT_API_ORIGIN = "https://searchapi.api.cloud.yandex.net";
export const WORDSTAT_GET_TOP_URL = `${WORDSTAT_API_ORIGIN}${WORDSTAT_GET_TOP_PATH}`;

/** Official GetTop phrase limit. */
export const WORDSTAT_MAX_PHRASE_LENGTH = 400;

/** Official default; conservative UX value. Do not request thousands. */
export const WORDSTAT_NUM_PHRASES = 20;

export const WORDSTAT_DEFAULT_REGION_ID = "225";
export const WORDSTAT_RUSSIA_REGION_LABEL = "Россия";
export const WORDSTAT_DEVICE_ALL = "DEVICE_ALL";
export const WORDSTAT_PERIOD_LABEL = "последние 30 дней";
export const WORDSTAT_TIMEOUT_MS = 5_000;
export const WORDSTAT_CACHE_TTL_MS = 20 * 60 * 1000;

export type WordstatOpportunityLevel =
  | "green"
  | "yellow_low"
  | "yellow_high"
  | "red_low"
  | "red_high";

export type WordstatOpportunityColor = "green" | "yellow" | "red";

export type WordstatOpportunity = {
  level: WordstatOpportunityLevel;
  color: WordstatOpportunityColor;
  label: string;
  description: string;
};

export type WordstatSuggestionSource = "result" | "association";

export type WordstatSuggestion = {
  phrase: string;
  count: number;
  source: WordstatSuggestionSource;
  opportunity: WordstatOpportunity;
};

export type WordstatRegion = {
  id: string;
  label: string;
};

export type WordstatSuggestionsPayload = {
  phrase: string;
  region: WordstatRegion;
  periodLabel: typeof WORDSTAT_PERIOD_LABEL;
  suggestions: WordstatSuggestion[];
  /** Aggregate for the topic. Never treat as the seed phrase frequency. */
  topicTotalCount: number | null;
};

export type WordstatErrorCode =
  | "WORDSTAT_DISABLED"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "NO_RESULTS"
  | "INVALID_PHRASE";

export type WordstatErrorResult = {
  ok: false;
  error: {
    code: WordstatErrorCode;
    message: string;
  };
};

export type WordstatSuccessResult = {
  ok: true;
  data: WordstatSuggestionsPayload;
};

export type WordstatResult = WordstatSuccessResult | WordstatErrorResult;
