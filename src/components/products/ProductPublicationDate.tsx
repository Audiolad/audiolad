import { formatProductDate } from "@/lib/products/publication-dates";

export default function ProductPublicationDate({ publishedAt }: { publishedAt?: string | null }) {
  const date = formatProductDate(publishedAt);
  return date ? (
    <p className="mt-3 text-sm text-[#7d70a2]">
      Опубликовано <time dateTime={publishedAt ?? undefined}>{date}</time>
    </p>
  ) : null;
}
