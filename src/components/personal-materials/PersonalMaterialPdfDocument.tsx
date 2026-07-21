type PersonalMaterialPdfDocumentProps = {
  pdfOpenPath: string;
  filename?: string | null;
};

function getDisplayFilename(filename?: string | null): string {
  const trimmed = filename?.trim();
  return trimmed || "PDF-документ";
}

export default function PersonalMaterialPdfDocument({
  pdfOpenPath,
  filename,
}: PersonalMaterialPdfDocumentProps) {
  const displayName = getDisplayFilename(filename);

  return (
    <section
      aria-label="PDF-документ"
      className="rounded-2xl border border-[#ece6f5] bg-[#fcfbfe] p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold text-[#2f2647]">Документ</h2>
      <p className="mt-2 break-all text-sm text-[#6d628f]">{displayName}</p>

      <div className="mt-4">
        <a
          href={pdfOpenPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white sm:w-auto"
        >
          Открыть PDF
        </a>
      </div>
    </section>
  );
}
