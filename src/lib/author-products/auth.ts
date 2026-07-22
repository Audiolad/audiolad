import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import type { AuthorAccessStatus } from "@/lib/authors/access";
import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
} from "@/lib/authors/access";

import type { AuthorMemberRole, AuthorWorkspace } from "./types";

export class AuthorAccessError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function createAuthedSupabaseClient(accessToken: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function requireAuthenticatedUser() {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  const supabase = bearerToken
    ? createAuthedSupabaseClient(bearerToken)
    : await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthorAccessError("unauthorized", 401);
  }

  if (error) {
    console.error("author_auth_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return { supabase, user };
}

export async function listAuthorWorkspacesForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<AuthorWorkspace[]> {
  const supabase = supabaseClient ?? (await createClient());

  const { data, error } = await supabase
    .from("author_members")
    .select(
      `
      role,
      authors!author_members_author_id_fkey (
        id,
        name,
        slug,
        access_status
      )
    `,
    )
    .eq("user_id", userId);

  if (error) {
    console.error("author_workspaces_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const workspaces: AuthorWorkspace[] = [];

  for (const row of data ?? []) {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

    if (!author?.id || !author.name || !author.slug) {
      continue;
    }

    if (row.role !== "owner" && row.role !== "editor") {
      continue;
    }

    workspaces.push({
      id: author.id,
      name: author.name,
      slug: author.slug,
      role: row.role as AuthorMemberRole,
      accessStatus: (author.access_status ?? "free") as AuthorAccessStatus,
    });
  }

  workspaces.sort((left, right) => left.name.localeCompare(right.name, "ru"));

  return workspaces;
}

export async function getAuthorAccessStatusForMembership(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorAccessStatus> {
  const { data, error } = await supabase
    .from("authors")
    .select("access_status")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    console.error("author_access_status_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return (data?.access_status ?? "free") as AuthorAccessStatus;
}

export async function requireAuthorMembership(authorId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data, error } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", authorId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("author_membership_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!data || (data.role !== "owner" && data.role !== "editor")) {
    throw new AuthorAccessError("forbidden", 403);
  }

  const accessStatus = await getAuthorAccessStatusForMembership(supabase, authorId);

  return {
    supabase,
    user,
    role: data.role as AuthorMemberRole,
    accessStatus,
  };
}

export function assertAuthorContentMutationsAllowed(accessStatus: AuthorAccessStatus) {
  if (!authorAccessAllowsContentMutations(accessStatus)) {
    throw new AuthorAccessError("author_content_mutations_blocked", 403);
  }
}

export function assertAuthorPaidProductsAllowed(accessStatus: AuthorAccessStatus) {
  if (!authorAccessAllowsPaidProducts(accessStatus)) {
    throw new AuthorAccessError("paid_products_not_allowed", 403);
  }
}

export async function requirePracticeAccess(practiceId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, author_id, status, slug, published_at, use_shared_cover")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    console.error("author_practice_lookup_error", practiceError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!practice?.id || !practice.author_id) {
    throw new AuthorAccessError("not_found", 404);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", practice.author_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("author_practice_membership_error", membershipError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const accessStatus = await getAuthorAccessStatusForMembership(
    supabase,
    practice.author_id,
  );

  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "editor")
  ) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return {
    supabase,
    user,
    practice: practice as {
      id: string;
      author_id: string;
      status: string;
      slug: string;
      published_at: string | null;
      use_shared_cover: boolean;
    },
    role: membership.role as AuthorMemberRole,
    accessStatus,
  };
}

export function handleAuthorRouteError(error: unknown) {
  if (error instanceof AuthorAccessError) {
    if (error.status >= 500) {
      console.error("author_route_error", error.code);
    }

    return jsonError(error.code, error.status);
  }

  console.error("author_route_unhandled_error", error);
  return jsonError("internal_error", 500);
}
