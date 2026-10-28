import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  AUTHOR_PUBLIC_NAME_CHECK_FAILED_MESSAGE,
  AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES,
  AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE,
  isAuthorPublicNameTakenInClaims,
  normalizeAuthorPublicName,
  type AuthorPublicNameClaim,
  type AuthorPublicNameExclusion,
} from "./public-name";

const CLAIMS_TTL_MS = 10_000;
const PAGE_SIZE = 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClaimCache = {
  at: number;
  claims: AuthorPublicNameClaim[];
};

let claimCache: ClaimCache | null = null;

export class AuthorPublicNameTakenError extends Error {
  readonly code = "author_name_taken" as const;

  constructor() {
    super(AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE);
    this.name = "AuthorPublicNameTakenError";
  }
}

export class AuthorPublicNameCheckError extends Error {
  readonly code = "name_check_unavailable" as const;

  constructor() {
    super(AUTHOR_PUBLIC_NAME_CHECK_FAILED_MESSAGE);
    this.name = "AuthorPublicNameCheckError";
  }
}

export function clearAuthorPublicNameClaimCache(): void {
  claimCache = null;
}

function serviceClient(): SupabaseClient {
  try {
    return createServiceRoleClient();
  } catch (error) {
    console.error(
      "author_public_name_check_failed",
      error instanceof Error ? error.name : "unknown",
    );
    throw new AuthorPublicNameCheckError();
  }
}

async function loadClaims(client: SupabaseClient): Promise<AuthorPublicNameClaim[]> {
  let authors: { id: string; name: string | null }[];
  let applications: { id: string; display_name: string | null }[];

  try {
    [authors, applications] = await Promise.all([
      fetchAllPages<{ id: string; name: string | null }>(
        (from, to) =>
          client
            .from("authors")
            .select("id, name")
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE,
      ),
      fetchAllPages<{ id: string; display_name: string | null }>(
        (from, to) =>
          client
            .from("author_applications")
            .select("id, display_name")
            .in("status", [...AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES])
            .order("id", { ascending: true })
            .range(from, to),
        PAGE_SIZE,
      ),
    ]);
  } catch (error) {
    console.error(
      "author_public_name_check_failed",
      error instanceof Error ? error.name : "unknown",
    );
    throw new AuthorPublicNameCheckError();
  }

  const claims: AuthorPublicNameClaim[] = [];

  for (const author of authors) {
    if (typeof author.id !== "string" || typeof author.name !== "string") {
      continue;
    }
    const normalizedName = normalizeAuthorPublicName(author.name);
    if (!normalizedName) {
      continue;
    }
    claims.push({ kind: "author", id: author.id, normalizedName });
  }

  for (const application of applications) {
    if (
      typeof application.id !== "string" ||
      typeof application.display_name !== "string"
    ) {
      continue;
    }
    const normalizedName = normalizeAuthorPublicName(application.display_name);
    if (!normalizedName) {
      continue;
    }
    claims.push({
      kind: "application",
      id: application.id,
      normalizedName,
    });
  }

  return claims;
}

async function claimsForCheck(fresh: boolean): Promise<AuthorPublicNameClaim[]> {
  const now = Date.now();
  if (!fresh && claimCache && now - claimCache.at < CLAIMS_TTL_MS) {
    return claimCache.claims;
  }

  const claims = await loadClaims(serviceClient());
  claimCache = { at: now, claims };
  return claims;
}

async function applicationIdsForUsers(
  client: SupabaseClient,
  userIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("author_applications")
    .select("id")
    .in("user_id", ids);

  if (error) {
    console.error("author_public_name_check_failed", "application_ids");
    throw new AuthorPublicNameCheckError();
  }

  return (data ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : ""))
    .filter(Boolean);
}

async function ownerUserIdsForAuthor(
  client: SupabaseClient,
  authorId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("author_members")
    .select("user_id")
    .eq("author_id", authorId)
    .eq("role", "owner");

  if (error) {
    console.error("author_public_name_check_failed", "author_owners");
    throw new AuthorPublicNameCheckError();
  }

  return (data ?? [])
    .map((row) => (typeof row.user_id === "string" ? row.user_id : ""))
    .filter(Boolean);
}

/**
 * Resolves a studio owner query to a user id. Selects id only.
 * Returns null when the account cannot be resolved.
 */
export async function findProfileIdForStudioOwner(
  owner: string,
): Promise<string | null> {
  const trimmed = owner.trim();
  if (!trimmed || trimmed.length > 320) {
    return null;
  }

  const client = serviceClient();

  if (UUID_RE.test(trimmed)) {
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (error) {
      throw new AuthorPublicNameCheckError();
    }
    return typeof data?.id === "string" ? data.id : null;
  }

  if (!trimmed.includes("@") || trimmed.includes(" ")) {
    return null;
  }

  const { data, error } = await client
    .from("profiles")
    .select("id")
    .ilike("email", trimmed)
    .maybeSingle();

  if (error) {
    throw new AuthorPublicNameCheckError();
  }

  return typeof data?.id === "string" ? data.id : null;
}

export async function isAuthorPublicNameTaken(
  name: string,
  exclusion?: AuthorPublicNameExclusion & {
    applicationUserIds?: readonly string[];
  },
  options?: { fresh?: boolean },
): Promise<boolean> {
  const client = serviceClient();
  const applicationIds = [...(exclusion?.applicationIds ?? [])];

  if (exclusion?.applicationUserIds && exclusion.applicationUserIds.length > 0) {
    applicationIds.push(
      ...(await applicationIdsForUsers(client, exclusion.applicationUserIds)),
    );
  }

  const claims = await claimsForCheck(options?.fresh === true);
  return isAuthorPublicNameTakenInClaims(name, claims, {
    authorIds: exclusion?.authorIds,
    applicationIds,
  });
}

export async function assertAuthorPublicNameAvailable(
  name: string,
  exclusion?: AuthorPublicNameExclusion & {
    applicationUserIds?: readonly string[];
  },
): Promise<void> {
  const taken = await isAuthorPublicNameTaken(name, exclusion, { fresh: true });
  if (taken) {
    throw new AuthorPublicNameTakenError();
  }
}

export async function assertApplicationDisplayNameAvailable(input: {
  name: string;
  userId: string;
  applicationId?: string | null;
}): Promise<void> {
  await assertAuthorPublicNameAvailable(input.name, {
    applicationIds: input.applicationId ? [input.applicationId] : [],
    applicationUserIds: [input.userId],
  });
}

export async function assertNewAuthorWorkspaceNameAvailable(
  name: string,
  options?: { ownerUserId?: string | null },
): Promise<void> {
  await assertAuthorPublicNameAvailable(name, {
    applicationUserIds: options?.ownerUserId ? [options.ownerUserId] : [],
  });
}

export async function isPublicNameTakenForProfileEdit(
  name: string,
  authorId: string,
): Promise<boolean> {
  const client = serviceClient();
  const ownerUserIds = await ownerUserIdsForAuthor(client, authorId);
  return isAuthorPublicNameTaken(
    name,
    {
      authorIds: [authorId],
      applicationUserIds: ownerUserIds,
    },
    { fresh: false },
  );
}

export async function assertAuthorWorkspaceRenameAvailable(input: {
  name: string;
  currentName: string;
  authorId: string;
}): Promise<void> {
  if (normalizeAuthorPublicName(input.name) === normalizeAuthorPublicName(input.currentName)) {
    return;
  }

  const client = serviceClient();
  const ownerUserIds = await ownerUserIdsForAuthor(client, input.authorId);
  await assertAuthorPublicNameAvailable(input.name, {
    authorIds: [input.authorId],
    applicationUserIds: ownerUserIds,
  });
}
