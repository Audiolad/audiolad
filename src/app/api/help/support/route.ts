import { NextResponse } from "next/server";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { createSupportRequest } from "@/lib/help/create-support-request";
import {
  getSupportRateLimitKey,
  isAllowedSupportRequestOrigin,
} from "@/lib/help/request-guard";
import { validateSupportFormInput } from "@/lib/help/support-validation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const SUPPORT_RATE_LIMIT = 5;
const SUPPORT_RATE_WINDOW_MS = 15 * 60 * 1000;

type ErrorBody = { error: string };

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code } satisfies ErrorBody, { status });
}

async function resolveVerifiedAuthorId(input: {
  claimedAuthorId: string | null;
  userId: string | null;
}): Promise<string | null> {
  if (!input.claimedAuthorId || !input.userId) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("author_members")
      .select("author_id")
      .eq("author_id", input.claimedAuthorId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (error) {
      console.error("support_request_author_membership_error", error.message);
      return null;
    }

    return data?.author_id ?? null;
  } catch (error) {
    console.error(
      "support_request_author_membership_unexpected",
      error instanceof Error ? error.message : "unknown",
    );
    return null;
  }
}

export async function POST(request: Request) {
  if (!isAllowedSupportRequestOrigin(request)) {
    return errorResponse("forbidden_origin", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("invalid_request", 400);
  }

  const record = body as Record<string, unknown>;
  const validation = validateSupportFormInput({
    category: typeof record.category === "string" ? record.category : "",
    subject: typeof record.subject === "string" ? record.subject : "",
    message: typeof record.message === "string" ? record.message : "",
    contactName: typeof record.contact_name === "string" ? record.contact_name : "",
    contactEmail:
      typeof record.contact_email === "string" ? record.contact_email : "",
    authorId: typeof record.author_id === "string" ? record.author_id : null,
    sourceUrl: typeof record.source_url === "string" ? record.source_url : null,
  });

  if (!validation.ok) {
    return errorResponse(validation.code, 400);
  }

  if (
    !checkAnalyticsRateLimit(
      getSupportRateLimitKey(request, validation.value.contactEmail),
      SUPPORT_RATE_LIMIT,
      SUPPORT_RATE_WINDOW_MS,
    )
  ) {
    return errorResponse("rate_limited", 429);
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const authorId = await resolveVerifiedAuthorId({
    claimedAuthorId: validation.value.authorId,
    userId,
  });

  let service;
  try {
    service = createServiceRoleClient();
  } catch (error) {
    console.error(
      "support_request_service_role_unavailable",
      error instanceof Error ? error.message : "unknown",
    );
    return errorResponse("internal_error", 500);
  }

  const result = await createSupportRequest({
    service,
    payload: {
      category: validation.value.category,
      subject: validation.value.subject,
      message: validation.value.message,
      contactName: validation.value.contactName,
      contactEmail: validation.value.contactEmail,
      userId,
      authorId,
      sourceUrlRaw:
        typeof record.source_url === "string" ? record.source_url : null,
    },
  });

  if (!result.ok) {
    if (result.code === "author_not_found") {
      return errorResponse("author_id_invalid", 400);
    }
    return errorResponse("internal_error", 500);
  }

  return NextResponse.json(
    {
      ok: true,
      request_id: result.requestId,
    },
    { status: 201 },
  );
}
