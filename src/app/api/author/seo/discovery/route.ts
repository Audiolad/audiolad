import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import {
  reconcileAuthorDiscoverySuggestion,
} from "@/lib/seo-queries/author-discovery";
import {
  loadDiscoveryContextForPhrases,
  loadRankedAnalyzedQueriesForSeed,
} from "@/lib/seo-queries/author-discovery-repository";
import {
  assertAuthorSeoDiscoveryEnabled,
  isAuthorSeoDiscoveryEnabled,
} from "@/lib/seo-queries/discovery-beta";
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

function databaseMatchStatus(input: {
  authorId: string;
  reservation: {
    authorId: string;
    status: string;
    id: string;
    productId: string | null;
    productTitle: string | null;
  } | null;
}): {
  status: "available" | "occupied" | "own";
  statusLabel: "Свободен" | "Занят" | "У вас в работе";
  canReserve: boolean;
  reservationId: string | null;
  productId: string | null;
  productTitle: string | null;
} {
  const reservation = input.reservation;
  if (reservation && (reservation.status === "active" || reservation.status === "used")) {
    if (reservation.authorId === input.authorId) {
      return {
        status: "own",
        statusLabel: "У вас в работе",
        canReserve: false,
        reservationId: reservation.id,
        productId: reservation.productId,
        productTitle: reservation.productTitle,
      };
    }
    return {
      status: "occupied",
      statusLabel: "Занят",
      canReserve: false,
      reservationId: null,
      productId: null,
      productTitle: null,
    };
  }
  return {
    status: "available",
    statusLabel: "Свободен",
    canReserve: true,
    reservationId: null,
    productId: null,
    productTitle: null,
  };
}

/**
 * Closed-beta discovery: ranked analyzed database matches + Wordstat additions.
 * Client sends only { author_id, phrase }.
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

    if (!isAuthorSeoDiscoveryEnabled(authorId)) {
      return NextResponse.json(
        { error: "seo_discovery_beta_disabled", code: "seo_discovery_beta_disabled" },
        { status: 403 },
      );
    }

    const { user } = await requireAuthorMembership(authorId);
    assertAuthorSeoDiscoveryEnabled(authorId);

    let databaseMatches: Array<Record<string, unknown>> = [];
    let seedNormalized: string | null = null;
    const databaseNormalized = new Set<string>();
    try {
      const ranked = await loadRankedAnalyzedQueriesForSeed({
        authorId,
        seedPhrase: phrase,
      });
      seedNormalized = ranked.seedNormalized;
      databaseMatches = ranked.matches.map((item) => {
        databaseNormalized.add(item.normalizedQuery);
        const status = databaseMatchStatus({
          authorId,
          reservation: item.reservation,
        });
        return {
          phrase: item.queryText,
          frequency: typeof item.frequency === "number" ? item.frequency : null,
          status: status.status,
          statusLabel: status.statusLabel,
          queryId: item.id,
          reservationId: status.reservationId,
          productId: status.productId,
          productTitle: status.productTitle,
          canReserve: status.canReserve,
          canPropose: false,
          source: "database" as const,
        };
      });
    } catch (loadError) {
      console.error(
        "author_seo_discovery_database_error",
        loadError instanceof Error ? loadError.message : "unknown",
      );
      return NextResponse.json(
        {
          error: "Не удалось подобрать запросы из базы АудиоЛада. Попробуйте ещё раз.",
          code: "seo_discovery_database_failed",
        },
        { status: 500 },
      );
    }

    if (seedNormalized) databaseNormalized.add(seedNormalized);

    const wordstat = await fetchWordstatSuggestions(phrase, { userId: user.id });
    if (!wordstat.ok) {
      return NextResponse.json(
        { error: wordstat.error.message, code: wordstat.error.code },
        { status: wordstatHttpStatus(wordstat.error.code) },
      );
    }

    let context;
    try {
      context = await loadDiscoveryContextForPhrases({
        authorId,
        phrases: wordstat.data.suggestions.map((item) => item.phrase),
      });
    } catch (loadError) {
      console.error(
        "author_seo_discovery_context_error",
        loadError instanceof Error ? loadError.message : "unknown",
      );
      return NextResponse.json(
        {
          error: "Не удалось сопоставить результаты с SEO-базой. Попробуйте ещё раз.",
          code: "seo_discovery_context_failed",
        },
        { status: 500 },
      );
    }

    const results = [];
    for (const suggestion of wordstat.data.suggestions) {
      const normalized = await context.normalize(suggestion.phrase);
      const query = normalized
        ? context.queryByNormalized.get(normalized) ?? null
        : null;
      const reservation = query
        ? context.reservationByQueryId.get(query.id) ?? null
        : null;

      // Hide not_applicable from Wordstat additions.
      if (query?.analysisStatus === "not_applicable") continue;

      // Do not duplicate analyzed queries already shown in the database block.
      if (query?.analysisStatus === "analyzed") {
        if (normalized && databaseNormalized.has(normalized)) continue;
        // Analyzed but not in top-7: still skip "missing" framing — omit from bottom.
        continue;
      }

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
      databaseMatches,
      results,
    });
  } catch (error) {
    if (error instanceof AuthorAccessError) {
      return handleAuthorRouteError(error);
    }
    if (
      error instanceof Error &&
      error.message === "seo_discovery_beta_disabled"
    ) {
      return NextResponse.json(
        { error: "seo_discovery_beta_disabled", code: "seo_discovery_beta_disabled" },
        { status: 403 },
      );
    }
    console.error(
      "author_seo_discovery_error",
      error instanceof Error ? error.message : "unknown",
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
