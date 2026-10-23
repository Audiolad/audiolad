import "server-only";

export const WORDSTAT_INTAKE_MAX_ITEMS = 20;

export type WordstatIntakeItem = {
  phrase: string;
  count: number;
};

export type WordstatStoredQuery = {
  id: string;
  queryText: string;
  normalizedQuery: string;
  source: string;
  frequency: number;
  analysisStatus: "not_analyzed" | "analyzed" | "not_applicable";
  createdAt: string;
};

type ExistingQuery = {
  id: string;
  analysisStatus: WordstatStoredQuery["analysisStatus"];
  hasProposal: boolean;
};

export type WordstatIntakeRepository = {
  normalize(phrase: string): Promise<string | null>;
  findByNormalized(normalizedQuery: string): Promise<ExistingQuery | null | undefined>;
  refresh(id: string, frequency: number, frequencyCheckedAt: string): Promise<WordstatStoredQuery | null>;
  // undefined signals a read/write error; null means the guarded update lost a race.
  promote(id: string, frequency: number, frequencyCheckedAt: string): Promise<WordstatStoredQuery | null | undefined>;
  // Re-checked after a promotion: an author proposal saved between the first check and the
  // promotion must still go through moderation. undefined signals a read error.
  hasProposal(id: string): Promise<boolean | undefined>;
  // Guarded revert analyzed -> not_analyzed; returns the stored row, null if the row changed meanwhile.
  revertPromotion(id: string): Promise<WordstatStoredQuery | null | undefined>;
  create(input: {
    queryText: string;
    source: "wordstat";
    frequency: number;
    frequencyCheckedAt: string;
    analysisStatus: "analyzed";
  }): Promise<
    | { status: "created"; query: WordstatStoredQuery }
    | { status: "conflict" }
    | { status: "error" }
  >;
};

export type WordstatIntakeStatus = "created" | "promoted" | "refreshed" | "needs_review" | "not_applicable" | "error";
export type WordstatIntakeResult =
  | { id: string; phrase: string; frequency: number; status: Exclude<WordstatIntakeStatus, "error">; query: WordstatStoredQuery }
  | { phrase: string; frequency: number; status: "error" };

function readPhrase(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readWordstatIntakeItems(value: unknown):
  | { ok: true; items: WordstatIntakeItem[] }
  | { ok: false; error: string } {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > WORDSTAT_INTAKE_MAX_ITEMS
  ) {
    return { ok: false, error: "invalid_import_items" };
  }

  const items: WordstatIntakeItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "invalid_import_item" };
    }

    const record = item as Record<string, unknown>;
    const phrase = readPhrase(record.phrase);
    if (!phrase || !Number.isInteger(record.count) || (record.count as number) < 0) {
      return { ok: false, error: "invalid_import_item" };
    }
    items.push({ phrase, count: record.count as number });
  }

  return { ok: true, items };
}

export async function importWordstatIntakeItem(
  item: WordstatIntakeItem,
  repository: WordstatIntakeRepository,
  now: () => string = () => new Date().toISOString(),
): Promise<WordstatIntakeResult> {
  const failure: WordstatIntakeResult = { phrase: item.phrase, frequency: item.count, status: "error" };
  const success = (query: WordstatStoredQuery, status: Exclude<WordstatIntakeStatus, "error">): WordstatIntakeResult => ({
    id: query.id, phrase: item.phrase, frequency: query.frequency, status, query,
  });
  try {
    const normalizedQuery = await repository.normalize(item.phrase);
    if (!normalizedQuery) return failure;
    const frequencyCheckedAt = now();
    let existing = await repository.findByNormalized(normalizedQuery);
    if (existing === undefined) return failure;
    if (!existing) {
      const created = await repository.create({
        queryText: item.phrase, source: "wordstat", frequency: item.count,
        frequencyCheckedAt, analysisStatus: "analyzed",
      });
      if (created.status === "created") return success(created.query, "created");
      if (created.status !== "conflict") return failure;
      existing = await repository.findByNormalized(normalizedQuery);
    }
    // Bounded retries cover concurrent moderation without claiming an unconfirmed promotion.
    for (let attempt = 0; existing && attempt < 3; attempt++) {
      if (existing.analysisStatus === "not_analyzed" && !existing.hasProposal) {
        const promoted = await repository.promote(existing.id, item.count, frequencyCheckedAt);
        if (promoted === undefined) return failure;
        if (promoted) {
          const proposalAppeared = await repository.hasProposal(promoted.id);
          if (proposalAppeared === false) return success(promoted, "promoted");
          if (proposalAppeared === undefined) {
            // Cannot confirm the promotion is safe: roll it back and report an error.
            await repository.revertPromotion(promoted.id);
            return failure;
          }
          const reverted = await repository.revertPromotion(promoted.id);
          return reverted ? success(reverted, "needs_review") : failure;
        }
        existing = await repository.findByNormalized(normalizedQuery);
        continue;
      }
      const query = await repository.refresh(existing.id, item.count, frequencyCheckedAt);
      if (!query) return failure;
      // Use the returned status in case moderation completed during the refresh.
      const status = query.analysisStatus === "analyzed" ? "refreshed"
        : query.analysisStatus === "not_applicable" ? "not_applicable" : "needs_review";
      return success(query, status);
    }
    return failure;
  } catch {
    return failure;
  }
}
