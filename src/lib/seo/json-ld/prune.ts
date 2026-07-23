type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };

function isPlainObject(value: unknown): value is Record<string, JsonLdValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pruneJsonLdValue<T>(value: T): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return (trimmed ? trimmed : undefined) as T | undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const next = value
      .map((item) => pruneJsonLdValue(item))
      .filter((item) => item !== undefined);

    return (next.length > 0 ? next : undefined) as T | undefined;
  }

  if (isPlainObject(value)) {
    const next: Record<string, JsonLdValue> = {};

    for (const [key, nested] of Object.entries(value)) {
      const pruned = pruneJsonLdValue(nested);

      if (pruned !== undefined) {
        next[key] = pruned;
      }
    }

    return (Object.keys(next).length > 0 ? next : undefined) as T | undefined;
  }

  return undefined;
}
