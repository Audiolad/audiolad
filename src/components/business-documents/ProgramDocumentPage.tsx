import LegalPageShell from "@/components/legal/LegalPageShell";
import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import {
  documentEditionLabel,
  PROGRAM_DOCUMENT_REQUISITES,
  type PublicProgramDocument,
} from "@/lib/business-rightsholder/program-documents";

export default function ProgramDocumentPage({ doc }: { doc: PublicProgramDocument }) {
  return (
    <LegalPageShell>
      <article data-document-key={doc.key} data-document-version={doc.version} data-document-sha256={doc.sha256}>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight text-[#25135c] lg:text-[32px]">{doc.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#8c7dab]" data-testid="document-edition">
          {documentEditionLabel(doc)}
        </p>
        <p className="mt-3 text-sm leading-6 text-[#6f61a3]" data-testid="document-requisites">
          {PROGRAM_DOCUMENT_REQUISITES.name} · ИНН {PROGRAM_DOCUMENT_REQUISITES.inn} · ОГРНИП {PROGRAM_DOCUMENT_REQUISITES.ogrnip}
        </p>
        <SimpleMarkdown source={doc.markdown} />
      </article>
    </LegalPageShell>
  );
}
