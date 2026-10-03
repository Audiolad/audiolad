import Link from "next/link";

import MailingEditor from "@/components/admin/MailingEditor";
import { requireAdminPermission } from "@/lib/admin/guard";
import {
  audienceLabel,
  campaignStatusLabel,
  messageTypeLabel,
} from "@/lib/admin/mailings/campaign-status";
import { snapshotHasPermission } from "@/lib/auth/platform-access";
import { formatHumanSenderLabel, getSenderIdentity } from "@/lib/email/sender-identities";
import { renderManualCampaignEmail } from "@/lib/email/templates/manual-campaign";
import { createSupabaseApplicationEmailRuntime } from "@/lib/email/supabase-application-email-runtime";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { notFound } from "next/navigation";

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

export default async function AdminMailingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireAdminPermission("mailings.view");
  const { id } = await params;
  const query = await searchParams;
  const runtime = createSupabaseApplicationEmailRuntime();
  const campaign = await runtime.getCampaign(id);
  if (!campaign) {
    notFound();
  }

  const canManage = snapshotHasPermission(session.access, "mailings.manage");
  const canSend = snapshotHasPermission(session.access, "mailings.send");
  const recipients = await runtime.listRecipients(campaign.id);
  const needle = query.q?.trim().toLowerCase() ?? "";
  const statusFilter = query.status?.trim() ?? "";
  const visible = recipients.filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (!needle) return true;
    return row.email.toLowerCase().includes(needle) || (row.displayName ?? "").toLowerCase().includes(needle);
  });
  const rendered = renderManualCampaignEmail({
    subject: campaign.subject,
    preheader: campaign.preheader,
    content: campaign.content,
    siteOrigin: getAppOrigin(),
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[#7d70a2]">
            <Link href="/admin/mailings" className="text-[#7042c5]">Рассылки</Link>
          </p>
          <h2 className="text-xl font-semibold">{campaign.subject}</h2>
        </div>
        <p className="text-sm font-semibold">{campaignStatusLabel(campaign.status)}</p>
      </div>

      {campaign.status === "draft" && canManage ? (
        <MailingEditor
          campaignId={campaign.id}
          canSend={canSend}
          initial={{
            name: campaign.name ?? "",
            messageType:
              campaign.messageType === "author_marketing" ? "author_marketing" : "author_operational",
            subject: campaign.subject,
            preheader: campaign.preheader ?? "",
            heading: campaign.content.heading ?? "",
            paragraphs: (campaign.content.paragraphs ?? []).join("\n"),
            ctaLabel: campaign.content.cta?.label ?? "",
            ctaUrl: campaign.content.cta?.url ?? "",
            infoTitle: campaign.content.infoBlock?.title ?? "",
            infoText: campaign.content.infoBlock?.text ?? "",
            secondaryLabel: campaign.content.secondaryLink?.label ?? "",
            secondaryUrl: campaign.content.secondaryLink?.url ?? "",
            filterKind: campaign.filter.kind,
            authorIds: campaign.filter.kind === "specific_authors" ? campaign.filter.authorIds : [],
          }}
        />
      ) : (
        <div className="grid gap-4 rounded-3xl border border-[#e4d7f4] bg-white p-4 text-sm lg:grid-cols-2">
          <div className="space-y-2">
            <p>Отправитель: {formatHumanSenderLabel(getSenderIdentity("authors"))}</p>
            <p>Аудитория: {audienceLabel(campaign.audienceType)}</p>
            <p>Тип: {messageTypeLabel(campaign.messageType)}</p>
            <p>Создал: {campaign.createdBy}</p>
            <p>Запустил: {campaign.launchedBy ?? "—"} · {formatDate(campaign.queuedAt)}</p>
            <p>Фильтр: {campaign.filter.kind}</p>
            <p>
              Всего {campaign.recipientTotal}, в очереди {campaign.recipientQueued}, отправлено {campaign.recipientSent}, ошибки {campaign.recipientFailed}, исключения {campaign.recipientSuppressed}, прочие {campaign.recipientExcluded}
            </p>
          </div>
          {rendered.ok ? (
            <iframe title="Предпросмотр отправленной кампании" className="h-[480px] w-full rounded-2xl border border-[#e4d7f4]" sandbox="" srcDoc={rendered.html} />
          ) : null}
        </div>
      )}

      <form className="flex flex-wrap gap-2" action={`/admin/mailings/${campaign.id}`}>
        <input name="q" defaultValue={query.q ?? ""} placeholder="Поиск по email" className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm" />
        <select name="status" defaultValue={statusFilter} className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm">
          <option value="">Все статусы</option>
          <option value="queued">queued</option>
          <option value="sent">sent</option>
          <option value="failed">failed</option>
          <option value="suppressed">suppressed</option>
          <option value="excluded">excluded</option>
          <option value="cancelled">cancelled</option>
        </select>
        <button className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white" type="submit">
          Фильтр
        </button>
      </form>

      <div className="overflow-x-auto rounded-3xl border border-[#e4d7f4] bg-white">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-[#7d70a2]">
            <tr>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Автор</th>
              <th className="px-3 py-3">Статус</th>
              <th className="px-3 py-3">Отправлено</th>
              <th className="px-3 py-3">Ошибка</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[#7d70a2]" colSpan={5}>Получателей нет.</td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="border-t border-[#f0e8f8]">
                  <td className="px-3 py-3">{row.email}</td>
                  <td className="px-3 py-3">{row.displayName ?? "—"}</td>
                  <td className="px-3 py-3">{row.status}</td>
                  <td className="px-3 py-3">{formatDate(row.sentAt)}</td>
                  <td className="px-3 py-3">{row.errorMessage ?? row.suppressionReason ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
