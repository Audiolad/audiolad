import type { Metadata } from "next";

import ProgramDocumentPage from "@/components/business-documents/ProgramDocumentPage";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import { documentEditionLabel, programTermsDocument } from "@/lib/business-rightsholder/program-documents";

// Edition follows the server flag at request time: r7 (unified agreement 2.0) when on, r6 when off.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const doc = programTermsDocument(isUnifiedAgreementEnabled());
  return {
    title: `${doc.title} — ${documentEditionLabel(doc)}`,
    robots: { index: false, follow: false },
    alternates: { canonical: doc.path },
  };
}

export default function Page() {
  return <ProgramDocumentPage doc={programTermsDocument(isUnifiedAgreementEnabled())} />;
}
