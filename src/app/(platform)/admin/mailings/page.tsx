import Link from "next/link";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  audienceLabel,
  campaignStatusLabel,
  messageTypeLabel,
} from "@/lib/admin/mailings/campaign-status";
import { snapshotHasPermission } from "@/lib/auth/platform-access";
import { createSupabaseApplicationEmailRuntime } from "@/lib/email/supabase-application-email-runtime";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function AdminMailingsPage() {
  const session = await requireAdminPermission("mailings.view");
  const canManage = snapshotHasPermission(session.access, "mailings.manage");
  const runtime = createSupabaseApplicationEmailRuntime();
  const campaigns = await runtime.listCampaigns();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Рассылки</h2>
        {canManage ? (
          <Link href="/admin/mailings/new" className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
            Создать рассылку
          </Link>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-3xl border border-[#e4d7f4] bg-white">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-[#7d70a2]">
            <tr>
              <th className="px-3 py-3">Дата</th>
              <th className="px-3 py-3">Тема</th>
              <th className="px-3 py-3">Аудитория</th>
              <th className="px-3 py-3">Тип</th>
              <th className="px-3 py-3">Статус</th>
              <th className="px-3 py-3">Всего</th>
              <th className="px-3 py-3">Отправлено</th>
              <th className="px-3 py-3">Ошибки</th>
              <th className="px-3 py-3">Исключено</th>
              <th className="px-3 py-3">Запустил</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[#7d70a2]" colSpan={10}>
                  Кампаний пока нет.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-[#f0e8f8]">
                  <td className="px-3 py-3">{formatDate(campaign.createdAt)}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/mailings/${campaign.id}`} className="font-semibold text-[#7042c5]">
                      {campaign.subject}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{audienceLabel(campaign.audienceType)}</td>
                  <td className="px-3 py-3">{messageTypeLabel(campaign.messageType)}</td>
                  <td className="px-3 py-3">{campaignStatusLabel(campaign.status)}</td>
                  <td className="px-3 py-3">{campaign.recipientTotal}</td>
                  <td className="px-3 py-3">{campaign.recipientSent}</td>
                  <td className="px-3 py-3">{campaign.recipientFailed}</td>
                  <td className="px-3 py-3">{campaign.recipientExcluded + campaign.recipientSuppressed}</td>
                  <td className="px-3 py-3">{campaign.launchedBy ?? campaign.createdBy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
