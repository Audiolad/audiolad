export type ReorderBatchItem = {
  id: string;
  position: number;
};

/**
 * Shared 0-based contiguous permutation check used by Product Gallery
 * and Author Course Builder (lessons + blocks).
 */
export function validatePositionReorderBatch(
  existingIds: readonly string[],
  items: readonly ReorderBatchItem[],
): { ok: true; ordered: ReorderBatchItem[] } | { ok: false } {
  if (items.length !== existingIds.length) {
    return { ok: false };
  }

  const uniqueExisting = new Set(existingIds);

  if (uniqueExisting.size !== existingIds.length) {
    return { ok: false };
  }

  const ids = items.map((item) => item.id);

  if (ids.some((id) => typeof id !== "string" || !id.trim())) {
    return { ok: false };
  }

  if (new Set(ids).size !== ids.length) {
    return { ok: false };
  }

  for (const id of ids) {
    if (!uniqueExisting.has(id)) {
      return { ok: false };
    }
  }

  for (const id of existingIds) {
    if (!ids.includes(id)) {
      return { ok: false };
    }
  }

  const positions = items.map((item) => item.position);

  if (
    positions.some(
      (position) =>
        !Number.isInteger(position) ||
        position < 0 ||
        position >= existingIds.length,
    )
  ) {
    return { ok: false };
  }

  if (new Set(positions).size !== positions.length) {
    return { ok: false };
  }

  const expectedPositions = new Set(existingIds.map((_, index) => index));

  if (positions.some((position) => !expectedPositions.has(position))) {
    return { ok: false };
  }

  return {
    ok: true,
    ordered: [...items].sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }

      return left.id.localeCompare(right.id);
    }),
  };
}

export function parseReorderItemsPayload(
  body: unknown,
  key = "items",
): ReorderBatchItem[] | null {
  if (!body || typeof body !== "object" || !(key in body)) {
    return null;
  }

  const rawItems = (body as Record<string, unknown>)[key];

  if (!Array.isArray(rawItems)) {
    return null;
  }

  const items: ReorderBatchItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const id = "id" in item && typeof item.id === "string" ? item.id : "";
    const position =
      "position" in item && typeof item.position === "number"
        ? item.position
        : Number.NaN;

    if (!id || !Number.isInteger(position)) {
      return null;
    }

    items.push({ id, position });
  }

  return items;
}
