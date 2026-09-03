import "server-only";

const DEFAULT_MIN_AMOUNT_MINOR = 10_000;
const DEFAULT_MAX_AMOUNT_MINOR = 100_000_000;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(entry)),
  );
}

export type AuthorAppreciationRolloutConfig = {
  enabled: boolean;
  allowedAuthorIds: Set<string>;
  minAmountMinor: number;
  maxAmountMinor: number;
};

export function getAuthorAppreciationRolloutConfig(): AuthorAppreciationRolloutConfig {
  const minAmountMinor = parsePositiveInteger(
    process.env.AUTHOR_APPRECIATION_GETCOURSE_MIN_AMOUNT_MINOR,
    DEFAULT_MIN_AMOUNT_MINOR,
  );
  const maxAmountMinor = parsePositiveInteger(
    process.env.AUTHOR_APPRECIATION_GETCOURSE_MAX_AMOUNT_MINOR,
    DEFAULT_MAX_AMOUNT_MINOR,
  );
  return {
    enabled: process.env.AUTHOR_APPRECIATION_GETCOURSE_ROLLOUT_ENABLED === "1",
    allowedAuthorIds: parseAllowlist(
      process.env.AUTHOR_APPRECIATION_GETCOURSE_AUTHOR_ALLOWLIST,
    ),
    minAmountMinor,
    maxAmountMinor: Math.max(minAmountMinor, maxAmountMinor),
  };
}

export function isAuthorAppreciationRolloutEnabled(
  config: AuthorAppreciationRolloutConfig,
  authorId: string,
): boolean {
  return config.enabled && config.allowedAuthorIds.has(authorId.toLowerCase());
}
