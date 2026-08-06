import Link from "next/link";
import { notFound } from "next/navigation";

import ProductModerationReviewForm from "@/components/admin/ProductModerationReviewForm";
import { requireAdminPermission } from "@/lib/admin/guard";
import { getAdminProductModerationDetail } from "@/lib/admin/product-moderation-queries";
import {
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
} from "@/lib/author-products/moderation";
import { snapshotHasPermission } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

export default async function AdminProductModerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminPermission("author_products.moderate");
  const canManage = snapshotHasPermission(
    session.access,
    "author_products.moderate",
  );
  const { id } = await params;

  let product;

  try {
    product = await getAdminProductModerationDetail(id);
  } catch (error) {
    console.error("admin_product_moderation_detail_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить продукт. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!product) {
    notFound();
  }

  const visible = getVisibleAuthorProductStatus({
    status: product.status,
    moderationStatus: product.moderationStatus,
  });

  return (
    <section aria-labelledby="admin-product-moderation-detail-heading">
      <div className="mb-5">
        <Link
          href="/admin/product-moderation"
          className="text-sm font-medium text-[#7042c5]"
        >
          ← К очереди модерации
        </Link>
        <h2
          id="admin-product-moderation-detail-heading"
          className="mt-2 text-[21px] font-semibold"
        >
          {product.title}
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          {product.authorName} ·{" "}
          {getVisibleAuthorProductStatusLabel(visible)}
        </p>
      </div>

      <ProductModerationReviewForm product={product} canManage={canManage} />
    </section>
  );
}
