import { NextResponse } from "next/server";
import { headers } from "next/headers";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { AuthorTermsError } from "@/lib/author-terms/errors";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import {
  acceptCurrentAuthorTerms,
  authorHasAnyTermsAcceptance,
} from "@/lib/author-terms/service";

export const dynamic = "force-dynamic";

type Body = {
  author_id?: unknown;
  acknowledged?: unknown;
};

function clientIp(headerStore: Headers): string | null {
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) {
    return forwarded.slice(0, 64);
  }

  const realIp = headerStore.get("x-real-ip")?.trim();
  return realIp ? realIp.slice(0, 64) : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const authorId =
      typeof body.author_id === "string" ? body.author_id.trim() : "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (body.acknowledged !== true) {
      return NextResponse.json(
        { error: "acknowledgement_required" },
        { status: 400 },
      );
    }

    const { user, role } = await requireAuthorMembership(authorId);
    const execution = await peekAuthorExecutionContext();
    const acceptanceUserId =
      execution?.isSupportMode ? execution.actingUserId : user.id;
    const headerStore = await headers();
    const hadPriorAcceptance = await authorHasAnyTermsAcceptance(authorId);

    const result = await acceptCurrentAuthorTerms({
      authorId,
      userId: acceptanceUserId,
      role,
      ipAddress: clientIp(headerStore),
      userAgent: headerStore.get("user-agent"),
      hadPriorAcceptance,
    });

    await recordAuthorSupportAudit({
      action: "author_terms_accepted",
      resourceType: "author_terms",
      resourceId: authorId,
      metadata: { created: result.created },
    });

    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        message: "Условия приняты",
        acceptance: {
          id: result.acceptance.id,
          acceptedAt: result.acceptance.accepted_at,
          termsVersionId: result.acceptance.terms_version_id,
          version: result.currentVersion.version,
        },
        currentVersion: {
          id: result.currentVersion.id,
          version: result.currentVersion.version,
          title: result.currentVersion.title,
          publishedAt: result.currentVersion.published_at,
          url: "/author-terms",
        },
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    if (error instanceof AuthorTermsError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    return handleAuthorRouteError(error);
  }
}
