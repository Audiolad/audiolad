import LegalPageShell from "@/components/legal/LegalPageShell";
import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import {
  documentEditionLabel,
  type PublicProgramDocument,
} from "@/lib/business-rightsholder/program-documents";

export default function ProgramDocumentPage({ doc }: { doc: PublicProgramDocument }) {
  return (
    <LegalPageShell>
      <article data-document-key={doc.key} data-document-version={doc.version}>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight text-[#25135c] lg:text-[32px]">{doc.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#8c7dab]" data-testid="document-edition">
          {documentEditionLabel(doc)} · версия {doc.version}
        </p>
        {doc.status === "draft" ? (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="note">
            Это черновик. Текст ещё проверяется юристом и может измениться; утверждённая редакция будет опубликована на этой же странице.
          </p>
        ) : null}
        <SimpleMarkdown source={doc.markdown} />
        <p className="mt-8 break-all text-xs text-[#8c7dab]">SHA-256 текста: {doc.sha256}</p>
      </article>
    </LegalPageShell>
  );
}
