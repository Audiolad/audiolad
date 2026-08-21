import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatAdminSaleAmount,
  getAdminOrderStatusLabel,
  getAdminPaymentStatusLabel,
  getAdminSaleBuyerKindLabel,
  getAdminSaleStatusLabel,
} from "@/lib/admin/sales";
import { getAdminSale } from "@/lib/admin/sales-queries";
import { requireAdminPermission } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 border-b border-[#f3edf9] py-3 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-[#9485b4]">{label}</dt>
      <dd className="text-sm text-[#25135c] break-all">{value}</dd>
    </div>
  );
}

export default async function AdminSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("sales.view");
  const { id } = await params;

  let sale;

  try {
    sale = await getAdminSale(id);
  } catch (error) {
    console.error("admin_sale_detail_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить продажу. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!sale) {
    notFound();
  }

  const buyerKindLabel = getAdminSaleBuyerKindLabel(sale.buyerKind);

  return (
    <section aria-labelledby="admin-sale-detail-heading">
      <div className="mb-5">
        <Link href="/admin/sales" className="text-sm font-medium text-[#7042c5]">
          ← К списку продаж
        </Link>
        <h2
          id="admin-sale-detail-heading"
          className="mt-2 text-[21px] font-semibold"
        >
          {sale.productTitle}
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Статус:{" "}
          {getAdminSaleStatusLabel({
            paymentStatus: sale.paymentStatus,
            orderStatus: sale.orderStatus,
          })}
        </p>
      </div>

      <div className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <dl>
          <DetailRow label="Дата и время" value={formatDateTime(sale.paidAt)} />
          <DetailRow label="Покупатель" value={sale.buyerName} />
          <DetailRow label="Email покупателя" value={sale.buyerEmail ?? "—"} />
          <DetailRow label="ID пользователя" value={sale.buyerUserId ?? "—"} />
          {buyerKindLabel ? (
            <DetailRow label="Тип покупателя" value={buyerKindLabel} />
          ) : null}
          <DetailRow label="Продукт" value={sale.productTitle} />
          <DetailRow label="Slug продукта" value={sale.practiceSlug ?? "—"} />
          <DetailRow label="ID продукта" value={sale.practiceId ?? "—"} />
          <DetailRow label="Автор" value={sale.authorName} />
          <DetailRow label="ID автора" value={sale.authorId ?? "—"} />
          <DetailRow
            label="Сумма"
            value={formatAdminSaleAmount(sale.amountMinor, sale.currency)}
          />
          <DetailRow label="Валюта" value={sale.currency} />
          <DetailRow
            label="Статус оплаты"
            value={getAdminPaymentStatusLabel(sale.paymentStatus)}
          />
          <DetailRow
            label="Статус заказа"
            value={getAdminOrderStatusLabel(sale.orderStatus)}
          />
          <DetailRow label="ID заказа" value={sale.orderId} />
          <DetailRow label="ID платежа" value={sale.paymentId} />
          <DetailRow label="Провайдер" value={sale.provider ?? "—"} />
          <DetailRow
            label="ID платежа провайдера"
            value={sale.providerPaymentId ?? "—"}
          />
          {sale.checkoutOriginPath ? (
            <DetailRow
              label="Source / purchase URL"
              value={sale.checkoutOriginPath}
            />
          ) : null}
          <DetailRow
            label="Создан"
            value={formatDateTime(sale.createdAt)}
          />
          <DetailRow
            label="Подтверждён"
            value={formatDateTime(sale.confirmedAt)}
          />
        </dl>
      </div>
    </section>
  );
}
