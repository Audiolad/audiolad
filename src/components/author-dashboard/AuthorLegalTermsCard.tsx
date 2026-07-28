import Link from "next/link";

import AuthorTermsAcceptPanel from "@/components/author-dashboard/AuthorTermsAcceptPanel";
import type { AuthorTermsStatusView } from "@/lib/author-terms/types";

type Props = {
  authorId: string;
  authorSlug: string;
  status: AuthorTermsStatusView;
  mode: "first" | "updated";
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

/** Single legal-document card for /author-dashboard/legal (pending or accepted). */
export default function AuthorLegalTermsCard({
  authorId,
  authorSlug,
  status,
  mode,
}: Props) {
  const needsAcceptance = Boolean(
    status.currentVersion && !status.acceptedCurrent,
  );

  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-6">
      <h2 className="text-[20px] font-semibold text-[#25135c]">
        Авторские условия сотрудничества платформы «АудиоЛад»
      </h2>
      <p className="mt-2 text-[15px] leading-6 text-[#4c3d78]">
        Условия регулируют размещение продуктов, предоставление доступа
        слушателям и выплату авторского вознаграждения.
      </p>

      {status.currentVersion ? (
        <dl className="mt-4 space-y-2 text-sm text-[#4c3d78]">
          <div>
            <dt className="font-medium text-[#7d70a2]">Версия</dt>
            <dd>{status.currentVersion.version}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#7d70a2]">Дата публикации</dt>
            <dd>{formatDate(status.currentVersion.publishedAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#7d70a2]">
              Дата вступления в силу
            </dt>
            <dd>{formatDate(status.currentVersion.effectiveAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-[#7d70a2]">Статус</dt>
            <dd>
              {status.acceptedCurrent ? "Принято" : "Требуется принятие"}
            </dd>
          </div>
          {status.acceptedCurrent && status.acceptance ? (
            <div>
              <dt className="font-medium text-[#7d70a2]">Дата принятия</dt>
              <dd>{formatDateTime(status.acceptance.acceptedAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-[#8c7dab]">
          Актуальная редакция пока не опубликована.
        </p>
      )}

      {needsAcceptance ? (
        <AuthorTermsAcceptPanel
          authorId={authorId}
          authorSlug={authorSlug}
          status={status}
          mode={mode}
          variant="embedded"
        />
      ) : status.currentVersion ? (
        <div className="mt-5">
          <Link
            href="/author-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-full border border-[#7042c5] px-5 text-sm font-semibold text-[#7042c5]"
          >
            Открыть документ
          </Link>
        </div>
      ) : null}
    </section>
  );
}
