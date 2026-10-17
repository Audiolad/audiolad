import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SimpleMarkdown from "@/components/legal/SimpleMarkdown";
import { isUnifiedAgreementEnabled } from "@/lib/author-terms/unified-agreement-flag";
import { clientDocumentSource } from "@/lib/business-app/client-document-content";
import {
  CLIENT_DOCUMENT_EDITION_LABEL,
  CLIENT_DOCUMENT_REQUISITES,
  CLIENT_DOCUMENTS,
  findClientDocument,
} from "@/lib/business-app/client-documents";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;
// «b2b-terms» edition follows the unified-agreement flag at request time.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return CLIENT_DOCUMENTS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const doc = findClientDocument(id);
  return {
    title: doc ? `${doc.title} — ${CLIENT_DOCUMENT_EDITION_LABEL}` : "Документ",
    robots: { index: false, follow: false },
  };
}

export default async function ClientDocumentPage({ params }: Props) {
  const { id } = await params;
  const doc = findClientDocument(id);
  const source = clientDocumentSource(id, isUnifiedAgreementEnabled());
  if (!doc || !source) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <article className="business-app-card" data-document-id={doc.id} data-document-version={doc.version} data-document-sha256={source.sha256}>
        <a href="/documents" className="text-sm text-[var(--biz-accent)]">← Все документы</a>
        <h1 className="mt-3 text-[1.45rem] font-bold tracking-tight text-[var(--biz-text)]">{doc.title}</h1>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]" data-testid="document-edition">
          {CLIENT_DOCUMENT_EDITION_LABEL}
        </p>
        <p className="mt-1 text-sm text-[var(--biz-text-muted)]" data-testid="document-requisites">
          {CLIENT_DOCUMENT_REQUISITES}
        </p>
        <SimpleMarkdown source={source.markdown} />
      </article>
    </div>
  );
}
