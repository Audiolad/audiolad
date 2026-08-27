import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPermission } from "@/lib/admin/guard";
import { getAdminProductDiagnostics } from "@/lib/admin/product-diagnostics";
import { isAdminExactUuid } from "@/lib/admin/users-search";
import { listKnownTsSqlReadinessDivergences } from "@/lib/author-products/database-moderation-ready";

export const dynamic = "force-dynamic";

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

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 border-b border-[#f3edf9] py-3 last:border-b-0 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-sm text-[#9485b4]">{label}</dt>
      <dd className="text-sm text-[#25135c] break-all whitespace-pre-wrap">
        {value}
      </dd>
    </div>
  );
}

export default async function AdminProductDiagnosticsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requireAdminPermission("users.view");
  const { productId } = await params;

  if (!isAdminExactUuid(productId)) {
    notFound();
  }

  let diagnostics;

  try {
    diagnostics = await getAdminProductDiagnostics(productId);
  } catch (error) {
    console.error("admin_product_diagnostics_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить диагностику продукта. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!diagnostics) {
    notFound();
  }

  const { practice, author, submitEligibility } = diagnostics;
  const ownerLink = diagnostics.owners[0]
    ? `/admin/users/${diagnostics.owners[0].userId}`
    : "/admin/users";

  return (
    <section aria-labelledby="admin-product-diagnostics-heading">
      <div className="mb-5">
        <Link href={ownerLink} className="text-sm font-medium text-[#7042c5]">
          ← К карточке пользователя
        </Link>
        <h2
          id="admin-product-diagnostics-heading"
          className="mt-2 text-[21px] font-semibold"
        >
          Диагностика продукта
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Только чтение. Без входа под автором, без правок и без действий
          модерации.
        </p>
      </div>

      <div
        className={`rounded-[22px] border p-5 ${
          diagnostics.canSubmitToModeration
            ? "border-[#cfe8d6] bg-[#f4fbf6]"
            : "border-[#efc7cf] bg-[#fff8f9]"
        }`}
      >
        <p className="text-sm font-semibold text-[#25135c]">
          Можно отправлять на модерацию:{" "}
          {diagnostics.canSubmitToModeration ? "ДА" : "НЕТ"}
        </p>
        <p className="mt-1 text-sm text-[#796ba0]">
          Итог = evaluatePublishReadiness и проверки
          assert_practice_moderation_ready. Ложное READY запрещено.
        </p>
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Продукт</h3>
        <dl className="mt-2">
          <DetailRow label="Product ID" value={practice.id} />
          <DetailRow label="Автор" value={`${author.name} (${author.id})`} />
          <DetailRow label="Авторский slug" value={author.slug || "—"} />
          <DetailRow label="Название" value={practice.title || "—"} />
          <DetailRow label="Slug" value={practice.slug || "—"} />
          <DetailRow label="Описание" value={practice.description || "—"} />
          <DetailRow label="Класс" value={diagnostics.publicationClassLabel ?? "—"} />
          <DetailRow label="Тип / формат" value={`${diagnostics.productKindLabel} · ${practice.format || "—"}`} />
          <DetailRow label="Статус" value={practice.status} />
          <DetailRow label="Модерация" value={practice.moderation_status} />
          <DetailRow
            label="Авторский доступ"
            value={`${author.accessStatusLabel} (${author.accessStatus})`}
          />
          <DetailRow
            label="Обход модерации"
            value={author.canBypassProductModeration ? "Да" : "Нет"}
          />
          <DetailRow
            label="Бесплатный / платный"
            value={practice.is_free ? "Бесплатный" : "Платный"}
          />
          <DetailRow label="Цена" value={`${practice.price} ${practice.currency}`} />
          <DetailRow
            label="Обложка"
            value={practice.cover_url?.trim() ? "Есть" : "Нет"}
          />
          <DetailRow
            label="Темы"
            value={
              diagnostics.topicTitles.length > 0
                ? diagnostics.topicTitles.join(", ")
                : "Нет"
            }
          />
          <DetailRow
            label="Музыкальное разрешение"
            value={diagnostics.musicUsageLabel ?? "—"}
          />
          <DetailRow
            label="Рекомендация"
            value={
              practice.promo_enabled
                ? [practice.promo_title, practice.promo_text, practice.promo_url]
                    .filter(Boolean)
                    .join(" · ") || "Включена без полей"
                : "Выключена"
            }
          />
          <DetailRow label="Обновлён" value={formatDateTime(practice.updated_at)} />
        </dl>
      </div>

      {diagnostics.owners.length > 0 ? (
        <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
          <h3 className="text-base font-semibold text-[#25135c]">
            Участники пространства
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {diagnostics.owners.map((owner) => (
              <li key={owner.userId}>
                <Link
                  href={`/admin/users/${owner.userId}`}
                  className="font-medium text-[#7042c5]"
                >
                  {owner.displayName}
                </Link>
                <span className="text-[#796ba0]">
                  {" "}
                  · {owner.membershipRole}
                  {owner.email ? ` · ${owner.email}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Треки</h3>
        {diagnostics.tracks.length === 0 ? (
          <p className="mt-3 text-sm text-[#796ba0]">Нет audio_items.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#eee6f7] text-[#796ba0]">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Название</th>
                  <th className="px-3 py-2 font-medium">Файл</th>
                  <th className="px-3 py-2 font-medium">Длительность</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.tracks.map((track) => (
                  <tr key={track.id} className="border-b border-[#f3edf9]">
                    <td className="px-3 py-3 text-[#796ba0]">{track.position}</td>
                    <td className="px-3 py-3 text-[#25135c]">{track.title}</td>
                    <td className="px-3 py-3 text-[#796ba0]">
                      {track.hasAudioFile ? "Есть" : "Нет"}
                    </td>
                    <td className="px-3 py-3 text-[#796ba0]">
                      {formatDuration(track.durationSeconds)}
                    </td>
                    <td className="px-3 py-3 text-[#796ba0]">{track.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {diagnostics.course ? (
        <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
          <h3 className="text-base font-semibold text-[#25135c]">
            Содержание курса
          </h3>
          <p className="mt-1 text-sm text-[#796ba0]">
            Уроков: {diagnostics.course.lessonCount}. Блоков:{" "}
            {diagnostics.course.blockCount}.
          </p>
          {diagnostics.course.lessons.length === 0 ? (
            <p className="mt-3 text-sm text-[#796ba0]">Уроков нет.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {diagnostics.course.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <p className="font-medium text-[#25135c]">
                    {lesson.position + 1}. {lesson.title}
                  </p>
                  <p className="text-[#796ba0]">
                    {lesson.blocks.length === 0
                      ? "Блоков нет"
                      : lesson.blocks
                          .map(
                            (block) =>
                              `${block.type}${block.hasAsset ? "" : " без файла"}`,
                          )
                          .join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">
          Готовность к отправке на модерацию
        </h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Источник: evaluatePublishReadiness.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {diagnostics.tsReadiness.requirements.map((requirement) => (
            <li key={requirement.key}>
              {requirement.ok ? "✅" : "❌"} {requirement.label}
              {!requirement.ok && requirement.message
                ? ` — ${requirement.message}`
                : ""}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">
          Database submission checks
        </h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Зеркало текущей функции assert_practice_moderation_ready. База не
          менялась.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {diagnostics.dbReadiness.checks
            .filter((check) => !check.ok)
            .map((check) => (
              <li key={check.code}>
                ❌ {check.label}
                {check.message ? ` — ${check.message}` : ""}
              </li>
            ))}
        </ul>
        {diagnostics.dbReadiness.ok ? (
          <p className="mt-3 text-sm text-[#3d8d65]">
            Проверки базы для этого продукта проходят.
          </p>
        ) : null}
        <details className="mt-3 text-sm text-[#796ba0]">
          <summary>Известное расхождение TS и SQL</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {listKnownTsSqlReadinessDivergences().map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">
          UI / доступность кнопки отправки
        </h3>
        <dl className="mt-2">
          <DetailRow
            label="Видимый статус"
            value={submitEligibility.visibleStatusLabel}
          />
          <DetailRow label="Действие" value={submitEligibility.actionLabel} />
          <DetailRow
            label="Состояние"
            value={
              submitEligibility.action === "hidden"
                ? "hidden"
                : submitEligibility.enabled
                  ? submitEligibility.action
                  : "disabled"
            }
          />
          <DetailRow
            label="canEditPublicFields"
            value={submitEligibility.canEditPublicFields ? "true" : "false"}
          />
          <DetailRow
            label="can_bypass_product_moderation"
            value={
              submitEligibility.canBypassProductModeration ? "true" : "false"
            }
          />
          <DetailRow label="Причина" value={submitEligibility.reason} />
        </dl>
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">
          Слои ошибок этого продукта
        </h3>
        {diagnostics.layeredIssues.length === 0 ? (
          <p className="mt-3 text-sm text-[#3d8d65]">
            Для текущего состояния блокирующих ошибок нет.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {diagnostics.layeredIssues.map((issue) => (
              <li key={`${issue.layer}-${issue.code}`}>
                <span className="font-medium text-[#25135c]">
                  {issue.layer === "client"
                    ? "Клиент / форма"
                    : issue.layer === "server"
                      ? "Серверная готовность"
                      : "База / RPC"}
                  :
                </span>{" "}
                <span className="text-[#796ba0]">
                  {issue.code} — {issue.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
