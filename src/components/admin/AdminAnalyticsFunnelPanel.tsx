import type { AdminAnalyticsFunnelStep } from "@/lib/admin/analytics-queries";

function FunnelColumn({
  title,
  subtitle,
  steps,
}: {
  title: string;
  subtitle: string;
  steps: AdminAnalyticsFunnelStep[];
}) {
  const max = Math.max(...steps.map((step) => step.value), 1);

  return (
    <div className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[#25135c]">{title}</h3>
      <p className="mt-1 text-sm text-[#796ba0]">{subtitle}</p>

      <ul className="mt-4 space-y-3">
        {steps.map((step) => {
          const width = Math.max(8, Math.round((step.value / max) * 100));

          return (
            <li key={step.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-[#25135c]">{step.label}</span>
                <span className="text-[#7042c5]">
                  {step.value.toLocaleString("ru-RU")}
                  <span className="ml-1 text-xs text-[#9485b4]">
                    {step.kindLabel}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f3ecfb]">
                <div
                  className="h-full rounded-full bg-[#7042c5]"
                  style={{ width: `${width}%` }}
                />
              </div>
              {step.conversionFromPrevious ? (
                <p
                  className="mt-1 text-xs text-[#796ba0]"
                  title={step.conversionHint ?? undefined}
                >
                  от пред. этапа: {step.conversionFromPrevious}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AdminAnalyticsFunnelPanel({
  events,
  people,
  purchasesPlaceholder,
}: {
  events: AdminAnalyticsFunnelStep[];
  people: AdminAnalyticsFunnelStep[];
  purchasesPlaceholder: string;
}) {
  return (
    <section aria-labelledby="admin-funnel-heading" className="space-y-4">
      <div>
        <h2 id="admin-funnel-heading" className="text-[19px] font-semibold">
          Продуктовая воронка
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Две линии: события и уникальные люди. Не смешиваем типы измерений.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FunnelColumn
          title="События"
          subtitle="Сколько раз произошло действие"
          steps={events}
        />
        <FunnelColumn
          title="Люди"
          subtitle="Сколько уникальных visitor_key"
          steps={people}
        />
      </div>

      <div className="rounded-[22px] border border-dashed border-[#eadff8] bg-[#fcfaff] p-4 text-sm text-[#796ba0]">
        <p className="font-medium text-[#25135c]">Купили</p>
        <p className="mt-1">{purchasesPlaceholder}</p>
      </div>
    </section>
  );
}
