import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import {
  reconcileAuthorDiscoverySuggestion,
} from "@/lib/seo-queries/author-discovery";
import { loadDiscoveryContextForPhrases } from "@/lib/seo-queries/author-discovery-repository";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import {
  WORDSTAT_ERROR_MESSAGES,
  wordstatError,
  wordstatHttpStatus,
} from "@/lib/seo/wordstat/errors";

export const dynamic = "force-dynamic";

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

/**
 * Author Wordstat search + SEO DB reconciliation.
 * Client sends only { author_id, phrase }. Frequency per result is suggestion.count.
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
    if (!authorId || !phrase) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { user } = await requireAuthorMembership(authorId);

    const wordstat = await fetchWordstatSuggestions(phrase, { userId: user.id });
    if (!wordstat.ok) {
      return NextResponse.json(
        { error: wordstat.error.message, code: wordstat.error.code },
        { status: wordstatHttpStatus(wordstat.error.code) },
      );
    }

    const suggestions = wordstat.data.suggestions;
    const context = await loadDiscoveryContextForPhrases({
      authorId,
      phrases: suggestions.map((item) => item.phrase),
    });

    const results = [];
    for (const suggestion of suggestions) {
      const normalized = await context.normalize(suggestion.phrase);
      const query = normalized
        ? context.queryByNormalized.get(normalized) ?? null
        : null;
      const reservation = query
        ? context.reservationByQueryId.get(query.id) ?? null
        : null;
      results.push(
        reconcileAuthorDiscoverySuggestion({
          suggestion: { phrase: suggestion.phrase, count: suggestion.count },
          authorId,
          query,
          reservation,
          alreadyProposedByAuthor: query
            ? context.proposedQueryIds.has(query.id)
            : false,
        }),
      );
    }

    return NextResponse.json({
      phrase: wordstat.data.phrase,
      region: wordstat.data.region,
      periodLabel: wordstat.data.periodLabel,
      results,
    });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return handleAuthorRouteError(error);
    }
    console.error(
      "author_seo_discovery_error",
      error instanceof Error ? error.name : "unknown",
    );
    const fallback = wordstatError("UPSTREAM_ERROR");
    return NextResponse.json(
      {
        error: WORDSTAT_ERROR_MESSAGES.UPSTREAM_ERROR,
        code: fallback.error.code,
      },
      { status: wordstatHttpStatus("UPSTREAM_ERROR") },
    );
  }
}
