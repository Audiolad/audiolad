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
  AUTHOR_SEO_DISCOVERY_SURFACES,
  buildAuthorDiscoveryDatabaseMatches,
  parseAuthorSeoDiscoverySurface,
  shouldOmitFromWordstatAdditions,
} from "@/lib/seo-queries/author-discovery-status";
import {
  selectProductCreateWordstatAdditions,
  wordstatNumPhrasesForDiscoverySurface,
} from "@/lib/seo-queries/product-create-wordstat";
import {
  loadDiscoveryContextForPhrases,
  loadRankedAnalyzedQueriesForSeed,
} from "@/lib/seo-queries/author-discovery-repository";
import {
  assertMusicCreateSeoDiscoveryEnabled,
  isMusicCreateSeoDiscoveryEnabled,
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

/**
 * Discovery for the Aurafon SEO beta and for any author creating a release.
 * Client sends { author_id, phrase, surface, publication_class? }.
 * `surface` is the authoritative UI context: product_create hides used queries.
 * publication_class=release opens the music create path. Omitting it keeps
 * the standalone dashboard Aurafon-only.
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
    const publicationClass = readString(body, "publication_class");
    const surface = parseAuthorSeoDiscoverySurface(body.surface);
    if (!authorId || !phrase || !surface) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (
      !isMusicCreateSeoDiscoveryEnabled({
        authorId,
        publicationClass,
      })
    ) {
      return NextResponse.json(
        { error: "seo_discovery_beta_disabled", code: "seo_discovery_beta_disabled" },
        { status: 403 },
      );
    }

    const { user } = await requireAuthorMembership(authorId);
    assertMusicCreateSeoDiscoveryEnabled({ authorId, publicationClass });

    let databaseMatches: Array<Record<string, unknown>> = [];
    let seedNormalized: string | null = null;
    const databaseNormalized = new Set<string>();
    try {
      const ranked = await loadRankedAnalyzedQueriesForSeed({
        authorId,
        seedPhrase: phrase,
      });
      seedNormalized = ranked.seedNormalized;
      const built = buildAuthorDiscoveryDatabaseMatches({
        surface,
        authorId,
        items: ranked.matches,
      });
      databaseMatches = built.matches;
      for (const item of ranked.matches) {
        databaseNormalized.add(item.normalizedQuery);
      }
      for (const hidden of built.hiddenNormalizedQueries) {
        databaseNormalized.add(hidden);
      }
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

    const wordstat = await fetchWordstatSuggestions(phrase, {
      userId: user.id,
      numPhrases: wordstatNumPhrasesForDiscoverySurface(surface),
    });
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

    const pending = [];
    for (const suggestion of wordstat.data.suggestions) {
      const normalized = await context.normalize(suggestion.phrase);
      const query = normalized
        ? context.queryByNormalized.get(normalized) ?? null
        : null;
      const reservation = query
        ? context.reservationByQueryId.get(query.id) ?? null
        : null;

      if (
        shouldOmitFromWordstatAdditions({
          surface,
          analysisStatus: query?.analysisStatus,
          reservation,
          normalized,
          databaseNormalized,
        })
      ) {
        continue;
      }

      pending.push({
        phrase: suggestion.phrase,
        count: suggestion.count,
        query,
        reservation,
      });
    }

    const selected =
      surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE
        ? selectProductCreateWordstatAdditions(pending)
        : pending;

    const results = selected.map((item) =>
      reconcileAuthorDiscoverySuggestion({
        suggestion: { phrase: item.phrase, count: item.count },
        authorId,
        query: item.query,
        reservation: item.reservation,
        alreadyProposedByAuthor: item.query
          ? context.proposedQueryIds.has(item.query.id)
          : false,
      }),
    );

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
