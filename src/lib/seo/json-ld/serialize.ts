import { pruneJsonLdValue } from "./prune";

export function serializeJsonLd(value: unknown): string {
  const pruned = pruneJsonLdValue(value);

  if (pruned === undefined) {
    return "{}";
  }

  return JSON.stringify(pruned).replace(/</g, "\\u003c");
}
