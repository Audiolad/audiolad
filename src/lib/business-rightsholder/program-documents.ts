// Public read-only program documents for the rights-holder onboarding consent checkboxes (task 8d9cd0af).
// Редакция r4 от 16.10.2026 approved by the owner (Sergey, 16.10.2026); no lawyer gate.
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
    version: "r4-2026-10-16",
    date: "2026-10-16",
    status: "approved",
    markdown: PROGRAM_TERMS_MD,
    sha256: PROGRAM_TERMS_MD_SHA256,
  },
  business_music_rights_declaration: {
    key: "business_music_rights_declaration",
    path: "/business-documents/music-rights-declaration",
    title: "Заявление о правах на музыку",
    version: "r4-2026-10-16",
    date: "2026-10-16",
    status: "approved",
    markdown: RIGHTS_DECLARATION_MD,
    sha256: RIGHTS_DECLARATION_MD_SHA256,
  },
};

export function formatDocumentDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/** «Редакция от 16.10.2026» for approved; drafts get «, черновик». */
export function documentEditionLabel(doc: Pick<PublicProgramDocument, "date" | "status">): string {
  const base = `Редакция от ${formatDocumentDate(doc.date)}`;
  return doc.status === "draft" ? `${base}, черновик` : base;
}
