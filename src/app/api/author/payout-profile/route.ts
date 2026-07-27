import { NextResponse } from "next/server";

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
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { sendPayoutProfileAdminSubmittedEmail } from "@/lib/email/send-payout-profile-admin-submitted-email";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

async function notifyAdminAboutPayoutProfileSubmit(input: {
  authorId: string;
  profileId: string;
}) {
  try {
    const service = createServiceRoleClient();
    const { data: author } = await service
      .from("authors")
      .select("name")
      .eq("id", input.authorId)
      .maybeSingle();

    const emailResult = await sendPayoutProfileAdminSubmittedEmail({
      authorName: author?.name?.trim() || "Автор",
      profileId: input.profileId,
      siteOrigin: getAppOrigin(),
    });

    if (!emailResult.ok) {
      console.error(
        "payout_profile_admin_submitted_email_failed",
        emailResult.code,
      );
    }
  } catch (error) {
    console.error("payout_profile_admin_submitted_email_unexpected", error);
  }
}

export async function GET(request: Request) {
  try {
    const authorId = resolveAuthorId(request);

    if (!authorId) {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    await requireAuthorMembership(authorId);
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

    return jsonWithNoStore({ profile });
  } catch (error) {
    return handlePayoutProfileError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId = resolveAuthorId(request, body);

    if (!authorId) {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    const legalEntityError = rejectLegalEntity(body);
    if (legalEntityError) {
      return legalEntityError;
    }

    const { user } = await requireAuthorMembership(authorId);
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
    const body = (await request.json()) as Record<string, unknown>;
    const authorId = resolveAuthorId(request, body);
    const action =
      typeof body.action === "string" ? body.action.trim() : "submit";

    if (!authorId) {
      return jsonWithNoStore({ error: "invalid_request" }, { status: 400 });
    }

    const { user } = await requireAuthorMembership(authorId);
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

    if (result.transitioned && result.profile.id) {
      await notifyAdminAboutPayoutProfileSubmit({
        authorId,
        profileId: result.profile.id,
      });
    }

    return jsonWithNoStore({
      ok: true,
      profile: result.profile,
      transitioned: result.transitioned,
    });
  } catch (error) {
    return handlePayoutProfileError(error);
  }
}
