import type { Metadata } from "next";

import ProgramDocumentPage from "@/components/business-documents/ProgramDocumentPage";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import {
  ARCHIVED_WITH_UNIFIED_AGREEMENT,
  documentEditionLabel,
  PUBLIC_PROGRAM_DOCUMENTS,
} from "@/lib/business-rightsholder/program-documents";

const doc = PUBLIC_PROGRAM_DOCUMENTS.business_music_rights_declaration;

export const metadata: Metadata = {
  title: `${doc.title} — ${documentEditionLabel(doc)}`,
  robots: { index: false, follow: false },
  alternates: { canonical: doc.path },
};

// Archive banner follows the server flag at request time.
export const dynamic = "force-dynamic";

export default function Page() {
  const archived = isUnifiedAgreementEnabled() && ARCHIVED_WITH_UNIFIED_AGREEMENT.includes(doc.key);
  return <ProgramDocumentPage doc={doc} archived={archived} />;
}
