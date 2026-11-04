/**
 * «Пересобрать атмосферу» after the confirm: what happens once the venue save answers.
 * Pure so every completion order can be tested (scripts/business-atmosphere-rebuild-flow-unit.mts).
 *
 * - A refused save changes nothing.
 * - A newer chip change or rebuild (another generation) owns the queue, the marker and the flag.
 * - Saved and still on the page: store the profile, set the restart marker, rebuild through the
 *   layout player (from the next track). A failed rebuild is reported, not shown as success.
 * - Left the page (before or during the queue request): keep the marker and tell an open music
 *   page to fetch the queue itself – one request path, the settings request is cancelled.
 */
export type OwnerRebuildOutcome = "failed" | "stale" | "deferred" | "applied" | "player-failed";

export type OwnerRebuildDeps = {
  gen: number;
  currentGeneration: () => number;
  isMounted: () => boolean;
  inFlight: { current: number | null };
  storeProfile: () => void;
  markRestart: () => void;
  clearRestart: () => void;
  announceSaved: () => void;
  rebuild: () => Promise<"applied" | "deferred" | "failed">;
};

export async function continueOwnerRebuild(saveError: string | null, deps: OwnerRebuildDeps): Promise<OwnerRebuildOutcome> {
  const { gen } = deps;
  if (saveError) return "failed";
  if (deps.currentGeneration() !== gen) return "stale";
  deps.storeProfile();
  deps.markRestart();
  if (!deps.isMounted()) {
    deps.announceSaved();
    return "deferred";
  }
  deps.inFlight.current = gen;
  let result: "applied" | "deferred" | "failed";
  try {
    result = await deps.rebuild();
  } catch {
    result = "failed";
  }
  if (deps.inFlight.current === gen) deps.inFlight.current = null;
  if (deps.currentGeneration() !== gen) return "stale";
  if (!deps.isMounted() && result !== "applied") {
    deps.announceSaved();
    return "deferred";
  }
  if (result === "failed") {
    deps.clearRestart();
    return "player-failed";
  }
  return "applied";
}
