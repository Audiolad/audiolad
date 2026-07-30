import Link from "next/link";

import type { AuthorApplicationAttentionSummary } from "@/lib/admin/author-application-attention";

type AuthorApplicationsAttentionCardProps = {
  summary: AuthorApplicationAttentionSummary;
};

export default function AuthorApplicationsAttentionCard({
  summary,
}: AuthorApplicationsAttentionCardProps) {
  const hasNew = summary.newCount > 0;
  const hasAttention = summary.attentionCount > 0;

  return (
    <section
      aria-labelledby="admin-author-applications-attention-heading"
      className={`rounded-[22px] border p-5 shadow-sm ${
        hasNew
          ? "border-[#d7c2f3] bg-[#f7f1ff]"
          : "border-[#eadff8] bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            id="admin-author-applications-attention-heading"
            className="text-lg font-semibold text-[#25135c]"
          >
            Заявки авторов
          </h3>
          <dl className="mt-3 space-y-1 text-sm text-[#4d3a7a]">
            <div className="flex gap-2">
              <dt>Новые:</dt>
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
              Заявок, требующих внимания, сейчас нет.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/author-applications?status=new"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-semibold text-[#7042c5]"
          >
            Новые
          </Link>
          <Link
            href="/admin/author-applications?status=attention"
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold ${
              hasNew
                ? "bg-[#7042c5] text-white"
                : "border border-[#bda6e1] text-[#7042c5]"
            }`}
          >
            Требуют внимания
          </Link>
        </div>
      </div>
    </section>
  );
}
