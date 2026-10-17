/**
 * Registry of approved Author Terms editions and the pure gate logic for the
 * unified agreement (2.0) rollout. No I/O here: unit-tested directly.
 */
import {
  AUTHOR_TERMS_APPROVED_META,
  AUTHOR_TERMS_APPROVED_TEXT,
  AUTHOR_TERMS_TOC,
} from "@/lib/author-terms/approved-content";
import {
  AUTHOR_TERMS_V2_FRONT_MATTER_MARKER,
  AUTHOR_TERMS_V2_META,
  AUTHOR_TERMS_V2_TEXT,
  AUTHOR_TERMS_V2_TOC,
} from "@/lib/author-terms/approved-content-v2";
import {
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXT,
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED,
} from "@/lib/author-terms/unified-agreement-texts";

export type ApprovedAuthorTermsEdition = {
  versionId: string;
  version: string;
  title: string;
  publishedAt: string;
  effectiveAt: string;
  contentHash: string;
  coversBusiness: boolean;
  frontMatterMarker: string;
  toc: ReadonlyArray<{ n: number; title: string; id: string }>;
  text: string;
  /** Checkbox text recorded verbatim in author_terms_acceptances.acceptance_text. */
  acceptanceText: string;
  acceptanceTextUpdated: string;
};

export const AUTHOR_TERMS_V1_FRONT_MATTER_MARKER = "Настоящие Авторские условия сотрудничества";

export const APPROVED_AUTHOR_TERMS_EDITIONS: readonly ApprovedAuthorTermsEdition[] = [
  {
    versionId: AUTHOR_TERMS_APPROVED_META.versionId,
    version: AUTHOR_TERMS_APPROVED_META.version,
    title: AUTHOR_TERMS_APPROVED_META.title,
    publishedAt: AUTHOR_TERMS_APPROVED_META.publishedAt,
    effectiveAt: AUTHOR_TERMS_APPROVED_META.effectiveAt,
    contentHash: AUTHOR_TERMS_APPROVED_META.contentHash,
    coversBusiness: false,
    frontMatterMarker: AUTHOR_TERMS_V1_FRONT_MATTER_MARKER,
    toc: AUTHOR_TERMS_TOC,
    text: AUTHOR_TERMS_APPROVED_TEXT,
    acceptanceText:
      "Я ознакомился(ась) с Авторскими условиями сотрудничества платформы «АудиоЛад» и принимаю их в полном объёме.",
    acceptanceTextUpdated:
      "Я ознакомился(ась) с новой редакцией Авторских условий сотрудничества и принимаю её в полном объёме.",
  },
  {
    versionId: AUTHOR_TERMS_V2_META.versionId,
    version: AUTHOR_TERMS_V2_META.version,
    title: AUTHOR_TERMS_V2_META.title,
    publishedAt: AUTHOR_TERMS_V2_META.publishedAt,
    effectiveAt: AUTHOR_TERMS_V2_META.effectiveAt,
    contentHash: AUTHOR_TERMS_V2_META.contentHash,
    coversBusiness: AUTHOR_TERMS_V2_META.coversBusiness,
    frontMatterMarker: AUTHOR_TERMS_V2_FRONT_MATTER_MARKER,
    toc: AUTHOR_TERMS_V2_TOC,
    text: AUTHOR_TERMS_V2_TEXT,
    acceptanceText: UNIFIED_AGREEMENT_ACCEPTANCE_TEXT,
    acceptanceTextUpdated: UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED,
  },
];

export const LEGACY_AUTHOR_TERMS_EDITION = APPROVED_AUTHOR_TERMS_EDITIONS[0];
export const UNIFIED_AUTHOR_TERMS_EDITION = APPROVED_AUTHOR_TERMS_EDITIONS[1];

/**
 * Editions the server may accept / display for a given DB content hash.
 * Flag off: only the legacy edition (exactly the pre-2.0 behaviour).
 */
export function findAcceptableEditionByHash(
  contentHash: string | null | undefined,
  unifiedEnabled: boolean,
): ApprovedAuthorTermsEdition | null {
  if (!contentHash) return null;
  const pool = unifiedEnabled ? APPROVED_AUTHOR_TERMS_EDITIONS : [LEGACY_AUTHOR_TERMS_EDITION];
  return pool.find((edition) => edition.contentHash === contentHash) ?? null;
}

export function findEditionByVersion(version: string | null | undefined): ApprovedAuthorTermsEdition | null {
  if (!version) return null;
  return APPROVED_AUTHOR_TERMS_EDITIONS.find((edition) => edition.version === version) ?? null;
}

export type TermsGateInput = {
  unifiedEnabled: boolean;
  now: Date;
  current: {
    id: string;
    coversBusiness: boolean;
    /** Earlier editions stay valid for commercial gates until this moment (2.0 rollout only). */
    reacceptGraceUntil: string | null;
  } | null;
  /** All author_terms acceptances of this author (any edition). */
  acceptances: ReadonlyArray<{ termsVersionId: string; coversBusiness: boolean }>;
};

export type TermsGateResult = {
  /** Commercial gates (sales, payouts, Studio): accepted current OR within the re-acceptance grace. */
  accepted: boolean;
  acceptedCurrent: boolean;
  inGrace: boolean;
  /** Author has accepted an earlier edition but not the current one: show the re-acceptance banner. */
  reacceptRequired: boolean;
  /** AudioLad Business: only an edition that covers Business, personally accepted. Never via 1.x. */
  businessAgreement: boolean;
};

export function evaluateTermsGate(input: TermsGateInput): TermsGateResult {
  const none: TermsGateResult = {
    accepted: false,
    acceptedCurrent: false,
    inGrace: false,
    reacceptRequired: false,
    businessAgreement: false,
  };
  if (!input.current) return none;
  const current = input.current;
  const acceptedCurrent = input.acceptances.some((a) => a.termsVersionId === current.id);
  if (!input.unifiedEnabled) {
    return { ...none, accepted: acceptedCurrent, acceptedCurrent };
  }
  const hasEarlier = input.acceptances.some((a) => a.termsVersionId !== current.id);
  const graceUntil = current.reacceptGraceUntil ? Date.parse(current.reacceptGraceUntil) : Number.NaN;
  const inGrace =
    !acceptedCurrent && hasEarlier && Number.isFinite(graceUntil) && input.now.getTime() < graceUntil;
  const businessAgreement =
    (acceptedCurrent && current.coversBusiness) ||
    (inGrace && input.acceptances.some((a) => a.coversBusiness));
  return {
    accepted: acceptedCurrent || inGrace,
    acceptedCurrent,
    inGrace,
    reacceptRequired: !acceptedCurrent && hasEarlier,
    businessAgreement,
  };
}

export {
  AUTHOR_PRODUCT_STATUS_LABEL,
  mapAuthorAccessStatusToProductStatus,
  type AuthorProductStatus,
} from "@/lib/author-terms/unified-agreement-texts";
