import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import { proposeAuthorSeoQuery } from "@/lib/seo-queries/author-discovery";
import { createAuthorProposalRepository } from "@/lib/seo-queries/author-discovery-repository";

export const dynamic = "force-dynamic";

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function readCount(body: Record<string, unknown>): number | null {
  return typeof body.count === "number" && Number.isInteger(body.count)
    ? body.count
    : null;
}

/**
 * Author proposes a Wordstat phrase into seo_queries as not_analyzed.
 * Does not reserve, analyze, or link a product. Uses service-role after membership check.
 */
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const authorId = readString(body, "author_id");
    const phrase = readString(body, "phrase");
    const count = readCount(body);
    if (!authorId || !phrase || count === null) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { user } = await requireAuthorMutationMembership(authorId);
    const result = await proposeAuthorSeoQuery(
      {
        phrase,
        count,
        authorId,
        submittedByUserId: user.id,
      },
      createAuthorProposalRepository(),
    );

    if (!result.ok) {
      const status =
        result.error === "already_analyzed" || result.error === "not_applicable"
          ? 409
          : result.error === "invalid_phrase" || result.error === "invalid_count"
            ? 400
            : 400;
      return NextResponse.json(
        {
          error: result.error,
          discovery: result.discovery ?? null,
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        status: result.status,
        message: result.message,
        queryId: result.queryId,
      },
      { status: result.status === "proposed" ? 201 : 200 },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
