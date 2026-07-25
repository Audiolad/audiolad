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

function resolveAuthorId(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("author_id")?.trim() ?? "";
  const fromBody =
    typeof body?.author_id === "string" ? body.author_id.trim() : "";

  return fromQuery || fromBody;
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

    const rpc = await submitAuthorCommercialApplication(
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
