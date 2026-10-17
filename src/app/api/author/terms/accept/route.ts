import { NextResponse } from "next/server";
import { headers } from "next/headers";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import { AuthorTermsError } from "@/lib/author-terms/errors";
import { isConsentBlockedForRequest } from "@/lib/author-support/consent-context";
import { SUPPORT_MODE_ACCEPTANCE_FORBIDDEN } from "@/lib/author-support/consent-guard";
import {
  acceptCurrentAuthorTerms,
  authorHasAnyTermsAcceptance,
} from "@/lib/author-terms/service";

export const dynamic = "force-dynamic";

type Body = {
  author_id?: unknown;
  acknowledged?: unknown;
  /** Edition shown to the author (binds the acceptance to what was read). */
  terms_version_id?: unknown;
  content_hash?: unknown;
};

function optionalString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

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
    // Support mode: staff must never accept on the author's behalf.
    // Fail-closed: with a support cookie, an unresolvable context or a
    // different real user also blocks. Bearer-only owners are not affected.
    if (await isConsentBlockedForRequest(user.id)) {
      return NextResponse.json(
        { error: SUPPORT_MODE_ACCEPTANCE_FORBIDDEN },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    // Always the real, signed-in user: never the accompanied author.
    const acceptanceUserId = user.id;
    const headerStore = await headers();
    const hadPriorAcceptance = await authorHasAnyTermsAcceptance(authorId);

    const result = await acceptCurrentAuthorTerms({
      authorId,
      userId: acceptanceUserId,
      role,
      ipAddress: clientIp(headerStore),
      userAgent: headerStore.get("user-agent"),
      hadPriorAcceptance,
      supportMode: false,
      expectedTermsVersionId: optionalString(body.terms_version_id, 64),
      expectedContentHash: optionalString(body.content_hash, 64),
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
