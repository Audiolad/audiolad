import type { AdminAnalyticsFunnelStep } from "@/lib/admin/analytics-queries";

export default function AdminAnalyticsFunnel({
  steps,
}: {
  steps: AdminAnalyticsFunnelStep[];
}) {
  const maxValue = Math.max(...steps.map((step) => step.value), 1);

  return (
    <section
      aria-labelledby="admin-analytics-funnel-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <h3
        id="admin-analytics-funnel-heading"
        className="text-lg font-semibold text-[#25135c]"
      >
        Основные действия за период
      </h3>
      <p className="mt-1 text-sm text-[#796ba0]">
        Агрегированные шаги по сессиям. Порядок не означает строгую последовательность
        одного человека.
      </p>

      <ol className="mt-5 space-y-4">
        {steps.map((step, index) => (
          <li key={step.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-[#25135c]">
                {index + 1}. {step.label}
              </span>
              <span className="text-[#7042c5]">{step.value.toLocaleString("ru-RU")}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f3ecfb]">
              <div
                className="h-full rounded-full bg-[#7042c5]"
                style={{ width: `${Math.max(4, (step.value / maxValue) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
