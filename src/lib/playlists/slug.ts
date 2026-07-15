import { randomBytes } from "node:crypto";

import { slugifyTitle } from "@/lib/author-products/utils";

const MAX_SLUG_ATTEMPTS = 8;
const BASE_SLUG_MAX_LENGTH = 48;

export function buildPlaylistSlugCandidate(title: string): string {
  const base = slugifyTitle(title) || "playlist";
  const clipped = base.slice(0, BASE_SLUG_MAX_LENGTH).replace(/-+$/g, "");
  const suffix = randomBytes(2).toString("hex");
  const candidate = `${clipped || "playlist"}-${suffix}`;

  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function allocateUniquePlaylistSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = buildPlaylistSlugCandidate(title);

    if (!candidate) {
      continue;
    }

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  return null;
}

export { MAX_SLUG_ATTEMPTS };
