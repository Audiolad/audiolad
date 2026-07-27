import Link from "next/link";

import type { AuthorPayoutProfileAdminListItem } from "@/lib/author-payout-profiles/types";
import {
  getAuthorPayoutProfileStatusLabel,
  getAuthorPayoutRecipientTypeLabel,
} from "@/lib/author-payout-profiles/types";
import { maskBankAccount, maskInn } from "@/lib/author-payout-profiles/masking";

type PayoutProfilesListProps = {
  profiles: AuthorPayoutProfileAdminListItem[];
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

function formatMask(
  last4: string | null,
  maskFn: (value: string) => string,
): string {
  if (!last4) {
    return "—";
  }

  return maskFn(`000000000000${last4}`);
}

export default function PayoutProfilesList({ profiles }: PayoutProfilesListProps) {
  if (profiles.length === 0) {
    return (
      <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
        <p className="text-base font-medium text-[#25135c]">Анкет пока нет</p>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Когда авторы отправят данные для выплат, они появятся здесь.
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
                <th className="px-4 py-3 font-medium">Автор</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">ИНН</th>
                <th className="px-4 py-3 font-medium">Счёт</th>
                <th className="px-4 py-3 font-medium">Отправлена</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr
                  key={profile.id}
                  className="border-b border-[#f3edf9] last:border-b-0"
                >
                  <td className="px-4 py-4 font-medium text-[#25135c]">
                    <div>{profile.author_name}</div>
                    {profile.author_slug ? (
                      <p className="mt-1 text-xs font-normal text-[#796ba0]">
                        /{profile.author_slug}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {getAuthorPayoutRecipientTypeLabel(profile.recipient_type)}
                  </td>
                  <td className="px-4 py-4 font-mono text-[#796ba0]">
                    {formatMask(profile.inn_last4, maskInn)}
                  </td>
                  <td className="px-4 py-4 font-mono text-[#796ba0]">
                    {formatMask(profile.account_last4, maskBankAccount)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-[#796ba0]">
                    {formatDateTime(profile.submitted_at ?? profile.updated_at)}
                  </td>
                  <td className="px-4 py-4 text-[#796ba0]">
                    {getAuthorPayoutProfileStatusLabel(profile.status)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/admin/payout-profiles/${profile.id}`}
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
        {profiles.map((profile) => (
          <article
            key={profile.id}
            className="rounded-[22px] border border-[#eadff8] bg-white p-5"
          >
            <h2 className="text-base font-semibold text-[#25135c]">
              {profile.author_name}
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-[#9485b4]">Тип</dt>
                <dd className="text-[#25135c]">
                  {getAuthorPayoutRecipientTypeLabel(profile.recipient_type)}
                </dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">ИНН</dt>
                <dd className="font-mono text-[#25135c]">
                  {formatMask(profile.inn_last4, maskInn)}
                </dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Счёт</dt>
                <dd className="font-mono text-[#25135c]">
                  {formatMask(profile.account_last4, maskBankAccount)}
                </dd>
              </div>
              <div>
                <dt className="text-[#9485b4]">Статус</dt>
                <dd className="text-[#25135c]">
                  {getAuthorPayoutProfileStatusLabel(profile.status)}
                </dd>
              </div>
            </dl>
            <Link
              href={`/admin/payout-profiles/${profile.id}`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white"
            >
              Открыть
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
