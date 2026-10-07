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
  AUTHOR_SEO_DISCOVERY_CONTEXT_WARNING,
  AUTHOR_SEO_DISCOVERY_SURFACES,
  authorDiscoverySupplementaryWarning,
  buildAuthorDiscoveryDatabaseMatches,
  buildExactSeedDiscoveryNotice,
  parseAuthorSeoDiscoverySurface,
  shouldOmitFromWordstatAdditions,
  type AuthorDiscoveryDatabaseMatch,
} from "@/lib/seo-queries/author-discovery-status";
import { SEO_DISCOVERY_DATABASE_LIMIT } from "@/lib/seo-queries/discovery-ranking";
import {
  selectProductCreateWordstatAdditions,
  wordstatNumPhrasesForDiscoverySurface,
} from "@/lib/seo-queries/product-create-wordstat";
import {
  loadDiscoveryContextForPhrases,
  loadRankedAnalyzedQueriesForSeed,
} from "@/lib/seo-queries/author-discovery-repository";
import {
  SEO_DISCOVERY_BETA_DISABLED_MESSAGE,
  assertProductCreateSeoDiscoveryEnabled,
  isProductCreateSeoDiscoveryEnabled,
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
 * Discovery for the Aurafon SEO beta and for product creation.
 * Client sends { author_id, phrase, surface, publication_class? }.
 * `surface` is the authoritative UI context: product_create hides used queries.
 * publication_class=release or practice opens the respective create path.
 * Omitting it keeps the standalone dashboard Aurafon-only.
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
      !isProductCreateSeoDiscoveryEnabled({
        authorId,
        publicationClass,
      })
    ) {
      return NextResponse.json(
        {
          error: "seo_discovery_beta_disabled",
          code: "seo_discovery_beta_disabled",
          message: SEO_DISCOVERY_BETA_DISABLED_MESSAGE,
        },
        { status: 403 },
      );
    }

    const { user } = await requireAuthorMembership(authorId);
    assertProductCreateSeoDiscoveryEnabled({ authorId, publicationClass });

    let databaseMatches: AuthorDiscoveryDatabaseMatch[] = [];
    let seedNormalized: string | null = null;
    let exactSeedNotice: ReturnType<typeof buildExactSeedDiscoveryNotice> = null;
    let databaseWarning: string | null = null;
    let databaseStage: string | null = null;
    const databaseNormalized = new Set<string>();
    try {
      const ranked = await loadRankedAnalyzedQueriesForSeed({
        authorId,
        seedPhrase: phrase,
        surface,
      });
      seedNormalized = ranked.seedNormalized;
      databaseStage = ranked.supplementaryStage;
      databaseWarning = authorDiscoverySupplementaryWarning(ranked.supplementaryStage);
      const built = buildAuthorDiscoveryDatabaseMatches({
        surface,
        authorId,
        items: ranked.matches,
        visibleLimit: SEO_DISCOVERY_DATABASE_LIMIT,
      });
      databaseMatches = built.matches;
      const exactItem = seedNormalized
        ? ranked.matches.find((item) => item.normalizedQuery === seedNormalized) ??
          null
        : null;
      exactSeedNotice = exactItem
        ? buildExactSeedDiscoveryNotice({
            authorId,
            item: exactItem,
            shownQueryIds: new Set(built.matches.map((item) => item.queryId)),
          })
        : null;
      for (const item of ranked.matches) {
        databaseNormalized.add(item.normalizedQuery);
      }
      for (const hidden of built.hiddenNormalizedQueries) {
        databaseNormalized.add(hidden);
      }
    } catch (loadError) {
      const stage =
        loadError instanceof Error
          ? loadError.message
          : "seo_discovery_database_failed";
      console.error("author_seo_discovery_database_error", stage);
      return NextResponse.json(
        {
          error: "Не удалось подобрать запросы из базы АудиоЛада. Попробуйте ещё раз.",
          code: "seo_discovery_database_failed",
          stage,
        },
        { status: 500 },
      );
    }

    if (seedNormalized) databaseNormalized.add(seedNormalized);

    let wordstat: Awaited<ReturnType<typeof fetchWordstatSuggestions>>;
    try {
      wordstat = await fetchWordstatSuggestions(phrase, {
        userId: user.id,
        numPhrases: wordstatNumPhrasesForDiscoverySurface(surface),
      });
    } catch (wordstatErrorThrown) {
      console.info("[wordstat] author_discovery_degraded", {
        code: "UPSTREAM_ERROR",
        authorId,
        phraseLength: phrase.length,
        thrown:
          wordstatErrorThrown instanceof Error
            ? wordstatErrorThrown.message
            : "unknown",
      });
      wordstat = wordstatError("UPSTREAM_ERROR");
    }
    if (!wordstat.ok) {
      const wordstatWarning =
        wordstat.error.code === "NO_RESULTS"
          ? "Проверенные запросы из базы АудиоЛада показаны ниже. Дополнительных вариантов из Яндекса по этой теме не найдено."
          : wordstat.error.code === "INVALID_QUERY" || wordstat.error.code === "INVALID_PHRASE"
            ? `${wordstat.error.message} Проверенные запросы из базы АудиоЛада показаны ниже.`
            : "Показываем проверенные запросы из базы АудиоЛада. Дополнительные варианты из Яндекса временно недоступны.";

      console.info("[wordstat] author_discovery_degraded", {
        code: wordstat.error.code,
        authorId,
        phraseLength: phrase.length,
      });

      return NextResponse.json({
        phrase,
        region: null,
        periodLabel: null,
        databaseMatches,
        results: [],
        wordstatWarning,
        exactSeedNotice,
        databaseWarning,
        databaseStage,
      });
    }

    let context: Awaited<ReturnType<typeof loadDiscoveryContextForPhrases>>;
    try {
      context = await loadDiscoveryContextForPhrases({
        authorId,
        phrases: wordstat.data.suggestions.map((item) => item.phrase),
      });
    } catch (contextError) {
      console.error(
        "seo_discovery_context_failed",
        contextError instanceof Error ? contextError.message : "unknown",
      );
      return NextResponse.json({
        phrase: wordstat.data.phrase,
        region: wordstat.data.region,
        periodLabel: wordstat.data.periodLabel,
        databaseMatches,
        results: [],
        wordstatWarning: AUTHOR_SEO_DISCOVERY_CONTEXT_WARNING,
        exactSeedNotice,
        databaseWarning,
        databaseStage,
        contextStage: "seo_discovery_context_failed",
      });
    }
    if (context.failedStage) {
      console.error("seo_discovery_context_failed", context.failedStage);
      return NextResponse.json({
        phrase: wordstat.data.phrase,
        region: wordstat.data.region,
        periodLabel: wordstat.data.periodLabel,
        databaseMatches,
        exactSeedNotice,
        databaseWarning,
        databaseStage,
        results: [],
        wordstatWarning: AUTHOR_SEO_DISCOVERY_CONTEXT_WARNING,
        contextStage: context.failedStage,
      });
    }

    const pending = [];
    for (const suggestion of wordstat.data.suggestions) {
      const normalized = await context.normalize(suggestion.phrase);
      if (!normalized) continue;
      const query = context.queryByNormalized.get(normalized) ?? null;
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
      exactSeedNotice,
      databaseWarning,
      databaseStage,
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
        {
          error: "seo_discovery_beta_disabled",
          code: "seo_discovery_beta_disabled",
          message: SEO_DISCOVERY_BETA_DISABLED_MESSAGE,
        },
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
