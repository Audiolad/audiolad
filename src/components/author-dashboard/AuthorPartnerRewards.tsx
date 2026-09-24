import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import type {
  PartnerRewardDashboard,
  PartnerRewardHistoryRow,
} from "@/lib/author-partner/rewards";

type Props = {
  dashboard: PartnerRewardDashboard | null;
  loadError?: string | null;
};

function formatRewardAmount(amountMinor: number, currency: string): string {
  if (currency === "RUB") return formatRubFromMinor(amountMinor);
  return `${amountMinor.toLocaleString("ru-RU")} ${currency} (мин. ед.)`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Card({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3 ${
        tone === "accent"
          ? "border-[#c6afe6] bg-[#faf6ff]"
          : "border-[#eadff8] bg-white"
      }`}
    >
      <p className="text-xs text-[#7d70a2]">{label}</p>
      <p className="mt-1 text-[20px] font-semibold leading-tight text-[#2b2144]">
        {value}
      </p>
    </div>
  );
}

function availabilityLabel(row: PartnerRewardHistoryRow): string {
  return row.availabilityState === "available" ? "Доступно" : "На удержании";
}

export default function AuthorPartnerRewards({
  dashboard,
  loadError = null,
}: Props) {
  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white px-4 py-5 sm:px-5">
      <h3 className="text-[17px] font-semibold text-[#2b2144]">
        Партнёрские начисления
      </h3>
      <p className="mt-1 text-sm text-[#7d70a2]">
        Начисления рассчитываются от роялти приглашённых авторов.
      </p>

      {loadError ? (
        <p className="mt-4 rounded-[16px] border border-[#f3c6c6] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
          {loadError}
        </p>
      ) : null}

      {!loadError && dashboard?.balances.length === 0 ? (
        <p className="mt-4 rounded-[16px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4 text-sm text-[#4a3f6b]">
          Партнёрских начислений пока нет. Они появятся после начисления роялти
          приглашённому автору.
        </p>
      ) : null}

      {!loadError
        ? dashboard?.balances.map((balance) => (
            <div key={balance.currency} className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7d70a2]">
                {balance.currency}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card
                  label="Начислено"
                  value={formatRewardAmount(balance.accruedMinor, balance.currency)}
                />
                <Card
                  label="На удержании"
                  value={formatRewardAmount(balance.heldMinor, balance.currency)}
                />
                <Card
                  label="Доступно"
                  value={formatRewardAmount(balance.availableMinor, balance.currency)}
                  tone="accent"
                />
                <Card
                  label="Выплачено"
                  value={formatRewardAmount(balance.paidMinor, balance.currency)}
                />
              </div>
              {!balance.invariantOk ? (
                <p className="mt-2 text-xs text-[#9b2c2c]">
                  Не удалось подтвердить целостность баланса.
                </p>
              ) : null}
            </div>
          ))
        : null}

      {!loadError && dashboard && dashboard.history.length > 0 ? (
        <div className="mt-5 border-t border-[#f0e8fb] pt-4">
          <h4 className="text-[15px] font-semibold text-[#2b2144]">
            Последние операции
          </h4>
          <ul className="mt-3 space-y-2">
            {dashboard.history.map((row, index) => (
              <li
                key={`${row.effectiveAt}-${row.type}-${index}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-[18px] border border-[#f0e8fb] bg-[#fdfbff] px-3 py-3"
              >
                <span>
                  <span className="block text-sm font-semibold text-[#2b2144]">
                    {row.name}
                  </span>
                  <span className="mt-1 block text-xs text-[#9a8fbf]">
                    {formatDate(row.effectiveAt)} · {availabilityLabel(row)}
                  </span>
                </span>
                <span className="text-right text-sm font-semibold text-[#2b2144]">
                  {formatRewardAmount(row.amountMinor, row.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
