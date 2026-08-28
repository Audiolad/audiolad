import { NextResponse } from "next/server";

import { isPayoutProfilesEnabled } from "@/lib/author-payout-profiles/feature";
import {
  AuthorPayoutProfileError,
  beginAuthorVerifiedPayoutProfileEdit,
  getAuthorPayoutProfileRow,
  saveAuthorPayoutProfileDraft,
  submitAuthorPayoutProfile,
  toAuthorPublicView,
} from "@/lib/author-payout-profiles/service";
import { isAuthorEditablePayoutProfileStatus } from "@/lib/author-payout-profiles/status";
import {
  AuthorAccessError,
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import { requireCurrentAuthorTermsAcceptance } from "@/lib/author-terms/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const FORBIDDEN_CLIENT_FIELDS = [
  "status",
  "reviewed_by",
  "verified_at",
  "rejected_at",
  "review_started_at",
  "submitted_at",
  "staff_note",
  "encrypted_payload",
  "version",
  "inn_last4",
  "account_last4",
  "bank_display_name",
] as const;

function sanitizeAuthorBody(body: Record<string, unknown>) {
  const next = { ...body };
  for (const key of FORBIDDEN_CLIENT_FIELDS) {
    delete next[key];
  }
  return next;
}

function featureDisabledResponse() {
  return jsonWithNoStore({ error: "feature_not_available" }, { status: 403 });
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function jsonWithNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function resolveAuthorId(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("author_id")?.trim() ?? "";
  const fromBody =
    typeof body?.author_id === "string" ? body.author_id.trim() : "";

  return fromQuery || fromBody;
}

function rejectLegalEntity(body: Record<string, unknown>) {
  const recipientType =
    typeof body.recipient_type === "string" ? body.recipient_type.trim() : "";

  if (recipientType === "legal_entity") {
    return jsonWithNoStore(
      {
        error: "validation_failed",
        errors: {
          recipient_type: "Юридическое лицо пока недоступно.",
        },
      },
      { status: 400 },
    );
  }

  return null;
}

function handlePayoutProfileError(error: unknown) {
  if (error instanceof AuthorPayoutProfileError) {
    if (error.status >= 500) {
      console.error("author_payout_profile_route_error", error.code);
    }

    return jsonWithNoStore(
      {
        error: error.code,
        fieldErrors: error.fieldErrors,
      },
      { status: error.status },
    );
  }

  return handleAuthorRouteError(error);
}

async function assertPayoutNotInSupportMode() {
  const execution = await peekAuthorExecutionContext();
  if (execution?.isSupportMode) {
    throw new AuthorAccessError("support_sensitive_route_blocked", 403);
  }
}

export async function GET(request: Request) {
  try {
    await assertPayoutNotInSupportMode();
    const authorId = resolveAuthorId(request);

    if (!authorId) {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    await requireAuthorMembership(authorId);

    if (!isPayoutProfilesEnabled()) {
      return jsonWithNoStore({
        profile: null,
        featureEnabled: false,
      });
    }

    const service = createServiceRoleClient();
    const row = await getAuthorPayoutProfileRow(service, authorId);
    const status = row?.status ?? null;
    const includeFields =
      row != null &&
      (isAuthorEditablePayoutProfileStatus(
        status as Parameters<typeof isAuthorEditablePayoutProfileStatus>[0],
      ) ||
        status === "verified");

    const profile = toAuthorPublicView(row, { includeFields });

    return jsonWithNoStore({ profile, featureEnabled: true });
  } catch (error) {
    return handlePayoutProfileError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await assertPayoutNotInSupportMode();
    if (!isPayoutProfilesEnabled()) {
      return featureDisabledResponse();
    }

    const body = sanitizeAuthorBody(
      (await request.json()) as Record<string, unknown>,
    );
    const authorId = resolveAuthorId(request, body);

    if (!authorId) {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    const legalEntityError = rejectLegalEntity(body);
    if (legalEntityError) {
      return legalEntityError;
    }

    const { user } = await requireAuthorMembership(authorId);
    await requireCurrentAuthorTermsAcceptance(authorId);
    const service = createServiceRoleClient();

    const profile = await saveAuthorPayoutProfileDraft({
      supabase: service,
      authorId,
      actorUserId: user.id,
      body,
    });

    return jsonWithNoStore({ ok: true, profile });
  } catch (error) {
    return handlePayoutProfileError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertPayoutNotInSupportMode();
    if (!isPayoutProfilesEnabled()) {
      return featureDisabledResponse();
    }

    const body = sanitizeAuthorBody(
      (await request.json()) as Record<string, unknown>,
    );
    const authorId = resolveAuthorId(request, body);
    const action =
      typeof body.action === "string" ? body.action.trim() : "submit";

    if (!authorId) {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    const { user } = await requireAuthorMembership(authorId);
    await requireCurrentAuthorTermsAcceptance(authorId);
    const service = createServiceRoleClient();

    if (action === "begin_edit") {
      const profile = await beginAuthorVerifiedPayoutProfileEdit({
        supabase: service,
        authorId,
        actorUserId: user.id,
        confirm: body.confirm === true,
      });

      return jsonWithNoStore({ ok: true, profile });
    }

    if (action !== "submit") {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    const legalEntityError = rejectLegalEntity(body);
    if (legalEntityError) {
      return legalEntityError;
    }

    const result = await submitAuthorPayoutProfile({
      supabase: service,
      authorId,
      actorUserId: user.id,
      body,
    });

    // Intentionally no author/admin email on save in the minimal payout form flow.

    return jsonWithNoStore({
      ok: true,
      profile: result.profile,
      transitioned: result.transitioned,
    });
  } catch (error) {
    return handlePayoutProfileError(error);
  }
}
