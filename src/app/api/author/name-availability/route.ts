import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthenticatedUser,
} from "@/lib/author-products/auth";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import {
  AuthorPublicNameCheckError,
  findProfileIdForStudioOwner,
  isAuthorPublicNameTaken,
  isPublicNameTakenForProfileEdit,
} from "@/lib/author-names/lookup.server";
import {
  authorNameAvailabilityBody,
  normalizeAuthorPublicName,
} from "@/lib/author-names/public-name";
import { isAuthorPublicNameCheckRateLimited } from "@/lib/author-names/rate-limit";
import { hasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCOPES = new Set(["application", "project", "profile", "studio"]);

function json(
  body: { available: boolean } | { error: string },
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

async function callerCanEditAuthor(
  supabase: Awaited<ReturnType<typeof requireAuthenticatedUser>>["supabase"],
  userId: string,
  authorId: string,
): Promise<boolean> {
  const execution = await peekAuthorExecutionContext();
  if (
    execution?.isSupportMode &&
    execution.actingAuthorId === authorId &&
    execution.realUserId === userId
  ) {
    return true;
  }

  const { data, error } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", authorId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AuthorPublicNameCheckError();
  }

  return data?.role === "owner" || data?.role === "editor";
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuthenticatedUser();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    if (!body || typeof body !== "object") {
      return json({ error: "invalid_request" }, 400);
    }

    const record = body as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const scope = typeof record.scope === "string" ? record.scope : "";
    const authorId =
      typeof record.authorId === "string" ? record.authorId.trim() : "";
    const owner = typeof record.owner === "string" ? record.owner : "";

    if (!SCOPES.has(scope) || name.length > 200) {
      return json({ error: "invalid_request" }, 400);
    }

    if (isAuthorPublicNameCheckRateLimited(request, user.id)) {
      return json({ error: "rate_limited" }, 429);
    }

    if (normalizeAuthorPublicName(name).length < 2) {
      return json(authorNameAvailabilityBody(true));
    }

    if (scope === "studio") {
      const allowed = await hasPermission(supabase, user.id, "authors.manage");
      if (!allowed) {
        return json({ error: "forbidden" }, 403);
      }

      const ownerUserId = owner.trim()
        ? await findProfileIdForStudioOwner(owner)
        : null;
      const taken = await isAuthorPublicNameTaken(
        name,
        { applicationUserIds: ownerUserId ? [ownerUserId] : [] },
        { fresh: false },
      );
      return json(authorNameAvailabilityBody(!taken));
    }

    if (scope === "profile" && UUID_RE.test(authorId)) {
      const canEdit = await callerCanEditAuthor(supabase, user.id, authorId);
      if (canEdit) {
        const taken = await isPublicNameTakenForProfileEdit(name, authorId);
        return json(authorNameAvailabilityBody(!taken));
      }
    }

    const taken = await isAuthorPublicNameTaken(
      name,
      scope === "application" ? { applicationUserIds: [user.id] } : {},
      { fresh: false },
    );
    return json(authorNameAvailabilityBody(!taken));
  } catch (error) {
    if (error instanceof AuthorPublicNameCheckError) {
      return json({ error: error.code }, 503);
    }

    return handleAuthorRouteError(error);
  }
}
