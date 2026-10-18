import Link from "next/link";

import {
  moderateBusinessVerificationAction,
  suspendBusinessProductAction,
} from "@/app/(platform)/admin/business-verification/actions";
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
    .select("id, owner_user_id, product_id, audio_item_id, ai_service, ai_service_other, service_track_title, service_track_url, provider_details, status, reason, submitted_at, updated_at")
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
  const [{ data: products }, { data: tracks }, { data: rightsholders }] = await Promise.all([
    productIds.length
      ? service.from("practices").select("id, title, author_id, authors(name, slug)").in("id", productIds)
      : Promise.resolve({ data: [] as never[] }),
    trackIds.length
      ? service.from("audio_items").select("id, title").in("id", trackIds)
      : Promise.resolve({ data: [] as never[] }),
    service.from("music_rightsholders").select("id, display_name, entity_type").eq("status", "active").order("display_name").limit(200),
  ]);
  const [{ data: catalog }, { data: recentSuspensions }] = await Promise.all([
    service
      .from("practices")
      .select("id, title, authors(name)")
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
  const catalogOptions = ((catalog ?? []) as { id: string; title: string | null; authors: { name: string | null } | { name: string | null }[] | null }[])
    .map((p) => {
      const author = Array.isArray(p.authors) ? p.authors[0] : p.authors;
      return { id: p.id, label: `${author?.name ?? "–"} – ${p.title ?? "Без названия"}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  const catalogLabel = new Map(catalogOptions.map((o) => [o.id, o.label]));

  const productById = new Map(
    ((products ?? []) as { id: string; title: string | null; authors: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null }[]).map((p) => {
      const author = Array.isArray(p.authors) ? p.authors[0] : p.authors;
      return [p.id, { title: p.title ?? "Без названия", authorName: author?.name ?? "–" }];
    }),
  );
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
            const isOwnCase = c.owner_user_id === session.userId;
            const canAct = canActOnOwnBusinessCase({ isOwnCase, isPlatformOwner });
            const actions = allowedBusinessModerationActions(c.status);
            const caseEvidence = evidenceRows.filter((e) => e.verification_id === c.id);
            const caseAudit = ((audit ?? []) as { id: string; verification_id: string; actor_user_id: string; action: string; reason: string; previous_status: string; next_status: string; created_at: string }[]).filter((a) => a.verification_id === c.id).slice(0, 5);
            const caseSuspensions = ((suspensions ?? []) as { id: string; product_id: string; audio_item_id: string | null; reason: string; created_at: string }[]).filter((s) => s.product_id === c.product_id);
            const status = c.status as BusinessVerificationStatus;
            return (
              <li key={c.id} id={`case-${c.id}`} data-testid="business-verification-case" className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#f3edfb] px-3 py-1 text-xs font-semibold text-[#7042c5]">
                    {BUSINESS_VERIFICATION_STATUS_LABEL[status] ?? c.status}
                  </span>
                  {isOwnCase ? (
                    <span data-testid="business-verification-own-case" className="rounded-full bg-[#fff1e0] px-3 py-1 text-xs font-semibold text-[#9a5a00]">
                      Ваш собственный аккаунт
                    </span>
                  ) : null}
                  <span className="text-xs text-[#796ba0]">Отправлено: {formatMsk(c.submitted_at)}</span>
                </div>
                <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[180px_1fr]">
                  <dt className="text-[#796ba0]">Пространство</dt><dd>{product?.authorName ?? "–"}</dd>
                  <dt className="text-[#796ba0]">Продукт</dt><dd>{product?.title ?? c.product_id}</dd>
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

                {!canAct ? (
                  <p data-testid="business-verification-self-blocked" className="mt-4 rounded-2xl border border-[#f1d9a6] bg-[#fff8e8] p-3 text-sm text-[#6b4a00]">
                    Это ваша собственная заявка. Решение по ней принимает другой модератор: модерировать свои продукты может только владелец платформы.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {actions.length ? (
                      <form action={moderateBusinessVerificationAction} className="space-y-2 rounded-2xl border border-[#efe6fa] p-3">
                        <input type="hidden" name="verificationId" value={c.id} />
                        <input type="hidden" name="filter" value={filter} />
                        <BusinessDecisionFields
                          key={`${c.id}:${actions.join(",")}`}
                          caseId={c.id}
                          actions={actions.map((a) => ({ value: a, label: BUSINESS_MODERATION_ACTION_LABEL[a] }))}
                        >
                          {actions.includes("approve") ? (
                            <fieldset className="space-y-2 text-sm">
                              <legend className="text-[#796ba0]">Правообладатель (только для «Подтвердить»)</legend>
                              <select name="rightsholder" className="w-full rounded-xl border border-[#e4d7f4] p-2" defaultValue="new">
                                <option value="new">Создать нового</option>
                                {((rightsholders ?? []) as { id: string; display_name: string; entity_type: string }[]).map((r) => (
                                  <option key={r.id} value={r.id}>{r.display_name} ({r.entity_type === "organization" ? "организация" : "физлицо"})</option>
                                ))}
                              </select>
                              <input name="newDisplayName" maxLength={200} placeholder="Имя нового правообладателя" className="w-full rounded-xl border border-[#e4d7f4] p-2" />
                              <select name="newEntityType" className="w-full rounded-xl border border-[#e4d7f4] p-2" defaultValue="person">
                                <option value="person">Физлицо</option>
                                <option value="organization">Организация</option>
                              </select>
                            </fieldset>
                          ) : null}
                        </BusinessDecisionFields>
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
                {formatMsk(s.created_at)} – {catalogLabel.get(s.product_id) ?? productById.get(s.product_id)?.title ?? s.product_id}
                {s.audio_item_id ? " (один трек)" : ""}{s.actor_user_id === session.userId ? " – вы" : ""}: {s.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
