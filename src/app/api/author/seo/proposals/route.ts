import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import {
  matchWordstatSuggestionCount,
  proposeAuthorSeoQuery,
} from "@/lib/seo-queries/author-discovery";
import { createAuthorProposalRepository } from "@/lib/seo-queries/author-discovery-repository";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import { wordstatHttpStatus } from "@/lib/seo/wordstat/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function readString(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

async function normalizeSeoQuery(phrase: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("normalize_seo_query", {
    p_query: phrase,
  });
  return error || typeof data !== "string" || !data ? null : data;
}

/**
 * Author proposes a Wordstat phrase into seo_queries as not_analyzed.
 * Frequency is confirmed server-side via fetchWordstatSuggestions(seed_phrase)
 * — never trusted from the browser.
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
    const seedPhrase = readString(body, "seed_phrase");
    const phrase = readString(body, "phrase");
    if (!authorId || !seedPhrase || !phrase) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { user } = await requireAuthorMutationMembership(authorId);

    const wordstat = await fetchWordstatSuggestions(seedPhrase, {
      userId: user.id,
    });
    if (!wordstat.ok) {
      return NextResponse.json(
        { error: wordstat.error.message, code: wordstat.error.code },
        { status: wordstatHttpStatus(wordstat.error.code) },
      );
    }

    const matched = await matchWordstatSuggestionCount({
      selectedPhrase: phrase,
      suggestions: wordstat.data.suggestions.map((item) => ({
        phrase: item.phrase,
        count: item.count,
      })),
      normalize: normalizeSeoQuery,
    });
    if (!matched.ok) {
      if (matched.error === "wordstat_selection_stale") {
        return NextResponse.json(
          {
            error: "wordstat_selection_stale",
            message: "Данные изменились. Выполните поиск ещё раз.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: matched.error }, { status: 400 });
    }

    const result = await proposeAuthorSeoQuery(
      {
        phrase: matched.phrase,
        count: matched.count,
        authorId,
        submittedByUserId: user.id,
      },
      createAuthorProposalRepository(),
    );

    if (!result.ok) {
      const status =
        result.error === "already_analyzed" || result.error === "not_applicable"
          ? 409
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
