import type { AdminStatCard } from "@/lib/admin/queries";

type AdminStatGridProps = {
  cards: AdminStatCard[];
};

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminStatGrid({ cards }: AdminStatGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <article
          key={card.key}
          className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
        >
          <p className="text-sm text-[#796ba0]">{card.label}</p>

          {card.kind === "value" ? (
            <p className="mt-2 text-3xl font-semibold text-[#7042c5]">
              {card.value.toLocaleString("ru-RU")}
            </p>
          ) : null}

          {card.kind === "currency" ? (
            <p className="mt-2 text-3xl font-semibold text-[#7042c5]">
              {formatRub(card.valueRub)}
            </p>
          ) : null}

          {card.kind === "unavailable" ? (
            <p className="mt-2 text-sm leading-6 text-[#9485b4]">{card.reason}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
