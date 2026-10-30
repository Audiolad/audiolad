import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import { runAuthorSeoProposalFlow } from "@/lib/seo-queries/author-proposal-flow";
import { createAuthorProposalRepository } from "@/lib/seo-queries/author-discovery-repository";
import { isProductCreateSeoDiscoveryEnabled } from "@/lib/seo-queries/discovery-beta";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import { sendSeoQueryProposalAdminAlertEmail } from "@/lib/email/send-seo-query-proposal-admin-alert-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

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
 *
 * Support mode: the flow calls requireAuthorMutationMembership(authorId,
 * AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT), which writes the support audit row fail-closed before Wordstat or any insert.
 */
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const flow = await runAuthorSeoProposalFlow(body, {
      isBetaEnabled: isProductCreateSeoDiscoveryEnabled,
      // Called with AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT: fail-closed support audit.
      requireMutationMembership: requireAuthorMutationMembership,
      fetchWordstatSuggestions,
      normalize: normalizeSeoQuery,
      createRepository: createAuthorProposalRepository,
    });

    const proposed = flow.proposed;
    if (proposed) {
      try {
        const service = createServiceRoleClient();
        const [{ data: author }, { data: query }] = await Promise.all([
          service
            .from("authors")
            .select("name, slug")
            .eq("id", proposed.authorId)
            .maybeSingle(),
          service
            .from("seo_queries")
            .select("query_text, frequency, source")
            .eq("id", proposed.queryId)
            .maybeSingle(),
        ]);
        const emailResult = await sendSeoQueryProposalAdminAlertEmail({
          proposalId: proposed.proposalId,
          queryId: proposed.queryId,
          queryText:
            typeof query?.query_text === "string"
              ? query.query_text
              : proposed.phrase,
          authorName:
            typeof author?.name === "string" ? author.name : "Автор",
          frequency:
            typeof query?.frequency === "number"
              ? query.frequency
              : proposed.count,
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

    return NextResponse.json(flow.body, { status: flow.status });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
