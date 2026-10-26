import "server-only";

import { NextResponse } from "next/server";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import {
  getPlatformAccess,
  snapshotHasPermission,
} from "@/lib/auth/platform-access";
import type { CommentActor, CommentClock } from "@/lib/practice-comments/service";
import { CommentStoreUnavailable, createSupabaseCommentStore } from "@/lib/practice-comments/supabase-store";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export function commentJson(result: { ok: false; status: number; error: string } | { ok: true }): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { ok: _ok, ...body } = result;
  return NextResponse.json(body);
}

export async function runCommentAction(
  work: () => Promise<{ ok: false; status: number; error: string } | { ok: true }>,
): Promise<NextResponse> {
  try {
    return commentJson(await work());
  } catch (error) {
    if (error instanceof CommentStoreUnavailable) {
      return NextResponse.json({ error: "comments_unavailable" }, { status: 503 });
    }
    console.error("listener_comment_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export function commentClock(): CommentClock {
  return {
    now: () => new Date(),
    rateLimit: checkAnalyticsRateLimit,
  };
}

export async function commentActor(request: Request): Promise<CommentActor> {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { userId: user?.id ?? null, isModerator: false };
}

export async function commentModerator(
  request: Request,
): Promise<{ ok: true; actor: CommentActor } | { ok: false; response: NextResponse }> {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const access = await getPlatformAccess(supabase, user.id);
  if (
    !snapshotHasPermission(access, "admin_panel.access") ||
    !snapshotHasPermission(access, "products.moderate")
  ) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, actor: { userId: user.id, isModerator: true } };
}

export async function commentStore(request: Request) {
  const reader = await createClientFromRequest(request);
  let writer;
  try {
    writer = createServiceRoleClient();
  } catch {
    throw new CommentStoreUnavailable();
  }
  return createSupabaseCommentStore({ reader, writer });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body === "object" && body != null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

export function requestIdFrom(request: Request, body: Record<string, unknown>): unknown {
  return body.clientRequestId ?? request.headers.get("idempotency-key");
}
