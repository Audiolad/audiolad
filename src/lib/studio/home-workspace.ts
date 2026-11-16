export type StudioWorkspaceRef = {
  id: string;
  slug: string;
};

export type StudioHomeWorkspaceCandidate = {
  authorId: string;
  latestActivityAt: string | null;
};

/**
 * Picks the author workspace the studio opens on, in this order:
 * 1. `?author=<slug>` from the link (the author cabinet passes its selected author);
 * 2. the author cabinet's sticky selection cookie;
 * 3. the author with the most recently touched active studio project;
 * 4. the first workspace (workspaces are sorted by name).
 * Slugs and ids that are not among the user's own workspaces are ignored.
 */
export function pickStudioWorkspace<T extends StudioWorkspaceRef>(
  workspaces: readonly T[],
  options: {
    querySlug?: string | null;
    cookieSlug?: string | null;
    candidates?: readonly StudioHomeWorkspaceCandidate[];
  } = {},
): T | undefined {
  for (const raw of [options.querySlug, options.cookieSlug]) {
    const slug = raw?.trim();
    if (!slug) {
      continue;
    }
    const match = workspaces.find((workspace) => workspace.slug === slug);
    if (match) {
      return match;
    }
  }

  const latestId = pickLatestWorkspaceId(
    workspaces.map((workspace) => workspace.id),
    options.candidates ?? [],
  );
  return (
    workspaces.find((workspace) => workspace.id === latestId) ?? workspaces[0]
  );
}

export function pickLatestWorkspaceId(
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
  return best?.authorId;
}

export function needsLatestProjectLookup(
  workspaces: readonly StudioWorkspaceRef[],
  querySlug?: string | null,
  cookieSlug?: string | null,
): boolean {
  if (workspaces.length <= 1) {
    return false;
  }
  return ![querySlug, cookieSlug].some((raw) => {
    const slug = raw?.trim();
    return Boolean(slug) && workspaces.some((workspace) => workspace.slug === slug);
  });
}
