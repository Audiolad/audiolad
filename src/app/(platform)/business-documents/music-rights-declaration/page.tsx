import type { Metadata } from "next";

import ProgramDocumentPage from "@/components/business-documents/ProgramDocumentPage";
import { documentEditionLabel, PUBLIC_PROGRAM_DOCUMENTS } from "@/lib/business-rightsholder/program-documents";

const doc = PUBLIC_PROGRAM_DOCUMENTS.business_music_rights_declaration;

export const metadata: Metadata = {
  title: `${doc.title} — ${documentEditionLabel(doc)}`,
  robots: { index: false, follow: false },
  alternates: { canonical: doc.path },
};

export default function Page() {
  return <ProgramDocumentPage doc={doc} />;
}
