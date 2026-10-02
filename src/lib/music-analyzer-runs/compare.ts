export type JsonDiffState = "same" | "changed" | "only_left" | "only_right";

export type JsonDiffEntry = {
  path: string;
  state: JsonDiffState;
  left: unknown;
  right: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flatten(value: unknown, prefix: string, into: Map<string, unknown>): void {
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0 && prefix) {
      into.set(prefix, value);
      return;
    }
    for (const key of keys) {
      flatten(value[key], prefix ? `${prefix}.${key}` : key, into);
    }
    return;
  }
  into.set(prefix || "$", value);
}

export function flattenJson(value: unknown): Map<string, unknown> {
  const into = new Map<string, unknown>();
  flatten(value, "", into);
  return into;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

export function diffJson(left: unknown, right: unknown): JsonDiffEntry[] {
  const leftFlat = flattenJson(left);
  const rightFlat = flattenJson(right);
  const paths = [...new Set([...leftFlat.keys(), ...rightFlat.keys()])].sort();
  return paths.map((path) => {
    const hasLeft = leftFlat.has(path);
    const hasRight = rightFlat.has(path);
    const leftValue = hasLeft ? leftFlat.get(path) : undefined;
    const rightValue = hasRight ? rightFlat.get(path) : undefined;
    let state: JsonDiffState = "changed";
    if (hasLeft && hasRight && stable(leftValue) === stable(rightValue)) state = "same";
    else if (hasLeft && !hasRight) state = "only_left";
    else if (!hasLeft && hasRight) state = "only_right";
    return { path, state, left: leftValue ?? null, right: rightValue ?? null };
  });
}
