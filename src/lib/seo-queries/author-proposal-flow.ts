import {
  matchWordstatSuggestionCount,
  proposeAuthorSeoQuery,
  type AuthorProposalRepository,
} from "@/lib/seo-queries/author-discovery";
import { wordstatHttpStatus } from "@/lib/seo/wordstat/errors";
import type { WordstatResult } from "@/lib/seo/wordstat/types";

/**
 * Support-mode journal entry for POST /api/author/seo/proposals.
 * Passed to requireAuthorMutationMembership so the audit row is written
 * (fail-closed) before any Wordstat call or seo_queries / seo_query_proposals write.
 */
export const AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT = {
  action: "author_seo_query_proposed",
  resourceType: "author_seo",
} as const;

export type AuthorSeoProposalSupportAudit = {
  action: string;
  resourceType?: string;
};

export type AuthorSeoProposalFlowDeps = {
  isBetaEnabled(input: { authorId: string; publicationClass: string }): boolean;
  /**
   * Must behave like requireAuthorMutationMembership: throws on access errors
   * and on support audit failure, before returning.
   */
  requireMutationMembership(
    authorId: string,
    supportAudit: AuthorSeoProposalSupportAudit,
  ): Promise<{ user: { id: string } }>;
  fetchWordstatSuggestions(
    seedPhrase: string,
    options: { userId: string },
  ): Promise<WordstatResult>;
  normalize(phrase: string): Promise<string | null>;
  createRepository(): AuthorProposalRepository;
};

export type AuthorSeoProposalFlowResult = {
  status: number;
  body: Record<string, unknown>;
  /** Set only when a new proposal row was created (admin alert input). */
  proposed?: {
    authorId: string;
    proposalId: string;
    queryId: string;
    phrase: string;
    count: number;
  };
};

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Author proposes a Wordstat phrase into seo_queries as not_analyzed.
 * Frequency is confirmed server-side via fetchWordstatSuggestions(seed_phrase)
 * — never trusted from the browser.
 *
 * Errors thrown by requireMutationMembership (access / support audit) propagate
 * to the caller; nothing is written in that case.
 */
export async function runAuthorSeoProposalFlow(
  body: Record<string, unknown>,
  deps: AuthorSeoProposalFlowDeps,
): Promise<AuthorSeoProposalFlowResult> {
  const authorId = readString(body, "author_id");
  const seedPhrase = readString(body, "seed_phrase");
  const phrase = readString(body, "phrase");
  const publicationClass = readString(body, "publication_class");
  if (!authorId || !seedPhrase || !phrase) {
    return { status: 400, body: { error: "invalid_request" } };
  }

  if (!deps.isBetaEnabled({ authorId, publicationClass })) {
    return {
      status: 403,
      body: {
        error: "seo_discovery_beta_disabled",
        code: "seo_discovery_beta_disabled",
      },
    };
  }

  const { user } = await deps.requireMutationMembership(
    authorId,
    AUTHOR_SEO_PROPOSAL_SUPPORT_AUDIT,
  );

  const wordstat = await deps.fetchWordstatSuggestions(seedPhrase, {
    userId: user.id,
  });
  if (!wordstat.ok) {
    return {
      status: wordstatHttpStatus(wordstat.error.code),
      body: { error: wordstat.error.message, code: wordstat.error.code },
    };
  }

  const matched = await matchWordstatSuggestionCount({
    selectedPhrase: phrase,
    suggestions: wordstat.data.suggestions.map((item) => ({
      phrase: item.phrase,
      count: item.count,
    })),
    normalize: deps.normalize,
  });
  if (!matched.ok) {
    if (matched.error === "wordstat_selection_stale") {
      return {
        status: 409,
        body: {
          error: "wordstat_selection_stale",
          message: "Данные изменились. Выполните поиск ещё раз.",
        },
      };
    }
    return { status: 400, body: { error: matched.error } };
  }

  const result = await proposeAuthorSeoQuery(
    {
      phrase: matched.phrase,
      count: matched.count,
      authorId,
      submittedByUserId: user.id,
    },
    deps.createRepository(),
  );

  if (!result.ok) {
    const status =
      result.error === "already_analyzed" || result.error === "not_applicable"
        ? 409
        : 400;
    return {
      status,
      body: { error: result.error, discovery: result.discovery ?? null },
    };
  }

  return {
    status: result.status === "proposed" ? 201 : 200,
    body: {
      status: result.status,
      message: result.message,
      queryId: result.queryId,
      proposalId: result.proposalId,
    },
    proposed:
      result.status === "proposed" && result.proposalId
        ? {
            authorId,
            proposalId: result.proposalId,
            queryId: result.queryId,
            phrase: matched.phrase,
            count: matched.count,
          }
        : undefined,
  };
}
