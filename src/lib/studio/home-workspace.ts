export type StudioHomeWorkspaceCandidate = {
  authorId: string;
  latestActivityAt: string | null;
};

/**
 * Picks the author workspace the studio project list should open on.
 *
 * Workspaces arrive sorted by name, so "first" changes whenever the user
 * creates an author whose name sorts earlier. The home workspace is instead
 * the one with the most recently touched active studio project; the first
 * workspace is only a fallback when the user has no studio projects at all.
 */
export function pickStudioHomeWorkspaceId(
  workspaceIds: readonly string[],
  candidates: readonly StudioHomeWorkspaceCandidate[],
): string | undefined {
  const allowed = new Set(workspaceIds);
  let best: { authorId: string; at: number } | null = null;
  for (const candidate of candidates) {
    if (!allowed.has(candidate.authorId) || !candidate.latestActivityAt) {
      continue;
    }
    const at = Date.parse(candidate.latestActivityAt);
    if (Number.isNaN(at)) {
      continue;
    }
    if (!best || at > best.at) {
      best = { authorId: candidate.authorId, at };
    }
  }
  return best?.authorId ?? workspaceIds[0];
}
