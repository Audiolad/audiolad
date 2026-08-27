/**
 * Read-only TypeScript mirror of public.assert_practice_moderation_ready
 * (latest: supabase/migrations/20260805193000_audio_post_optional_description.sql).
 *
 * Used by admin support diagnostics so a product is never reported READY
 * when the live submit RPC would fail existing DB validation.
 * This is not a third rule set and does not replace evaluatePublishReadiness.
 */

import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import {
  AUDIO_POST_KIND_LABEL,
  MUSIC_KIND_LABEL,
  normalizeProductKind,
  PRODUCT_KIND,
} from "@/lib/author-products/product-kind";
import { LEGACY_OTHER_FORMAT } from "@/lib/author-products/format";
import type { AudioItemRow, PracticeRow } from "@/lib/author-products/types";

export const PRACTICE_SLUG_DB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type DatabaseModerationReadyCheck = {
  code: string;
  label: string;
  ok: boolean;
  message: string | null;
};

export type DatabaseModerationReadyResult = {
  ok: boolean;
  checks: DatabaseModerationReadyCheck[];
  firstFailure: { code: string; message: string } | null;
};

export type EvaluateDatabaseModerationReadyInput = {
  practice: PracticeRow;
  audioItems: AudioItemRow[];
  accessStatus: AuthorAccessStatus | string | null | undefined;
  activeTopicCount: number;
};

function check(
  code: string,
  label: string,
  failure: string | null,
): DatabaseModerationReadyCheck {
  return {
    code,
    label,
    ok: !failure,
    message: failure,
  };
}

function summarize(
  checks: DatabaseModerationReadyCheck[],
): DatabaseModerationReadyResult {
  const firstFailed = checks.find((item) => !item.ok);

  return {
    ok: !firstFailed,
    checks,
    firstFailure:
      firstFailed && firstFailed.message
        ? { code: firstFailed.code, message: firstFailed.message }
        : null,
  };
}

/**
 * Known DB-only (or DB-stricter) conditions that evaluatePublishReadiness
 * currently does not enforce the same way.
 */
export function listKnownTsSqlReadinessDivergences(): readonly string[] {
  return [
    "SQL требует slug вида ^[a-z0-9]+(?:-[a-z0-9]+)*$; TS проверяет только непустое значение.",
    "SQL требует currency = RUB; TS не проверяет валюту.",
    "SQL всегда требует хотя бы один audio_items ряд (missing_audio). TS пропускает плоское аудио для курса с блоками (shouldSkipFlatAudioPublishRequirement).",
    "SQL не проверяет содержание курса (уроки/блоки). TS требует course_content для unpublished course.",
    "SQL не проверяет диапазон цены 49–100 000 ₽ и позиции треков.",
  ];
}

export function evaluateDatabaseModerationReady(
  input: EvaluateDatabaseModerationReadyInput,
): DatabaseModerationReadyResult {
  const practice = input.practice;
  const productKind = normalizeProductKind(practice.product_kind);
  const audioCount = input.audioItems.length;
  const format = practice.format?.trim() ?? "";

  const checks: DatabaseModerationReadyCheck[] = [
    check(
      "practice_deleted",
      "Продукт не удалён",
      practice.deleted_at
        ? "Удалённый продукт нельзя отправить на модерацию."
        : null,
    ),
    check(
      "author_content_mutations_blocked",
      "Авторский доступ разрешает изменения",
      !authorAccessAllowsContentMutations(input.accessStatus)
        ? "Изменение и отправка продуктов недоступны при текущем статусе авторского доступа."
        : null,
    ),
    check(
      "missing_title",
      "Название",
      !practice.title?.trim() ? "Укажите название аудиопродукта." : null,
    ),
    check(
      "missing_description",
      "Описание",
      productKind !== PRODUCT_KIND.AUDIO_POST && !practice.description?.trim()
        ? "Добавьте описание аудиопродукта."
        : null,
    ),
    check(
      "slug_required",
      "Адрес",
      !practice.slug?.trim() ? "Укажите адрес аудиопродукта." : null,
    ),
    check(
      "invalid_slug",
      "Формат адреса (SQL)",
      practice.slug?.trim() && !PRACTICE_SLUG_DB_PATTERN.test(practice.slug.trim())
        ? "Адрес должен состоять из строчных латинских букв, цифр и дефисов."
        : null,
    ),
    check(
      "missing_cover",
      "Обложка",
      !practice.cover_url?.trim() ? "Загрузите обложку аудиопродукта." : null,
    ),
    check(
      "invalid_currency",
      "Валюта",
      (practice.currency ?? "") !== "RUB"
        ? "Валюта продукта должна быть RUB."
        : null,
    ),
    check(
      "invalid_product_kind",
      "Тип продукта",
      productKind !== PRODUCT_KIND.PRACTICE &&
        productKind !== PRODUCT_KIND.MUSIC &&
        productKind !== PRODUCT_KIND.AUDIO_POST
        ? "Недопустимый тип продукта."
        : null,
    ),
    check(
      "invalid_format",
      "Формат (SQL)",
      !format ||
        (productKind === PRODUCT_KIND.PRACTICE && format === LEGACY_OTHER_FORMAT) ||
        (productKind === PRODUCT_KIND.MUSIC && format !== MUSIC_KIND_LABEL) ||
        (productKind === PRODUCT_KIND.AUDIO_POST && format !== AUDIO_POST_KIND_LABEL)
        ? "Формат не проходит проверку базы данных."
        : null,
    ),
    check(
      "music_permission_required",
      "Условия использования музыки",
      productKind === PRODUCT_KIND.MUSIC &&
        practice.music_usage_permission !== "listen_only" &&
        practice.music_usage_permission !== "platform_reuse_allowed"
        ? "Для музыки нужно выбрать условие использования."
        : null,
    ),
    check(
      "music_permission_not_allowed",
      "Музыкальное разрешение только для музыки",
      productKind !== PRODUCT_KIND.MUSIC &&
        practice.music_usage_permission != null
        ? "Условия использования музыки нельзя задавать для этого типа продукта."
        : null,
    ),
    check(
      "audio_post_must_be_free",
      "Аудиопост бесплатный",
      productKind === PRODUCT_KIND.AUDIO_POST &&
        (!practice.is_free || practice.price !== 0)
        ? "Аудиопост может быть только бесплатным."
        : null,
    ),
    check(
      "invalid_price",
      "Цена",
      (practice.is_free && practice.price !== 0) ||
        (!practice.is_free && practice.price <= 0)
        ? "Цена не согласована с признаком бесплатности."
        : null,
    ),
    check(
      "commercial_eligibility_required",
      "Коммерческий доступ для платного продукта",
      !practice.is_free && !authorAccessAllowsPaidProducts(input.accessStatus)
        ? "Платный продукт нельзя отправить: авторский доступ не разрешает продажи."
        : null,
    ),
    check(
      "topic_min_required",
      "Темы",
      input.activeTopicCount < 1
        ? "Выберите хотя бы одну тему перед отправкой на модерацию."
        : null,
    ),
    check(
      "missing_audio",
      "Аудиозаписи (SQL)",
      audioCount === 0 ? "База требует хотя бы одну аудиозапись." : null,
    ),
    check(
      "audio_post_requires_single_audio",
      "Одна аудиозапись для аудиопоста",
      productKind === PRODUCT_KIND.AUDIO_POST && audioCount !== 1
        ? "Для аудиопоста требуется ровно одна аудиозапись."
        : null,
    ),
    check(
      "incomplete_audio",
      "Полнота аудиозаписей",
      input.audioItems.some(
        (item) =>
          !item.title?.trim() ||
          !item.audio_path?.trim() ||
          !item.duration_seconds ||
          item.duration_seconds <= 0,
      )
        ? "У одной или нескольких аудиозаписей нет названия, файла или длительности."
        : null,
    ),
  ];

  if (productKind === PRODUCT_KIND.AUDIO_POST && practice.promo_enabled) {
    checks.push(
      check(
        "promo_title_required",
        "Заголовок рекомендации",
        !practice.promo_title?.trim() ? "Укажите заголовок рекомендации." : null,
      ),
      check(
        "promo_text_required",
        "Текст рекомендации",
        !practice.promo_text?.trim() ? "Укажите текст рекомендации." : null,
      ),
      check(
        "promo_button_text_required",
        "Текст кнопки рекомендации",
        !practice.promo_button_text?.trim()
          ? "Укажите текст кнопки рекомендации."
          : null,
      ),
      check(
        "promo_url_required",
        "Ссылка рекомендации",
        !practice.promo_url?.trim() ? "Укажите ссылку рекомендации." : null,
      ),
    );
  }

  return summarize(checks);
}

export function isReadyForModerationSubmit(input: {
  tsReady: boolean;
  dbReady: boolean;
}): boolean {
  return input.tsReady && input.dbReady;
}
