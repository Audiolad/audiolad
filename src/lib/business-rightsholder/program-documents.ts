// Public read-only program documents for the rights-holder onboarding consent checkboxes (task 8d9cd0af).
// Program terms: редакция r6 от 17.10.2026 (owner decision, Sergey, 17.10.2026: liability without fixed amounts);
// r6.1 от 18.10.2026: the same r6 text with en dashes instead of em dashes (Sergey, 18.10.2026 13:17); punctuation only.
// rights declaration: редакция r5 от 16.10.2026 (unchanged, separate PR). No lawyer gate.
import {
  PROGRAM_TERMS_MD,
  PROGRAM_TERMS_MD_SHA256,
  PROGRAM_TERMS_R6_MD,
  PROGRAM_TERMS_R6_MD_SHA256,
  RIGHTS_DECLARATION_MD,
  RIGHTS_DECLARATION_MD_SHA256,
} from "./legal-drafts/content";
import { PROGRAM_TERMS_R6_2_DRAFT_MD, PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256 } from "./legal-drafts/program-terms-r6-2-draft";

export type ProgramDocumentKey = "business_program_terms" | "business_music_rights_declaration";

export type PublicProgramDocument = {
  key: ProgramDocumentKey;
  path: string;
  title: string;
  version: string;
  /** ISO date (YYYY-MM-DD) of this редакция. */
  date: string;
  status: "draft" | "approved";
  markdown: string;
  sha256: string;
};

/** Public requisites of the rights-holder/operator (same values as /requisites). Never passport or address. */
export const PROGRAM_DOCUMENT_REQUISITES = {
  name: "Индивидуальный предприниматель Петров Сергей Сергеевич",
  inn: "507305817690",
  ogrnip: "316505300063237",
} as const;

export const PUBLIC_PROGRAM_DOCUMENTS: Record<ProgramDocumentKey, PublicProgramDocument> = {
  business_program_terms: {
    key: "business_program_terms",
    path: "/business-documents/program-terms",
    title: "Условия программы АудиоЛад Бизнес",
    version: "r6.1-2026-10-18",
    date: "2026-10-18",
    status: "approved",
    // Legacy flow (flag OFF) keeps r6 byte-identical: its п. 1 names the rights statement.
    markdown: PROGRAM_TERMS_R6_MD,
    sha256: PROGRAM_TERMS_R6_MD_SHA256,
  },
  business_music_rights_declaration: {
    key: "business_music_rights_declaration",
    path: "/business-documents/music-rights-declaration",
    title: "Заявление о правах на музыку",
    version: "r5-2026-10-16",
    date: "2026-10-16",
    status: "approved",
    markdown: RIGHTS_DECLARATION_MD,
    sha256: RIGHTS_DECLARATION_MD_SHA256,
  },
};

/**
 * Unified agreement 2.0 (flag on): the separate rights statement is archived — its text stays
 * readable unchanged (hash-pinned) for authors who signed it, but it is no longer a consent step.
 */
export const ARCHIVED_WITH_UNIFIED_AGREEMENT: readonly ProgramDocumentKey[] = ["business_music_rights_declaration"];

export const PROGRAM_DOCUMENT_ARCHIVE_NOTICE =
  "Документ в архиве. С редакции 2.0 Авторских условий права на музыку для «АудиоЛад Бизнес» подтверждаются Единым коммерческим соглашением с правообладателем; отдельное заявление больше не подписывается. Текст сохранён без изменений для авторов, которые его подписали.";

/**
 * Program terms r8 (flag ON; r7 + п. 5 «треки с подтверждёнными правами», edition 2.1, task 8d9cd0af): п. 1 names the unified commercial agreement 2.0 as the basis for
 * sublicensing to venues instead of the archived rights statement. Same path and date as r6.1
 * (r6.1 = r6 with en dashes, #912); only п. 1 differs.
 */
export const UNIFIED_PROGRAM_TERMS_DOCUMENT: PublicProgramDocument = {
  ...PUBLIC_PROGRAM_DOCUMENTS.business_program_terms,
  version: "r8-2026-10-18",
  markdown: PROGRAM_TERMS_MD,
  sha256: PROGRAM_TERMS_MD_SHA256,
};

/**
 * Draft r6.2 of the legacy program terms (23.10.2026, task b01d3006). NOT published and not wired into
 * programTermsDocument(): r6.1 remains the accepted edition and its consent records are untouched.
 * Only two lines differ from r6.1: the edition date and п. «Лицензиар» (generic operator name, requisites
 * referenced via /requisites). Publishing needs the owner's decision, a new business_program_document_versions
 * row and a re-consent step; if the publication date changes, the date line and this checksum change too.
 */
export const PROGRAM_TERMS_R6_2_DRAFT_DOCUMENT: PublicProgramDocument = {
  ...PUBLIC_PROGRAM_DOCUMENTS.business_program_terms,
  version: "r6.2-2026-10-23",
  date: "2026-10-23",
  status: "draft",
  markdown: PROGRAM_TERMS_R6_2_DRAFT_MD,
  sha256: PROGRAM_TERMS_R6_2_DRAFT_MD_SHA256,
};

export function programTermsDocument(unifiedAgreementEnabled: boolean): PublicProgramDocument {
  return unifiedAgreementEnabled ? UNIFIED_PROGRAM_TERMS_DOCUMENT : PUBLIC_PROGRAM_DOCUMENTS.business_program_terms;
}

export function formatDocumentDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/** «Редакция от 16.10.2026» for approved; drafts get «, черновик». */
export function documentEditionLabel(doc: Pick<PublicProgramDocument, "date" | "status">): string {
  const base = `Редакция от ${formatDocumentDate(doc.date)}`;
  return doc.status === "draft" ? `${base}, черновик` : base;
}
