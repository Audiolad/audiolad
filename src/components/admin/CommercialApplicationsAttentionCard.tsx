import Link from "next/link";

import type { CommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-attention";

type CommercialApplicationsAttentionCardProps = {
  summary: CommercialApplicationAttentionSummary;
};

export default function CommercialApplicationsAttentionCard({
  summary,
}: CommercialApplicationsAttentionCardProps) {
  const hasNew = summary.newCount > 0;
  const hasAttention = summary.attentionCount > 0;

  return (
    <section
      aria-labelledby="admin-commercial-applications-attention-heading"
      className={`rounded-[22px] border p-5 shadow-sm ${
        hasNew
          ? "border-[#d7c2f3] bg-[#f7f1ff]"
          : "border-[#eadff8] bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            id="admin-commercial-applications-attention-heading"
            className="text-lg font-semibold text-[#25135c]"
          >
            Коммерческие заявки
          </h3>
          <dl className="mt-3 space-y-1 text-sm text-[#4d3a7a]">
            <div className="flex gap-2">
              <dt>Новых:</dt>
              <dd className="font-semibold tabular-nums text-[#7042c5]">
                {summary.newCount}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>Требуют внимания:</dt>
              <dd className="font-semibold tabular-nums text-[#7042c5]">
                {summary.attentionCount}
              </dd>
            </div>
          </dl>
          {!hasAttention ? (
            <p className="mt-3 text-sm leading-6 text-[#796ba0]">
              Новых коммерческих заявок сейчас нет.
            </p>
          ) : null}
        </div>

        <Link
          href="/admin/commercial-applications"
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold ${
            hasNew
              ? "bg-[#7042c5] text-white"
              : "border border-[#bda6e1] text-[#7042c5]"
          }`}
        >
          Открыть заявки
        </Link>
      </div>
    </section>
  );
}
