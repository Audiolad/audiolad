import "server-only";

export type AuthorDiscoveryStatus =
  | "available"
  | "occupied"
  | "own"
  | "pending_review"
  | "not_applicable"
  | "new"
  | "proposed";

export type AuthorDiscoveryLabel =
  | "Свободен"
  | "Занят"
  | "У вас в работе"
  | "На проверке"
  | "Не подходит для SEO-возможностей"
  | "Нет в базе АудиоЛада";

export type AuthorDiscoveryResult = {
  phrase: string;
  frequency: number;
  status: AuthorDiscoveryStatus;
  statusLabel: AuthorDiscoveryLabel;
  queryId: string | null;
  reservationId: string | null;
  productTitle: string | null;
  canReserve: boolean;
  canPropose: boolean;
};

export type DiscoveryQueryRow = {
  id: string;
  analysisStatus: "not_analyzed" | "analyzed" | "not_applicable" | string;
};

export type DiscoveryReservationRow = {
  id: string;
  queryId: string;
  authorId: string;
  status: string;
  productId: string | null;
  expiresAt: string | null;
  productTitle: string | null;
};

export type WordstatSuggestionLike = {
  phrase: string;
  count: number;
};

const STATUS_LABEL: Record<AuthorDiscoveryStatus, AuthorDiscoveryLabel> = {
  available: "Свободен",
  occupied: "Занят",
  own: "У вас в работе",
  pending_review: "На проверке",
  not_applicable: "Не подходит для SEO-возможностей",
  new: "Нет в базе АудиоЛада",
  proposed: "На проверке",
};

function result(
  phrase: string,
  frequency: number,
  status: AuthorDiscoveryStatus,
  extras: Partial<
    Pick<AuthorDiscoveryResult, "queryId" | "reservationId" | "productTitle" | "canReserve" | "canPropose">
  > = {},
): AuthorDiscoveryResult {
  return {
    phrase,
    frequency,
    status,
    statusLabel: STATUS_LABEL[status],
    queryId: extras.queryId ?? null,
    reservationId: extras.reservationId ?? null,
    productTitle: extras.productTitle ?? null,
    canReserve: extras.canReserve ?? false,
    canPropose: extras.canPropose ?? false,
  };
}

/**
 * Map one Wordstat suggestion to author-facing discovery state.
 * Frequency MUST be the suggestion count — never topicTotalCount.
 */
export function reconcileAuthorDiscoverySuggestion(input: {
  suggestion: WordstatSuggestionLike;
  authorId: string;
  query: DiscoveryQueryRow | null;
  reservation: DiscoveryReservationRow | null;
  alreadyProposedByAuthor: boolean;
}): AuthorDiscoveryResult {
  const { suggestion, authorId, query, reservation, alreadyProposedByAuthor } = input;
  const phrase = suggestion.phrase;
  const frequency = suggestion.count;

  if (!query) {
    return result(phrase, frequency, "new", { canPropose: true });
  }

  if (query.analysisStatus === "not_applicable") {
    return result(phrase, frequency, "not_applicable", { queryId: query.id });
  }

  if (query.analysisStatus === "not_analyzed") {
    // Already in review gate — never allow a second proposal from discovery.
    return result(phrase, frequency, "pending_review", { queryId: query.id });
  }

  if (query.analysisStatus !== "analyzed") {
    return result(phrase, frequency, "pending_review", { queryId: query.id });
  }

  if (reservation && (reservation.status === "active" || reservation.status === "used")) {
    if (reservation.authorId === authorId) {
      return result(phrase, frequency, "own", {
        queryId: query.id,
        reservationId: reservation.id,
        productTitle: reservation.productTitle,
      });
    }
    return result(phrase, frequency, "occupied", { queryId: query.id });
  }

  return result(phrase, frequency, "available", {
    queryId: query.id,
    canReserve: true,
  });
}

export type AuthorProposalQueryRow = {
  id: string;
  analysisStatus: string;
  frequency: number | null;
  frequencyCheckedAt: string | null;
  source: string;
};

export type AuthorProposalRepository = {
  normalize(phrase: string): Promise<string | null>;
  findByNormalized(normalizedQuery: string): Promise<AuthorProposalQueryRow | null | undefined>;
  createQuery(input: {
    queryText: string;
    source: "wordstat";
    frequency: number;
    frequencyCheckedAt: string;
    analysisStatus: "not_analyzed";
  }): Promise<
    | { status: "created"; query: AuthorProposalQueryRow }
    | { status: "conflict" }
    | { status: "error" }
  >;
  findProposal(
    queryId: string,
    authorId: string,
  ): Promise<{ id: string } | null | undefined>;
  createProposal(input: {
    queryId: string;
    authorId: string;
    submittedByUserId: string;
  }): Promise<{ status: "created"; id: string } | { status: "conflict" } | { status: "error" }>;
};


export type WordstatSuggestionMatchInput = {
  selectedPhrase: string;
  suggestions: WordstatSuggestionLike[];
  normalize: (phrase: string) => Promise<string | null>;
};

export type WordstatSuggestionMatchResult =
  | { ok: true; phrase: string; count: number }
  | { ok: false; error: "normalize_failed" | "wordstat_selection_stale" };

/**
 * Confirm a client-selected phrase against a fresh server Wordstat suggestion list
 * using canonical normalize_seo_query. Frequency comes only from suggestion.count.
 */
export async function matchWordstatSuggestionCount(
  input: WordstatSuggestionMatchInput,
): Promise<WordstatSuggestionMatchResult> {
  const selectedNormalized = await input.normalize(input.selectedPhrase);
  if (!selectedNormalized) {
    return { ok: false, error: "normalize_failed" };
  }

  for (const suggestion of input.suggestions) {
    const normalized = await input.normalize(suggestion.phrase);
    if (!normalized) continue;
    if (normalized === selectedNormalized) {
      if (!Number.isInteger(suggestion.count) || suggestion.count < 0) {
        return { ok: false, error: "wordstat_selection_stale" };
      }
      return { ok: true, phrase: suggestion.phrase, count: suggestion.count };
    }
  }

  return { ok: false, error: "wordstat_selection_stale" };
}

export type AuthorProposeInput = {
  phrase: string;
  count: number;
  authorId: string;
  submittedByUserId: string;
};

export type AuthorProposeResult =
  | {
      ok: true;
      status: "proposed" | "already_proposed";
      queryId: string;
      proposalId: string | null;
      createdQuery: boolean;
      analysisStatus: "not_analyzed";
      frequency: number;
      frequencyCheckedAt: string | null;
      source: string;
      message: string;
    }
  | {
      ok: false;
      error:
        | "invalid_phrase"
        | "invalid_count"
        | "normalize_failed"
        | "query_lookup_failed"
        | "query_create_failed"
        | "proposal_failed"
        | "already_analyzed"
        | "not_applicable";
      discovery?: AuthorDiscoveryResult;
    };

export async function proposeAuthorSeoQuery(
  input: AuthorProposeInput,
  repository: AuthorProposalRepository,
  now: () => string = () => new Date().toISOString(),
): Promise<AuthorProposeResult> {
  const phrase = typeof input.phrase === "string" ? input.phrase.trim() : "";
  if (!phrase) {
    return { ok: false, error: "invalid_phrase" };
  }
  if (!Number.isInteger(input.count) || input.count < 0) {
    return { ok: false, error: "invalid_count" };
  }

  const normalized = await repository.normalize(phrase);
  if (!normalized) {
    return { ok: false, error: "normalize_failed" };
  }

  let createdQuery = false;
  let query = await repository.findByNormalized(normalized);
  if (query === undefined) {
    return { ok: false, error: "query_lookup_failed" };
  }

  if (!query) {
    const frequencyCheckedAt = now();
    const created = await repository.createQuery({
      queryText: phrase,
      source: "wordstat",
      frequency: input.count,
      frequencyCheckedAt,
      analysisStatus: "not_analyzed",
    });
    if (created.status === "created") {
      query = created.query;
      createdQuery = true;
    } else if (created.status === "conflict") {
      query = await repository.findByNormalized(normalized);
      if (query === undefined || !query) {
        return { ok: false, error: "query_create_failed" };
      }
    } else {
      return { ok: false, error: "query_create_failed" };
    }
  }

  if (query.analysisStatus === "analyzed") {
    return {
      ok: false,
      error: "already_analyzed",
      discovery: reconcileAuthorDiscoverySuggestion({
        suggestion: { phrase, count: input.count },
        authorId: input.authorId,
        query: { id: query.id, analysisStatus: query.analysisStatus },
        reservation: null,
        alreadyProposedByAuthor: false,
      }),
    };
  }
  if (query.analysisStatus === "not_applicable") {
    return {
      ok: false,
      error: "not_applicable",
      discovery: reconcileAuthorDiscoverySuggestion({
        suggestion: { phrase, count: input.count },
        authorId: input.authorId,
        query: { id: query.id, analysisStatus: query.analysisStatus },
        reservation: null,
        alreadyProposedByAuthor: false,
      }),
    };
  }

  const existingProposal = await repository.findProposal(query.id, input.authorId);
  if (existingProposal === undefined) {
    return { ok: false, error: "proposal_failed" };
  }
  if (existingProposal) {
    return {
      ok: true,
      status: "already_proposed",
      queryId: query.id,
      proposalId: existingProposal.id,
      createdQuery,
      analysisStatus: "not_analyzed",
      frequency: typeof query.frequency === "number" ? query.frequency : input.count,
      frequencyCheckedAt: query.frequencyCheckedAt,
      source: query.source,
      message: "Запрос отправлен на проверку",
    };
  }

  const proposal = await repository.createProposal({
    queryId: query.id,
    authorId: input.authorId,
    submittedByUserId: input.submittedByUserId,
  });
  if (proposal.status === "conflict") {
    return {
      ok: true,
      status: "already_proposed",
      queryId: query.id,
      proposalId: null,
      createdQuery,
      analysisStatus: "not_analyzed",
      frequency: typeof query.frequency === "number" ? query.frequency : input.count,
      frequencyCheckedAt: query.frequencyCheckedAt,
      source: query.source,
      message: "Запрос отправлен на проверку",
    };
  }
  if (proposal.status !== "created") {
    return { ok: false, error: "proposal_failed" };
  }

  return {
    ok: true,
    status: "proposed",
    queryId: query.id,
    proposalId: proposal.id,
    createdQuery,
    analysisStatus: "not_analyzed",
    frequency: typeof query.frequency === "number" ? query.frequency : input.count,
    frequencyCheckedAt: query.frequencyCheckedAt,
    source: query.source,
    message: "Запрос отправлен на проверку",
  };
}
