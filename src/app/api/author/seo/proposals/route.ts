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
import { isMusicCreateSeoDiscoveryEnabled } from "@/lib/seo-queries/discovery-beta";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import { wordstatHttpStatus } from "@/lib/seo/wordstat/errors";
import { sendSeoQueryProposalAdminAlertEmail } from "@/lib/email/send-seo-query-proposal-admin-alert-email";
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
    const publicationClass = readString(body, "publication_class");
    if (!authorId || !seedPhrase || !phrase) {
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

    if (result.status === "proposed" && result.proposalId) {
      try {
        const service = createServiceRoleClient();
        const [{ data: author }, { data: query }] = await Promise.all([
          service
            .from("authors")
            .select("name, slug")
            .eq("id", authorId)
            .maybeSingle(),
          service
            .from("seo_queries")
            .select("query_text, frequency, source")
            .eq("id", result.queryId)
            .maybeSingle(),
        ]);
        const emailResult = await sendSeoQueryProposalAdminAlertEmail({
          proposalId: result.proposalId,
          queryId: result.queryId,
          queryText:
            typeof query?.query_text === "string"
              ? query.query_text
              : matched.phrase,
          authorName:
            typeof author?.name === "string" ? author.name : "Автор",
          frequency:
            typeof query?.frequency === "number"
              ? query.frequency
              : matched.count,
          source:
            typeof query?.source === "string" ? query.source : "wordstat",
          submittedAt: new Date().toISOString(),
          supabase: service,
        });
        if (!emailResult.ok) {
          console.error(
            "seo_query_proposal_admin_email_failed",
            emailResult.code,
          );
        }
      } catch (error) {
        console.error(
          "seo_query_proposal_admin_email_unexpected",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return NextResponse.json(
      {
        status: result.status,
        message: result.message,
        queryId: result.queryId,
        proposalId: result.proposalId,
      },
      { status: result.status === "proposed" ? 201 : 200 },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
