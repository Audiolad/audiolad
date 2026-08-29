"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  ADMIN_PRODUCT_MODERATION_ACTION_INITIAL_STATE,
  type AdminProductModerationActionState,
} from "@/app/(platform)/admin/product-moderation/action-state";
import {
  approveAndPublishProductAction,
  requestProductChangesAction,
} from "@/app/(platform)/admin/product-moderation/actions";
import { ADMIN_PRODUCT_MODERATION_CHECKLIST } from "@/lib/admin/product-moderation-checklist";
import type { AdminProductModerationDetail } from "@/lib/admin/product-moderation-queries";
import {
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
} from "@/lib/author-products/moderation";
import { getProductKindLabel } from "@/lib/author-products/product-kind";
import { AUTHOR_DESCRIPTION_LABEL } from "@/lib/products/product-copy";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { getProductPriceLabel } from "@/lib/products/price-format";

type ProductModerationReviewFormProps = {
  product: AdminProductModerationDetail;
  canManage: boolean;
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

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function actionLabel(action: string): string {
  switch (action) {
    case "submitted":
      return "Отправлен на модерацию";
    case "resubmitted":
      return "Повторно отправлен";
    case "submission_withdrawn":
      return "Отозван с модерации";
    case "changes_requested":
      return "Требуются изменения";
    case "approved_and_published":
      return "Одобрен и опубликован";
    case "migration_backfill":
      return "Системный backfill";
    case "unpublished":
      return "Снят с публикации";
    case "republished":
      return "Повторно опубликован";
    case "edit_mode_started":
      return "Начато редактирование";
    case "deleted":
      return "Удалён";
    default:
      return action;
  }
}

function ActionFeedback({ state }: { state: AdminProductModerationActionState }) {
  if (state.ok && state.message) {
    return (
      <div className="rounded-[18px] border border-[#d7ebdf] bg-[#f3fbf6] px-4 py-3 text-sm text-[#2f7a55]">
        <p>{state.message}</p>
        {state.publicPath ? (
          <p className="mt-2">
            <Link href={state.publicPath} className="font-semibold underline">
              Открыть публичную страницу
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  if (!state.ok && state.error) {
    return (
      <div className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
        {state.error}
      </div>
    );
  }

  return null;
}

function SubmitButton({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Сохраняем…" : label}
    </button>
  );
}

function AdminAudioPlayer({
  practiceId,
  audioId,
  title,
}: {
  practiceId: string;
  audioId: string;
  title: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    if (src || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/product-moderation/${practiceId}/audio/${audioId}/preview`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "preview_failed");
      }

      setSrc(payload.url);
    } catch {
      setError("Не удалось получить защищённую ссылку для прослушивания.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-[#eee6f7] bg-[#fbf8ff] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#25135c]">{title}</p>
        {!src ? (
          <button
            type="button"
            onClick={() => void loadPreview()}
            disabled={loading}
            className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
          >
            {loading ? "Загрузка…" : "Слушать"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-[#9b3d3d]">{error}</p> : null}
      {src ? (
        <audio
          className="mt-3 w-full"
          controls
          preload="none"
          src={src}
          controlsList="nodownload"
        >
          Ваш браузер не поддерживает аудиоплеер.
        </audio>
      ) : null}
    </div>
  );
}

export default function ProductModerationReviewForm({
  product,
  canManage,
}: ProductModerationReviewFormProps) {
  const router = useRouter();
  const [approveState, approveAction] = useActionState(
    approveAndPublishProductAction,
    ADMIN_PRODUCT_MODERATION_ACTION_INITIAL_STATE,
  );
  const [changesState, changesAction] = useActionState(
    requestProductChangesAction,
    ADMIN_PRODUCT_MODERATION_ACTION_INITIAL_STATE,
  );
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const visible = getVisibleAuthorProductStatus({
    status: product.status,
    moderationStatus: product.moderationStatus,
  });
  const isAwaitingDecision = product.moderationStatus === "submitted";
  const publicPath =
    product.authorSlug && product.slug
      ? buildPracticePublicPath(product.authorSlug, product.slug)
      : null;

  useEffect(() => {
    if (approveState.ok || changesState.ok) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    }
  }, [approveState.ok, changesState.ok, router]);

  return (
    <div className="space-y-5">
      <ActionFeedback state={approveState} />
      <ActionFeedback state={changesState} />

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-semibold text-[#25135c]">
              {product.title}
            </h3>
            {product.subtitle ? (
              <p className="mt-1 text-sm text-[#796ba0]">{product.subtitle}</p>
            ) : null}
          </div>
          <span className="rounded-full bg-[#f4eefe] px-3 py-1 text-xs font-semibold text-[#7042c5]">
            {getVisibleAuthorProductStatusLabel(visible)}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#796ba0]">Вид продукта</dt>
            <dd className="mt-1 font-medium text-[#25135c]">
              {getProductKindLabel(product.productKind)}
            </dd>
          </div>
          {product.productKind !== "audio_post" ? (
            <div>
              <dt className="text-[#796ba0]">Цена</dt>
              <dd className="mt-1 font-medium text-[#25135c]">
                {getProductPriceLabel(product.price, product.isFree)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[#796ba0]">Отправлен</dt>
            <dd className="mt-1 font-medium text-[#25135c]">
              {formatDateTime(product.moderationSubmittedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[#796ba0]">Попытка</dt>
            <dd className="mt-1 font-medium text-[#25135c]">
              {product.moderationAttempt}
              {product.moderationAttempt > 1 ? " · повторная" : " · первая"}
            </dd>
          </div>
          <div>
            <dt className="text-[#796ba0]">Создан</dt>
            <dd className="mt-1 font-medium text-[#25135c]">
              {formatDateTime(product.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[#796ba0]">Обновлён</dt>
            <dd className="mt-1 font-medium text-[#25135c]">
              {formatDateTime(product.updatedAt)}
            </dd>
          </div>
        </dl>

        {product.description ? (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-[#25135c]">{AUTHOR_DESCRIPTION_LABEL}</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5f5484]">
              {product.description}
            </p>
          </div>
        ) : null}

        {product.productKind === "audio_post" && product.promoEnabled ? (
          <div className="mt-4 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] p-4">
            <h4 className="text-sm font-semibold text-[#25135c]">
              Рекомендация после прослушивания
            </h4>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-[#796ba0]">Заголовок</dt>
                <dd className="mt-1 font-medium text-[#25135c]">
                  {product.promoTitle || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#796ba0]">Текст</dt>
                <dd className="mt-1 whitespace-pre-wrap text-[#5f5484]">
                  {product.promoText || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#796ba0]">Кнопка</dt>
                <dd className="mt-1 text-[#5f5484]">
                  {product.promoButtonText || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#796ba0]">Ссылка</dt>
                <dd className="mt-1">
                  {product.promoUrl ? (
                    <a
                      href={product.promoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#7042c5] hover:underline"
                    >
                      Открыть рекомендацию
                    </a>
                  ) : (
                    "—"
                  )}
                  {product.promoOpenInNewTab ? " · новая вкладка" : ""}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-[#25135c]">Темы</h4>
          <p className="mt-2 text-sm text-[#5f5484]">
            {product.topicTitles.length > 0
              ? product.topicTitles.join(", ")
              : "Темы не выбраны"}
          </p>
        </div>
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-[17px] font-semibold text-[#25135c]">Автор</h3>
        <p className="mt-2 text-sm text-[#5f5484]">
          {product.authorName}
          {product.authorSlug ? (
            <>
              {" · "}
              <Link
                href={`/authors/${product.authorSlug}`}
                className="font-medium text-[#7042c5] hover:underline"
              >
                /{product.authorSlug}
              </Link>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-xs text-[#796ba0]">
          Bypass модерации:{" "}
          {product.authorCanBypass ? "включён" : "выключен"}
        </p>
        {publicPath && product.status === "published" ? (
          <p className="mt-3">
            <Link
              href={publicPath}
              className="text-sm font-semibold text-[#7042c5] hover:underline"
            >
              Публичная страница продукта
            </Link>
          </p>
        ) : null}
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-[17px] font-semibold text-[#25135c]">Обложка</h3>
        {product.coverUrl ? (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.coverUrl}
              alt={`Обложка: ${product.title}`}
              className="max-h-[420px] w-full rounded-[18px] object-contain bg-[#f7f2ff]"
            />
            <a
              href={product.coverUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm font-semibold text-[#7042c5] hover:underline"
            >
              Открыть оригинал
            </a>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#9b3d3d]">Обложка не загружена.</p>
        )}
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-[17px] font-semibold text-[#25135c]">
          Аудиозаписи ({product.audioItems.length})
        </h3>
        <div className="mt-3 space-y-3">
          {product.audioItems.map((item) => (
            <div key={item.id} className="space-y-2">
              <div className="flex flex-wrap gap-3 text-xs text-[#796ba0]">
                <span>#{item.position}</span>
                <span>{formatDuration(item.durationSeconds)}</span>
                <span>
                  {item.hasAudioFile ? "файл загружен" : "файл отсутствует"}
                </span>
              </div>
              {item.hasAudioFile ? (
                <AdminAudioPlayer
                  practiceId={product.id}
                  audioId={item.id}
                  title={item.title}
                />
              ) : (
                <p className="rounded-[16px] border border-[#f2c7c7] bg-[#fff5f5] px-3 py-2 text-sm text-[#9b3d3d]">
                  {item.title}: файл не загружен
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-[17px] font-semibold text-[#25135c]">
          Чек-лист проверки
        </h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Вспомогательные отметки. В v1 не сохраняются в базе.
        </p>
        <div className="mt-4 space-y-4">
          {ADMIN_PRODUCT_MODERATION_CHECKLIST.map((section) => (
            <div key={section.id}>
              <h4 className="text-sm font-semibold text-[#25135c]">
                {section.title}
              </h4>
              <ul className="mt-2 space-y-2">
                {section.checks.map((check) => {
                  const key = `${section.id}:${check}`;
                  return (
                    <li key={key}>
                      <label className="flex items-start gap-2 text-sm text-[#5f5484]">
                        <input
                          type="checkbox"
                          checked={checked[key] === true}
                          onChange={(event) =>
                            setChecked((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                          className="mt-1"
                        />
                        <span>{check}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-[17px] font-semibold text-[#25135c]">
          История модерации
        </h3>
        <ol className="mt-4 space-y-3">
          {product.events.map((event) => (
            <li
              key={event.id}
              className={`rounded-[16px] border px-3 py-3 text-sm ${
                event.action === "migration_backfill"
                  ? "border-[#ececf2] bg-[#f7f7fa] text-[#6d6d80]"
                  : "border-[#eee6f7] bg-[#fbf8ff] text-[#5f5484]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#25135c]">
                  {actionLabel(event.action)}
                </p>
                <p className="text-xs">{formatDateTime(event.createdAt)}</p>
              </div>
              <p className="mt-1 text-xs">
                {event.actorType}
                {event.actorDisplayName ? ` · ${event.actorDisplayName}` : ""}
                {event.attempt != null ? ` · попытка ${event.attempt}` : ""}
              </p>
              <p className="mt-1 text-xs">
                {event.fromStatus ?? "—"}/{event.fromModerationStatus ?? "—"} →{" "}
                {event.toStatus ?? "—"}/{event.toModerationStatus ?? "—"}
              </p>
              {event.comment ? (
                <p className="mt-2 whitespace-pre-wrap">{event.comment}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {canManage && isAwaitingDecision ? (
        <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
          <h3 className="text-[17px] font-semibold text-[#25135c]">Решение</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <form
              action={approveAction}
              onSubmit={(event) => {
                const confirmed = window.confirm(
                  "Продукт будет сразу опубликован и станет доступен слушателям.",
                );
                if (!confirmed) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="practiceId" value={product.id} />
              <SubmitButton
                label="Одобрить и опубликовать"
                className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
              />
            </form>

            <button
              type="button"
              onClick={() => setShowChangesForm((value) => !value)}
              className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484]"
            >
              Требуются изменения
            </button>
          </div>

          {showChangesForm ? (
            <form action={changesAction} className="mt-4 space-y-3">
              <input type="hidden" name="practiceId" value={product.id} />
              <label className="block text-sm text-[#5f5484]">
                Комментарий для автора
                <textarea
                  name="reviewComment"
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={5}
                  placeholder="Опишите, что нужно исправить. Автор увидит этот комментарий в кабинете."
                  className="mt-2 w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 text-[#25135c]"
                />
              </label>
              <p className="text-xs text-[#796ba0]">
                Автор увидит этот комментарий в кабинете и сможет повторно
                отправить продукт после исправлений.
              </p>
              <SubmitButton
                label="Отправить автору"
                className="rounded-[22px] bg-[#b67a1d] px-5 py-3 font-semibold text-white disabled:opacity-60"
              />
            </form>
          ) : null}
        </section>
      ) : null}

      {canManage && !isAwaitingDecision ? (
        <div className="rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5 text-sm text-[#796ba0]">
          Сейчас продукт не ожидает решения модератора. Активные действия
          доступны только для статуса «На модерации».
        </div>
      ) : null}

      {!canManage ? (
        <div className="rounded-[22px] border border-[#eadff8] bg-white p-5 text-sm text-[#796ba0]">
          Просмотр доступен. Принятие решений для вашей роли недоступно.
        </div>
      ) : null}
    </div>
  );
}
