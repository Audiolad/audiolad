import { NextResponse } from "next/server";

import {
  getAuthorCommercialApplication,
} from "@/lib/author-commercial-applications/queries";
import {
  saveAuthorCommercialApplicationDraft,
  submitAuthorCommercialApplication,
} from "@/lib/author-commercial-applications/rpc";
import {
  hasCommercialApplicationFieldErrors,
  normalizeCommercialApplicationFormValues,
  validateCommercialApplicationFormValues,
} from "@/lib/author-commercial-applications/validation";
import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { sendCommercialApplicationAdminAlertEmail } from "@/lib/email/send-commercial-application-admin-alert-email";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function resolveAuthorId(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("author_id")?.trim() ?? "";
  const fromBody =
    typeof body?.author_id === "string" ? body.author_id.trim() : "";

  return fromQuery || fromBody;
}

async function notifyAdminAboutCommercialApplication(input: {
  authorId: string;
  applicationId: string;
  previousStatus: string | null;
  idempotent?: boolean;
}) {
  if (input.idempotent) {
    return;
  }

  const kind =
    input.previousStatus === "needs_changes" ? "updated" : "submitted";

  try {
    const service = createServiceRoleClient();
    const { data: author } = await service
      .from("authors")
      .select("name")
      .eq("id", input.authorId)
      .maybeSingle();

    const emailResult = await sendCommercialApplicationAdminAlertEmail({
      authorName: author?.name?.trim() || "Автор",
      applicationId: input.applicationId,
      kind,
      siteOrigin: getAppOrigin(),
    });

    if (!emailResult.ok) {
      console.error(
        "commercial_application_admin_alert_failed",
        emailResult.code,
      );
    }
  } catch (error) {
    console.error("commercial_application_admin_alert_unexpected", error);
  }
}

export async function GET(request: Request) {
  try {
    const authorId = resolveAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const application = await getAuthorCommercialApplication(supabase, authorId);

    return NextResponse.json({ application });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId = resolveAuthorId(request, body);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const values = normalizeCommercialApplicationFormValues(body);
    const errors = validateCommercialApplicationFormValues(values, {
      requireSubmitRules: false,
    });

    if (hasCommercialApplicationFieldErrors(errors)) {
      return NextResponse.json(
        { error: "validation_failed", errors },
        { status: 400 },
      );
    }

    const rpc = await saveAuthorCommercialApplicationDraft(
      supabase,
      authorId,
      values,
    );

    if (!rpc.ok) {
      return NextResponse.json({ error: rpc.error }, { status: 400 });
    }

    const application = await getAuthorCommercialApplication(supabase, authorId);

    return NextResponse.json({
      ok: true,
      result: rpc.result,
      application,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId = resolveAuthorId(request, body);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const values = normalizeCommercialApplicationFormValues(body);
    const errors = validateCommercialApplicationFormValues(values, {
      requireSubmitRules: true,
    });

    if (hasCommercialApplicationFieldErrors(errors)) {
      return NextResponse.json(
        { error: "validation_failed", errors },
        { status: 400 },
      );
    }

    const previous = await getAuthorCommercialApplication(supabase, authorId);
    const previousStatus = previous?.status ?? null;

    const rpc = await submitAuthorCommercialApplication(
      supabase,
      authorId,
      values,
    );

    if (!rpc.ok) {
      return NextResponse.json({ error: rpc.error }, { status: 400 });
    }

    const application = await getAuthorCommercialApplication(supabase, authorId);
    const applicationId =
      rpc.result.application_id ?? application?.id ?? null;

    if (applicationId) {
      // Non-fatal: never roll back a successful submit because of email issues.
      await notifyAdminAboutCommercialApplication({
        authorId,
        applicationId,
        previousStatus,
        idempotent: rpc.result.idempotent,
      });
    }

    return NextResponse.json({
      ok: true,
      result: rpc.result,
      application,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
