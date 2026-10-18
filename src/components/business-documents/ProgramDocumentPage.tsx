import LegalPageShell from "@/components/legal/LegalPageShell";
import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import {
  documentEditionLabel,
  PROGRAM_DOCUMENT_ARCHIVE_NOTICE,
  PROGRAM_DOCUMENT_REQUISITES,
  type PublicProgramDocument,
} from "@/lib/business-rightsholder/program-documents";

export default function ProgramDocumentPage({ doc, archived = false }: { doc: PublicProgramDocument; archived?: boolean }) {
  return (
    <LegalPageShell>
      <article data-document-archived={archived ? "1" : "0"} data-document-key={doc.key} data-document-version={doc.version} data-document-sha256={doc.sha256}>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight text-[#25135c] lg:text-[32px]">{doc.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#8c7dab]" data-testid="document-edition">
          {documentEditionLabel(doc)}{archived ? " · архив" : ""}
        </p>
        {archived ? (
          <p
            role="note"
            data-testid="document-archived"
            className="mt-4 rounded-2xl border border-[#f1d9a6] bg-[#fff8e8] p-4 text-sm leading-6 text-[#6b4a00]"
          >
            {PROGRAM_DOCUMENT_ARCHIVE_NOTICE}{" "}
            <a href="/author-terms" className="font-semibold underline underline-offset-2">Открыть соглашение</a>
          </p>
        ) : null}
        <p className="mt-3 text-sm leading-6 text-[#6f61a3]" data-testid="document-requisites">
          {PROGRAM_DOCUMENT_REQUISITES.name} · ИНН {PROGRAM_DOCUMENT_REQUISITES.inn} · ОГРНИП {PROGRAM_DOCUMENT_REQUISITES.ogrnip}
        </p>
        <SimpleMarkdown source={doc.markdown} />
      </article>
    </LegalPageShell>
  );
}
