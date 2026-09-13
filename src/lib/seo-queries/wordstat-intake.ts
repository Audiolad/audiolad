import "server-only";

export const WORDSTAT_INTAKE_MAX_ITEMS = 20;

export type WordstatIntakeItem = {
  phrase: string;
  count: number;
};

type StoredQuery = {
  id: string;
  frequency: number;
};

export type WordstatIntakeRepository = {
  normalize(phrase: string): Promise<string | null>;
  findByNormalized(normalizedQuery: string): Promise<{ id: string } | null | undefined>;
  refresh(
    id: string,
    frequency: number,
    frequencyCheckedAt: string,
  ): Promise<StoredQuery | null>;
  create(input: {
    queryText: string;
    source: "wordstat";
    frequency: number;
    frequencyCheckedAt: string;
    analysisStatus: "not_analyzed";
  }): Promise<
    | { status: "created"; query: StoredQuery }
    | { status: "conflict" }
    | { status: "error" }
  >;
};

export type WordstatIntakeResult =
  | { id: string; phrase: string; frequency: number; status: "created" | "refreshed" }
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

async function refresh(
  repository: WordstatIntakeRepository,
  id: string,
  item: WordstatIntakeItem,
  frequencyCheckedAt: string,
): Promise<WordstatIntakeResult> {
  const query = await repository.refresh(id, item.count, frequencyCheckedAt);
  return query
    ? { id: query.id, phrase: item.phrase, frequency: query.frequency, status: "refreshed" }
    : { phrase: item.phrase, frequency: item.count, status: "error" };
}

export async function importWordstatIntakeItem(
  item: WordstatIntakeItem,
  repository: WordstatIntakeRepository,
  now: () => string = () => new Date().toISOString(),
): Promise<WordstatIntakeResult> {
  const normalizedQuery = await repository.normalize(item.phrase);
  if (!normalizedQuery) {
    return { phrase: item.phrase, frequency: item.count, status: "error" };
  }

  const frequencyCheckedAt = now();
  const existing = await repository.findByNormalized(normalizedQuery);
  if (existing === undefined) {
    return { phrase: item.phrase, frequency: item.count, status: "error" };
  }
  if (existing) {
    return refresh(repository, existing.id, item, frequencyCheckedAt);
  }

  const created = await repository.create({
    queryText: item.phrase,
    source: "wordstat",
    frequency: item.count,
    frequencyCheckedAt,
    analysisStatus: "not_analyzed",
  });
  if (created.status === "created") {
    return {
      id: created.query.id,
      phrase: item.phrase,
      frequency: created.query.frequency,
      status: "created",
    };
  }

  if (created.status === "conflict") {
    const concurrent = await repository.findByNormalized(normalizedQuery);
    if (concurrent) {
      return refresh(repository, concurrent.id, item, frequencyCheckedAt);
    }
  }

  return { phrase: item.phrase, frequency: item.count, status: "error" };
}
