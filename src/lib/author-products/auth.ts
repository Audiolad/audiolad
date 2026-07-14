import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

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

export async function requireAuthenticatedUser() {
  const supabase = await createClient();

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
): Promise<AuthorWorkspace[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("author_members")
    .select(
      `
      role,
      authors (
        id,
        name,
        slug
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
    });
  }

  workspaces.sort((left, right) => left.name.localeCompare(right.name, "ru"));

  return workspaces;
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

  return { supabase, user, role: data.role as AuthorMemberRole };
}

export async function requirePracticeAccess(practiceId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, author_id, status, slug, published_at")
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
    },
    role: membership.role as AuthorMemberRole,
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
