import Link from "next/link";

import {
  getAdminApplicationStatusLabel,
  isNewAuthorApplicationStatus,
} from "@/lib/admin/application-status";
import type { AdminApplicationListItem } from "@/lib/admin/queries";

type AuthorApplicationsListProps = {
  applications: AdminApplicationListItem[];
};

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
  }).format(new Date(value));
}

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export default function AuthorApplicationsList({
  applications,
}: AuthorApplicationsListProps) {
  if (applications.length === 0) {
    return (
      <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
        <p className="text-base font-medium text-[#25135c]">Заявок пока нет</p>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Когда пользователи отправят заявки на авторство, они появятся здесь.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-[22px] border border-[#eadff8] bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#eee6f7] bg-[#faf6ff] text-[#796ba0]">
              <tr>
                <th className="px-4 py-3 font-medium">Имя</th>
                <th className="px-4 py-3 font-medium">Контакт</th>
                <th className="px-4 py-3 font-medium">Подана</th>
                <th className="px-4 py-3 font-medium">Тематика</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr
                  key={application.id}
                  className="border-b border-[#f3edf9] last:border-b-0"
                >
                  <td className="px-4 py-4 font-medium text-[#25135c]">
                    <div className="flex items-center gap-2">
                      <span>{application.displayName}</span>
                      {isNewAuthorApplicationStatus(application.status) ? (
                        <span className="rounded-full bg-[#ede4fb] px-2 py-0.5 text-xs font-semibold text-[#7042c5]">
                          Новая
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {application.contactSummary}
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {formatDateTime(application.submittedAt ?? application.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {truncate(application.direction, 48)}
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {getAdminApplicationStatusLabel(application.status)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/admin/author-applications/${application.id}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] px-4 text-sm font-medium text-[#7042c5]"
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {applications.map((application) => (
          <article
            key={application.id}
            className="rounded-[22px] border border-[#eadff8] bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#25135c]">
                  {application.displayName}
                </h2>
                <p className="mt-1 text-sm text-[#796ba0]">
                  {application.contactSummary || "Контакт не указан"}
                </p>
              </div>
              {isNewAuthorApplicationStatus(application.status) ? (
                <span className="shrink-0 rounded-full bg-[#ede4fb] px-2 py-0.5 text-xs font-semibold text-[#7042c5]">
                  Новая
                </span>
              ) : null}
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-[#9485b4]">Подана</dt>
                <dd className="text-[#25135c]">
                  {formatDateTime(application.submittedAt ?? application.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Тематика</dt>
                <dd className="text-[#25135c]">{application.direction}</dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Описание</dt>
                <dd className="text-[#25135c]">{truncate(application.about, 160)}</dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Статус</dt>
                <dd className="text-[#25135c]">
                  {getAdminApplicationStatusLabel(application.status)}
                </dd>
              </div>
            </dl>

            <Link
              href={`/admin/author-applications/${application.id}`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white"
            >
              Открыть заявку
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
