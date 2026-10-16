import {
  documentEditionLabel,
  PUBLIC_PROGRAM_DOCUMENTS,
  type ProgramDocumentKey,
} from "@/lib/business-rightsholder/program-documents";

type Props = {
  documentKey: ProgramDocumentKey;
  children: React.ReactNode;
  /** Version currently published in business_program_document_versions (what the consent will record). */
  dbVersion?: string | null;
  dbUrl?: string | null;
};

/**
 * Link to the readable document page. Rendered OUTSIDE the checkbox <label>, so following it never
 * toggles the checkbox; stopPropagation guards against any wrapping click handler.
 */
export default function ConsentDocumentLink({ documentKey, children, dbVersion, dbUrl }: Props) {
  const doc = PUBLIC_PROGRAM_DOCUMENTS[documentKey];
  const href = dbUrl ?? doc.path;
  // Internal version ids (DB or code) are never shown to users: Russian edition label only.
  const edition = dbVersion ? "действующая редакция" : documentEditionLabel(doc);
  return (
    <>
      <a
        className="underline"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-consent-doc={documentKey}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </a>
      <span className="text-neutral-500"> ({edition})</span>
    </>
  );
}
