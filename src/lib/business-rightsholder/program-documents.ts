// Public read-only program documents for the rights-holder onboarding consent checkboxes (task 8d9cd0af).
// Program terms: редакция r6 от 17.10.2026 (owner decision, Sergey, 17.10.2026: liability without fixed amounts);
// rights declaration: редакция r5 от 16.10.2026 (unchanged, separate PR). No lawyer gate.
import {
  PROGRAM_TERMS_MD,
  PROGRAM_TERMS_MD_SHA256,
  RIGHTS_DECLARATION_MD,
  RIGHTS_DECLARATION_MD_SHA256,
} from "./legal-drafts/content";

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
    version: "r6-2026-10-17",
    date: "2026-10-17",
    status: "approved",
    markdown: PROGRAM_TERMS_MD,
    sha256: PROGRAM_TERMS_MD_SHA256,
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

export function formatDocumentDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/** «Редакция от 16.10.2026» for approved; drafts get «, черновик». */
export function documentEditionLabel(doc: Pick<PublicProgramDocument, "date" | "status">): string {
  const base = `Редакция от ${formatDocumentDate(doc.date)}`;
  return doc.status === "draft" ? `${base}, черновик` : base;
}
