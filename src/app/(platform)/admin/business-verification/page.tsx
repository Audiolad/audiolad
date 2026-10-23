import Link from "next/link";

import {
  moderateBusinessVerificationAction,
  suspendBusinessProductAction,
} from "@/app/(platform)/admin/business-verification/actions";
import { BusinessCaseCollapsible } from "@/app/(platform)/admin/business-verification/BusinessCaseCollapsible";
import { BusinessDecisionFields } from "@/app/(platform)/admin/business-verification/BusinessDecisionFields";
import { requireAdminPermission } from "@/lib/admin/guard";
import {
  BUSINESS_MODERATION_ACTION_LABEL,
  BUSINESS_VERIFICATION_ADMIN_PATH,
  BUSINESS_VERIFICATION_FILTERS,
  BUSINESS_VERIFICATION_STATUS_LABEL,
  allowedBusinessModerationActions,
  canActOnOwnBusinessCase,
  resolveBusinessVerificationFilter,
  statusesForBusinessVerificationFilter,
  type BusinessVerificationStatus,
} from "@/lib/admin/business-verification";
import { loadBusinessVerificationApplicants } from "@/lib/admin/business-verification-applicant";
import { rightsholderProposalKey } from "@/lib/admin/business-rightsholder-proposal";
import type { ApplicantWorkspace } from "@/lib/admin/business-verification-applicant-model";
import { snapshotHasPermission } from "@/lib/auth/platform-access";
import { getAuthorAccessStatusLabel, type AuthorAccessStatus } from "@/lib/authors/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EVIDENCE_BUCKET = "business-rightsholder-evidence";
const EVIDENCE_LABEL: Record<string, string> = {
  generation: "Подтверждение генерации",
  paid_period: "Подтверждение оплаченного периода",
};

type CaseRow = {
  id: string;
  owner_user_id: string;
  product_id: string;
  audio_item_id: string;
  ai_service: string;
  ai_service_other: string | null;
  service_track_title: string;
  service_track_url: string;
  provider_details: Record<string, unknown> | null;
  declared_rightsholder_name: string | null;
  declared_rightsholder_type: "person" | "organization" | null;
  declared_rightsholder_is_self: boolean | null;
  status: string;
  reason: string | null;
  submitted_at: string | null;
  updated_at: string;
};

function formatMsk(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value)) + " МСК";
}

export default async function AdminBusinessVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; notice?: string }>;
}) {
  const session = await requireAdminPermission("author_products.moderate");
  const params = await searchParams;
  const filter = resolveBusinessVerificationFilter(params.status);
  const statuses = statusesForBusinessVerificationFilter(filter);
  // Business tables are read with the moderator's own session (RLS: business_onboarding_is_moderator).
  const supabase = await createClient();
  // Exactly the DB identity (public.is_platform_owner: RBAC owner OR legacy profiles.role platform_owner).
  // Display-only: the moderation RPCs re-check it. Fail-closed: on error the own-case controls stay hidden.
  const { data: ownerFlag } = await supabase.rpc("is_platform_owner", { p_user_id: session.userId });
  const isPlatformOwner = ownerFlag === true;
  let query = supabase
    .from("business_rightsholder_verifications")
    .select("id, owner_user_id, product_id, audio_item_id, ai_service, ai_service_other, service_track_title, service_track_url, provider_details, declared_rightsholder_name, declared_rightsholder_type, declared_rightsholder_is_self, status, reason, submitted_at, updated_at")
    .neq("status", "draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (statuses) query = query.in("status", statuses);
  const { data: rows, error } = await query;

  if (error) {
    console.error("admin_business_verification_page_error", { code: error.code ?? null });
    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить очередь проверки. Попробуйте обновить страницу.
      </div>
    );
  }

  const cases = (rows ?? []) as CaseRow[];
  const ids = cases.map((c) => c.id);
  const productIds = [...new Set(cases.map((c) => c.product_id))];
  const trackIds = [...new Set(cases.map((c) => c.audio_item_id))];

  const [{ data: evidence }, { data: audit }, { data: suspensions }] = ids.length
    ? await Promise.all([
        supabase.from("business_verification_evidence").select("id, verification_id, kind, object_path, mime_type, created_at").in("verification_id", ids).order("created_at", { ascending: false }),
        supabase.from("business_rightsholder_moderation_audit").select("id, verification_id, actor_user_id, action, reason, previous_status, next_status, created_at").in("verification_id", ids).order("created_at", { ascending: false }),
        supabase.from("business_onboarding_suspensions").select("id, product_id, audio_item_id, reason, created_at").in("product_id", productIds).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // Catalog titles and the rightsholder list are display-only lookups (gated by the permission above).
  const service = createServiceRoleClient();
  const [productsResult, { data: tracks }, { data: rightsholders }] = await Promise.all([
    productIds.length
      ? service.from("practices").select("id, title, author_id, authors!practices_author_id_fkey(id, name, slug, access_status)").in("id", productIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    trackIds.length
      ? service.from("audio_items").select("id, title").in("id", trackIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    service.from("music_rightsholders").select("id, display_name, entity_type, status").eq("status", "active").order("display_name").limit(200),
  ]);
  const [catalogResult, { data: recentSuspensions }] = await Promise.all([
    service
      .from("practices")
      .select("id, title, authors!practices_author_id_fkey(name)")
      .eq("status", "published")
      .eq("product_kind", "music")
      .order("title")
      .limit(1000),
    supabase
      .from("business_onboarding_suspensions")
      .select("id, product_id, audio_item_id, actor_user_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const { data: products } = productsResult;
  const { data: catalog } = catalogResult;
  for (const [lookup, result] of [["products", productsResult], ["catalog", catalogResult]] as const) {
    if (result.error) console.error("admin_business_products_lookup_failed", { lookup, code: result.error.code });
  }
  if (productsResult.error) {
    return <p role="alert">Не удалось загрузить исходные продукты. <Link href={BUSINESS_VERIFICATION_ADMIN_PATH}>Повторить загрузку</Link></p>;
  }
  const catalogOptions = ((catalog ?? []) as { id: string; title: string | null; authors: { name: string | null } | { name: string | null }[] | null }[])
    .map((p) => {
      const author = Array.isArray(p.authors) ? p.authors[0] : p.authors;
      return { id: p.id, label: `${author?.name ?? "–"} – ${p.title ?? "Без названия"}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  const catalogLabel = new Map(catalogOptions.map((o) => [o.id, o.label]));

  const productById = new Map(
    ((products ?? []) as unknown as { id: string; title: string | null; authors: ApplicantWorkspace | ApplicantWorkspace[] | null }[]).map((p) => {
      const author = Array.isArray(p.authors) ? p.authors[0] ?? null : p.authors;
      return [p.id, { title: p.title ?? "Без названия", author }];
    }),
  );
  let applicants: Awaited<ReturnType<typeof loadBusinessVerificationApplicants>>;
  try {
    applicants = await loadBusinessVerificationApplicants(cases.map((c) => ({
      declared: c.declared_rightsholder_name && c.declared_rightsholder_type && c.declared_rightsholder_is_self !== null
        ? { name: c.declared_rightsholder_name, entityType: c.declared_rightsholder_type, isSelf: c.declared_rightsholder_is_self }
        : null,
      id: c.id, owner_user_id: c.owner_user_id, sourceWorkspace: productById.get(c.product_id)?.author ?? null,
    })));
  } catch {
    return <p role="alert">Не удалось загрузить данные заявителей. <Link href={BUSINESS_VERIFICATION_ADMIN_PATH}>Повторить загрузку</Link></p>;
  }
  const canViewProfiles = snapshotHasPermission(session.access, "users.view");
  const trackById = new Map(((tracks ?? []) as { id: string; title: string | null }[]).map((t) => [t.id, t.title ?? "Трек"]));

  // Short-lived signed links with the moderator's own session (storage policy: moderators may read).
  const evidenceRows = (evidence ?? []) as { id: string; verification_id: string; kind: string; object_path: string; mime_type: string }[];
  const signed = new Map<string, string>();
  if (evidenceRows.length) {
    const { data: links } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(evidenceRows.map((e) => e.object_path), 600);
    for (const link of links ?? []) {
      if (link.path && link.signedUrl) signed.set(link.path, link.signedUrl);
    }
  }

  return (
    <section aria-labelledby="admin-business-verification-heading">
      <h2 id="admin-business-verification-heading" className="text-[21px] font-semibold">
        Бизнес: проверка правообладателей
      </h2>
      <p className="mt-2 text-sm text-[#796ba0]">
        Проверка одного примера на аккаунт. После подтверждения все треки аккаунта и всех его авторских пространств
        попадают в «АудиоЛад Бизнес» автоматически, отдельной проверки треков нет. Комментарий к подтверждению
        необязателен; отказ, запрос уточнения и приостановка требуют причины. Все решения сохраняются в журнале.
      </p>

      {params.error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-[#efc7cf] bg-[#fff8f9] p-3 text-sm text-[#b34f63]">{params.error}</p>
      ) : null}
      {params.notice ? (
        <p role="status" className="mt-4 rounded-2xl border border-[#cfe8d5] bg-[#f4fbf6] p-3 text-sm text-[#2f6b3d]">{params.notice}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {BUSINESS_VERIFICATION_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={option.key === "open" ? BUSINESS_VERIFICATION_ADMIN_PATH : `${BUSINESS_VERIFICATION_ADMIN_PATH}?status=${option.key}`}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
              filter === option.key ? "bg-[#7042c5] text-white" : "border border-[#e4d7f4] bg-white text-[#7042c5]"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {cases.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-[#e4d7f4] bg-white p-4 text-sm text-[#796ba0]">
          {filter === "open" ? "Сейчас нет заявок, ожидающих решения." : "В этом фильтре пока нет заявок."}
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {cases.map((c) => {
            const product = productById.get(c.product_id);
            const applicant = applicants.get(c.id)!;
            const isOwnCase = c.owner_user_id === session.userId;
            const canAct = canActOnOwnBusinessCase({ isOwnCase, isPlatformOwner });
            const actions = allowedBusinessModerationActions(c.status);
            const caseEvidence = evidenceRows.filter((e) => e.verification_id === c.id);
            const caseAudit = ((audit ?? []) as { id: string; verification_id: string; actor_user_id: string; action: string; reason: string; previous_status: string; next_status: string; created_at: string }[]).filter((a) => a.verification_id === c.id).slice(0, 5);
            const caseSuspensions = ((suspensions ?? []) as { id: string; product_id: string; audio_item_id: string | null; reason: string; created_at: string }[]).filter((s) => s.product_id === c.product_id);
            const status = c.status as BusinessVerificationStatus;
            return (
              <li key={c.id} id={`case-${c.id}`} data-testid="business-verification-case" className="min-w-0 break-words rounded-[22px] border border-[#e4d7f4] bg-white p-4 sm:p-5 [overflow-wrap:anywhere]">
                <BusinessCaseCollapsible
                  caseId={c.id}
                  applicantName={applicant.nameLabel}
                  statusLabel={BUSINESS_VERIFICATION_STATUS_LABEL[status] ?? c.status}
                  submittedLabel={formatMsk(c.submitted_at)}
                  workspaceCountLabel={applicant.workspaceTotal}
                  isOwnCase={isOwnCase}
                >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#f3edfb] px-3 py-1 text-xs font-semibold text-[#7042c5]">
                    {BUSINESS_VERIFICATION_STATUS_LABEL[status] ?? c.status}
                  </span>
                  {isOwnCase ? (
                    <span data-testid="business-verification-own-case" className="rounded-full bg-[#fff1e0] px-3 py-1 text-xs font-semibold text-[#9a5a00]">
                      Ваш собственный аккаунт
                    </span>
                  ) : null}
                </div>
                <section className="mt-4 min-w-0 space-y-2 text-sm">
                  <h3 className="font-semibold">Заявитель / аккаунт</h3>
                  <p>{applicant.nameLabel}</p>
                  {canViewProfiles && applicant.profileHref ? <Link className="text-[#7042c5] underline" href={applicant.profileHref}>Открыть профиль</Link> : null}
                  <p className="text-xs text-[#796ba0]">Отправлено: {formatMsk(c.submitted_at)}</p>
                </section>
                <section className="mt-4 min-w-0 space-y-2 text-sm">
                  <h3 className="font-semibold">Авторские проекты аккаунта</h3>
                  <p>{applicant.workspaceTotal}</p>
                  {applicant.workspaces.length ? <ul className="space-y-1">
                    {applicant.workspaces.map((w) => <li key={w.id}>
                      {w.slug ? <Link className="text-[#7042c5] underline" href={`/authors/${w.slug}`}>{w.name}</Link> : w.name}
                      {w.access_status ? <span className="text-[#796ba0]"> – {getAuthorAccessStatusLabel(w.access_status as AuthorAccessStatus)}</span> : null}
                    </li>)}
                  </ul> : null}
                </section>
                <section className="mt-4 min-w-0 space-y-2 text-sm">
                  <h3 className="font-semibold">Исходное пространство заявки</h3>
                  <p>{applicant.sourceLabel}</p>
                  {applicant.sourceWarning ? <p className="rounded-xl bg-[#fff8e8] p-3 text-[#9a5a00]">{applicant.sourceWarning}</p> : null}
                </section>
                <h3 className="mt-4 font-semibold">Образец трека и доказательства</h3>
                <dl className="mt-3 grid min-w-0 gap-1 text-sm sm:grid-cols-[180px_minmax(0,1fr)] [&>dd]:min-w-0">
                  <dt className="text-[#796ba0]">Продукт</dt><dd>
                    <Link href={`/admin/products/${c.product_id}/diagnostics`} className="text-[#7042c5] underline">{product?.title ?? "Название продукта недоступно"}</Link>
                    <small className="block text-xs text-[#796ba0]">{c.product_id}</small>
                  </dd>
                  <dt className="text-[#796ba0]">Трек</dt><dd>{trackById.get(c.audio_item_id) ?? c.audio_item_id}</dd>
                  <dt className="text-[#796ba0]">Сервис</dt><dd>{c.ai_service === "other" ? c.ai_service_other ?? "Другой" : c.ai_service}</dd>
                  <dt className="text-[#796ba0]">Название в сервисе</dt><dd>{c.service_track_title}</dd>
                  <dt className="text-[#796ba0]">Ссылка</dt>
                  <dd><a className="break-all text-[#7042c5] underline" href={c.service_track_url} target="_blank" rel="noopener noreferrer nofollow">{c.service_track_url}</a></dd>
                  {c.provider_details && Object.keys(c.provider_details).length ? (
                    <>
                      <dt className="text-[#796ba0]">Детали</dt>
                      <dd>{Object.entries(c.provider_details).map(([k, v]) => `${k}: ${String(v)}`).join("; ")}</dd>
                    </>
                  ) : null}
                  {c.reason ? (<><dt className="text-[#796ba0]">Последняя причина</dt><dd>{c.reason}</dd></>) : null}
                </dl>

                {caseEvidence.length ? (
                  <ul className="mt-3 flex flex-wrap gap-3 text-sm">
                    {caseEvidence.map((e) => (
                      <li key={e.id}>
                        {signed.get(e.object_path) ? (
                          <a className="text-[#7042c5] underline" href={signed.get(e.object_path)} target="_blank" rel="noopener noreferrer">
                            {EVIDENCE_LABEL[e.kind] ?? e.kind} ({e.mime_type})
                          </a>
                        ) : (
                          <span className="text-[#796ba0]">{EVIDENCE_LABEL[e.kind] ?? e.kind}: файл недоступен</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <section className="mt-4 min-w-0 space-y-2 text-sm">
                  <h3 className="font-semibold">Правообладатель, которому присваивается подтверждение</h3>
                  {applicant.proposal.name ? <p>{applicant.proposal.name} ({applicant.proposal.entityType === "organization" ? "организация" : "физлицо"})</p> : null}
                  <div className={applicant.proposal.needsCheck ? "rounded-xl bg-[#fff8e8] p-3 text-[#9a5a00]" : "text-[#796ba0]"}>
                    <p>{applicant.proposal.sourceLabel}</p>
                    {applicant.proposal.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                  <p className="text-[#796ba0]">Правообладатель – отдельный юридический субъект, отличающийся от личности заявителя в аккаунте и от его псевдонимов или авторских проектов.</p>
                </section>
                <section className="mt-4 min-w-0 space-y-2 text-sm">
                  <h3 className="font-semibold">Охват решения</h3>
                  <p>Подтверждение этого образца допускает все треки аккаунта и всех его авторских проектов в АудиоЛад Бизнес. Доказательства относятся только к этому аккаунту.</p>
                </section>

                {!canAct ? (
                  <p data-testid="business-verification-self-blocked" className="mt-4 rounded-2xl border border-[#f1d9a6] bg-[#fff8e8] p-3 text-sm text-[#6b4a00]">
                    Это ваша собственная заявка. Решение по ней принимает другой модератор: модерировать свои продукты может только владелец платформы.
                  </p>
                ) : (
                  <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2 [&>form]:min-w-0">
                    {actions.length ? (
                      <form action={moderateBusinessVerificationAction} className="space-y-2 rounded-2xl border border-[#efe6fa] p-3">
                        <input type="hidden" name="verificationId" value={c.id} />
                        <input type="hidden" name="filter" value={filter} />
                        <BusinessDecisionFields
                          key={`${c.id}:${actions.join(",")}:${rightsholderProposalKey(applicant.proposal)}`}
                          caseId={c.id}
                          actions={actions.map((a) => ({ value: a, label: BUSINESS_MODERATION_ACTION_LABEL[a] }))}
                          rightsholders={(rightsholders ?? []) as { id: string; display_name: string; entity_type: string }[]}
                          proposal={{ name: applicant.proposal.name, entityType: applicant.proposal.entityType, selection: applicant.proposal.selection, sourceLabel: applicant.proposal.sourceLabel }}
                          applicantName={applicant.fullName}
                          workspaceNames={applicant.workspaces.map((w) => w.name)}
                        />
                        <button type="submit" className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">Сохранить решение</button>
                      </form>
                    ) : null}
                    <form action={suspendBusinessProductAction} className="space-y-2 rounded-2xl border border-[#efe6fa] p-3">
                      <input type="hidden" name="verificationId" value={c.id} />
                      <input type="hidden" name="productId" value={c.product_id} />
                      <input type="hidden" name="filter" value={filter} />
                      <label className="block text-sm font-semibold" htmlFor={`suspend-${c.id}`}>Приостановить в Бизнесе</label>
                      <select id={`suspend-${c.id}`} name="audioItemId" className="w-full rounded-xl border border-[#e4d7f4] p-2 text-sm" defaultValue="">
                        <option value="">Весь продукт</option>
                        <option value={c.audio_item_id}>Только трек «{trackById.get(c.audio_item_id) ?? "трек примера"}»</option>
                      </select>
                      <textarea name="reason" required maxLength={2000} rows={2} placeholder="Причина (обязательно)" className="w-full rounded-xl border border-[#e4d7f4] p-2 text-sm" />
                      <button type="submit" className="rounded-full border border-[#b34f63] px-4 py-2 text-sm font-semibold text-[#b34f63]">Приостановить</button>
                    </form>
                  </div>
                )}

                {caseSuspensions.length ? (
                  <p className="mt-3 text-xs text-[#b34f63]">
                    Приостановок по продукту: {caseSuspensions.length} (последняя {formatMsk(caseSuspensions[0].created_at)}: {caseSuspensions[0].reason})
                  </p>
                ) : null}
                {caseAudit.length ? (
                  <details className="mt-3 text-xs text-[#796ba0]">
                    <summary>Журнал решений ({caseAudit.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {caseAudit.map((a) => (
                        <li key={a.id}>
                          {formatMsk(a.created_at)} – {BUSINESS_MODERATION_ACTION_LABEL[a.action as keyof typeof BUSINESS_MODERATION_ACTION_LABEL] ?? a.action}
                          {a.actor_user_id === c.owner_user_id ? " (сам владелец аккаунта)" : ""}: {a.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                </BusinessCaseCollapsible>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="admin-business-suspend-heading" className="mt-8 rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <h3 id="admin-business-suspend-heading" className="text-[17px] font-semibold">Приостановить продукт в АудиоЛад Бизнес</h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Приостановка запрещает подключать продукт (или один трек) к Бизнесу. Запись необратима и хранится в журнале.
          Свои продукты может приостановить только владелец платформы.
        </p>
        <form action={suspendBusinessProductAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="filter" value={filter} />
          <label className="text-sm sm:col-span-2">
            <span className="block font-semibold">Продукт</span>
            <select name="productId" required className="mt-1 w-full rounded-xl border border-[#e4d7f4] p-2 text-sm" defaultValue="">
              <option value="" disabled>Выберите продукт</option>
              {catalogOptions.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block font-semibold">ID трека (необязательно)</span>
            <input name="audioItemId" pattern="[0-9a-fA-F-]{36}" placeholder="Пусто – весь продукт" className="mt-1 w-full rounded-xl border border-[#e4d7f4] p-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block font-semibold">Причина (обязательно)</span>
            <input name="reason" required maxLength={2000} className="mt-1 w-full rounded-xl border border-[#e4d7f4] p-2 text-sm" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-full border border-[#b34f63] px-4 py-2 text-sm font-semibold text-[#b34f63]">Приостановить</button>
          </div>
        </form>
        {(recentSuspensions ?? []).length ? (
          <ul data-testid="business-recent-suspensions" className="mt-4 space-y-1 text-xs text-[#796ba0]">
            {((recentSuspensions ?? []) as { id: string; product_id: string; audio_item_id: string | null; actor_user_id: string; reason: string; created_at: string }[]).map((s) => (
              <li key={s.id}>
                {formatMsk(s.created_at)} – {catalogLabel.get(s.product_id) ?? productById.get(s.product_id)?.title ?? "Название продукта недоступно"}
                {s.audio_item_id ? " (один трек)" : ""}{s.actor_user_id === session.userId ? " – вы" : ""}: {s.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
