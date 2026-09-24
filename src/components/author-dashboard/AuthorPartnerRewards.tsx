import { formatPartnerRewardMoney } from "@/lib/author-partner/money-format";
import type {
  PartnerRewardDashboard,
  PartnerRewardHistoryRow,
} from "@/lib/author-partner/rewards";

type Props = {
  dashboard: PartnerRewardDashboard | null;
  loadError?: string | null;
};

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
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
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
      {hint ? <p className="mt-1 text-xs text-[#7d70a2]">{hint}</p> : null}
    </div>
  );
}

function availabilityLabel(row: PartnerRewardHistoryRow): string {
  return row.availabilityState === "available" ? "Доступно" : "На удержании";
}

function entryLabel(row: PartnerRewardHistoryRow): string {
  return row.entryType === "reward_accrual"
    ? "Начисление"
    : "Корректировка после возврата";
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
        Вознаграждения рассчитываются автоматически от роялти приглашённых авторов.
      </p>

      {loadError ? (
        <p className="mt-4 rounded-[16px] border border-[#f3c6c6] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
          {loadError}
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
                  value={formatPartnerRewardMoney(balance.accruedMinor, balance.currency)}
                  hint="С учётом возвратов"
                />
                <Card
                  label="На удержании"
                  value={formatPartnerRewardMoney(balance.heldMinor, balance.currency)}
                />
                <Card
                  label="Доступно"
                  value={formatPartnerRewardMoney(balance.availableMinor, balance.currency)}
                  tone="accent"
                />
                <Card
                  label="Выплачено"
                  value={formatPartnerRewardMoney(balance.paidMinor, balance.currency)}
                  hint="Выплаты подключим следующим этапом"
                />
              </div>
              <p className="mt-2 text-xs text-[#7d70a2]">
                Выплаты партнёрского вознаграждения пока не подключены. Сумма
                «Доступно» означает, что срок удержания завершён, но выплата ещё
                не выполняется.
              </p>
            </div>
          ))
        : null}

      {!loadError && dashboard ? (
        <div className="mt-5 border-t border-[#f0e8fb] pt-4">
          <h4 className="text-[15px] font-semibold text-[#2b2144]">
            История начислений
          </h4>
          {dashboard.history.length === 0 ? (
            <p className="mt-3 text-sm text-[#7d70a2]">
              История начислений пока пуста.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dashboard.history.map((row, index) => (
                <li
                  key={`${row.effectiveAt}-${row.entryType}-${index}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-[18px] border border-[#f0e8fb] bg-[#fdfbff] px-3 py-3"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[#2b2144]">
                      {row.inviteeAuthorName}
                    </span>
                    <span className="mt-1 block text-xs text-[#9a8fbf]">
                      {entryLabel(row)} · {formatDate(row.effectiveAt)} ·{" "}
                      {availabilityLabel(row)}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold text-[#2b2144]">
                    {formatPartnerRewardMoney(row.amountMinor, row.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
