import {
  AUTHOR_PRODUCT_STATUS_LABEL,
  mapAuthorAccessStatusToProductStatus,
} from "@/lib/author-terms/unified-agreement-texts";

/** Only two statuses are shown to authors: «Бесплатный» and «Коммерческий». */
export default function AuthorProductStatusBadge({ accessStatus }: { accessStatus: string | null | undefined }) {
  const status = mapAuthorAccessStatusToProductStatus(accessStatus);
  return (
    <p className="mb-4 text-sm text-[#4c3d78]" data-testid="author-product-status" data-status={status}>
      Ваш статус:{" "}
      <span className="rounded-full bg-[#f1eafd] px-3 py-1 font-semibold text-[#25135c]">
        {AUTHOR_PRODUCT_STATUS_LABEL[status]}
      </span>
    </p>
  );
}
