/** Deterministic relevance ranking for analyzed SEO queries vs an author seed phrase. */

export const SEO_DISCOVERY_DATABASE_LIMIT = 7;

const STOPWORDS = new Set([
  "и", "в", "во", "на", "по", "для", "с", "со", "к", "ко", "от", "из", "у", "о", "об",
  "а", "но", "или", "же", "ли", "бы", "то", "это", "как", "что", "чтобы", "при", "без",
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with",
]);

export type RankableSeoQuery = {
  id: string;
  queryText: string;
  normalizedQuery: string;
  frequency: number | null;
  intent: string | null;
  recommendedFormat: string | null;
  audioFit: string | null;
  clusterName: string | null;
  analysisStatus: string;
};

export type RankedSeoQuery = RankableSeoQuery & {
  score: number;
  reasons: string[];
};

export function tokenizeSeoPhrase(phrase: string): string[] {
  const normalized = phrase
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function containment(seed: Set<string>, candidate: Set<string>): number {
  if (seed.size === 0) return 0;
  let hit = 0;
  for (const item of seed) if (candidate.has(item)) hit += 1;
  return hit / seed.size;
}

/**
 * Score one analyzed query against a seed. Higher is better.
 * Exact normalized match always wins.
 * Non-exact rows require real lexical relevance (>=1 meaningful token overlap);
 * intent/format/audio_fit/frequency only boost after that gate.
 */
export function scoreAnalyzedQueryAgainstSeed(input: {
  seedNormalized: string;
  seedTokens: string[];
  seedIntentHint: string | null;
  seedFormatHint: string | null;
  query: RankableSeoQuery;
}): { score: number; reasons: string[] } {
  const { seedNormalized, seedTokens, query } = input;
  const reasons: string[] = [];
  let score = 0;

  if (query.normalizedQuery === seedNormalized) {
    score += 10_000;
    reasons.push("exact_normalized_match");
    return { score, reasons };
  }

  const candidateTokens = tokenizeSeoPhrase(query.normalizedQuery || query.queryText);
  const seedSet = new Set(seedTokens);
  const candSet = new Set(candidateTokens);
  const overlap = [...seedSet].filter((t) => candSet.has(t)).length;
  const contain = containment(seedSet, candSet);
  const jac = jaccard(seedSet, candSet);

  // Lexical gate: without meaningful token overlap, intent/format/freq cannot create relevance.
  if (overlap < 1) {
    return { score: 0, reasons: ["no_lexical_overlap"] };
  }

  score += overlap * 120;
  score += Math.round(contain * 220);
  score += Math.round(jac * 180);
  reasons.push(`token_overlap:${overlap}`);
  if (contain > 0) reasons.push(`containment:${contain.toFixed(2)}`);
  if (jac > 0) reasons.push(`jaccard:${jac.toFixed(2)}`);

  if (input.seedIntentHint && query.intent && input.seedIntentHint === query.intent) {
    score += 40;
    reasons.push("intent_match");
  }
  if (
    input.seedFormatHint &&
    query.recommendedFormat &&
    input.seedFormatHint === query.recommendedFormat
  ) {
    score += 30;
    reasons.push("format_match");
  }
  if (query.audioFit === "high") {
    score += 15;
    reasons.push("audio_fit_high");
  } else if (query.audioFit === "medium") {
    score += 8;
    reasons.push("audio_fit_medium");
  }

  const freq = typeof query.frequency === "number" && query.frequency > 0 ? query.frequency : 0;
  // Weak secondary — only after lexical relevance.
  score += Math.min(25, Math.floor(Math.log10(freq + 1) * 10));
  if (freq > 0) reasons.push(`frequency:${freq}`);

  return { score, reasons };
}

export function rankAnalyzedQueriesForSeed(input: {
  seedPhrase: string;
  seedNormalized: string | null;
  queries: RankableSeoQuery[];
  limit?: number;
  seedIntentHint?: string | null;
  seedFormatHint?: string | null;
}): RankedSeoQuery[] {
  const limit = input.limit ?? SEO_DISCOVERY_DATABASE_LIMIT;
  const seedNormalized =
    input.seedNormalized?.trim() ||
    input.seedPhrase.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
  const seedTokens = tokenizeSeoPhrase(seedNormalized || input.seedPhrase);

  const ranked = input.queries
    .filter((q) => q.analysisStatus === "analyzed")
    .map((query) => {
      const { score, reasons } = scoreAnalyzedQueryAgainstSeed({
        seedNormalized,
        seedTokens,
        seedIntentHint: input.seedIntentHint ?? null,
        seedFormatHint: input.seedFormatHint ?? null,
        query,
      });
      return { ...query, score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const fa = a.frequency ?? -1;
      const fb = b.frequency ?? -1;
      if (fb !== fa) return fb - fa;
      return a.normalizedQuery.localeCompare(b.normalizedQuery, "ru");
    });

  const seen = new Set<string>();
  const out: RankedSeoQuery[] = [];
  for (const item of ranked) {
    if (seen.has(item.normalizedQuery)) continue;
    seen.add(item.normalizedQuery);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
