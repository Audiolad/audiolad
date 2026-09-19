"use client";

import Link from "next/link";

import { canWithdrawPracticeFromModeration } from "@/lib/author-products/moderation";

type AuthorProductFormActionsProps = {
  mode: "create" | "edit";
  busy: boolean;
  publishing: boolean;
  canEditPublicFields: boolean;
  canMutateContent: boolean;
  canBypassProductModeration: boolean;
  isPublished: boolean;
  isUnpublished: boolean;
  isDraft: boolean;
  isSubmitted: boolean;
  needsChanges: boolean;
  publishedAt: string | null;
  moderationStatus: string;
  practiceId: string | null;
  publicPath: string;
  publishPreviewPath: string;
  deleteLockedAfterPaidPurchase: boolean;
  error: string | null;
  onSaveDraft: () => void;
  onUnpublish: () => void;
  onStartEditing: () => void;
  onOpenPublishPreview: () => void;
  onPublish: () => void;
  onSubmitForModeration: () => void;
  onWithdrawFromModeration: () => void;
  onDeleteProduct: () => void;
};

export default function AuthorProductFormActions({
  mode,
  busy,
  publishing,
  canEditPublicFields,
  canMutateContent,
  canBypassProductModeration,
  isPublished,
  isUnpublished,
  isDraft,
  isSubmitted,
  needsChanges,
  publishedAt,
  moderationStatus,
  practiceId,
  publicPath,
  publishPreviewPath,
  deleteLockedAfterPaidPurchase,
  error,
  onSaveDraft,
  onUnpublish,
  onStartEditing,
  onOpenPublishPreview,
  onPublish,
  onSubmitForModeration,
  onWithdrawFromModeration,
  onDeleteProduct,
}: AuthorProductFormActionsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        disabled={busy || !canEditPublicFields}
        onClick={() => void onSaveDraft()}
        className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
      >
        {isPublished || isUnpublished || publishedAt
          ? "Сохранить изменения"
          : "Сохранить черновик"}
      </button>

      {isPublished ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onUnpublish()}
            className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
          >
            Снять с публикации
          </button>
          <button
            type="button"
            disabled={busy || !canMutateContent}
            onClick={() => void onStartEditing()}
            className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
          >
            Снять и редактировать
          </button>
        </>
      ) : null}

      {isUnpublished ? (
        <>
          <button
            type="button"
            disabled={busy || !canMutateContent}
            onClick={() => void onStartEditing()}
            className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
          >
            Перейти к редактированию
          </button>
          <button
            type="button"
            disabled={busy || !canMutateContent || !publishPreviewPath}
            onClick={() => void onOpenPublishPreview()}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Предпросмотр
          </button>
          <button
            type="button"
            disabled={busy || publishing || !canMutateContent}
            onClick={() => void onPublish()}
            className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
          >
            {publishing ? "Публикуем…" : "Опубликовать снова"}
          </button>
        </>
      ) : null}

      {isDraft && canBypassProductModeration ? (
        <>
          <button
            type="button"
            disabled={busy || publishing || !canMutateContent}
            onClick={() => void onOpenPublishPreview()}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Предпросмотр
          </button>
          <button
            type="button"
            disabled={busy || publishing || !canMutateContent}
            onClick={() => void onPublish()}
            className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
          >
            {publishing ? "Публикуем…" : "Опубликовать"}
          </button>
        </>
      ) : null}

      {isDraft && !canBypassProductModeration ? (
        <>
          <button
            type="button"
            disabled={busy || !canEditPublicFields}
            onClick={() => void onOpenPublishPreview()}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Предпросмотр
          </button>
          <button
            type="button"
            disabled={busy || !canEditPublicFields}
            onClick={() => void onSubmitForModeration()}
            className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
          >
            Отправить на модерацию
          </button>
        </>
      ) : null}

      {needsChanges ? (
        <button
          type="button"
          disabled={busy || !canEditPublicFields}
          onClick={() => void onSubmitForModeration()}
          className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
        >
          Повторно отправить на модерацию
        </button>
      ) : null}

      {error &&
      ((isDraft && !canBypassProductModeration) || needsChanges) ? (
        <p
          data-submit-issue
          className="w-full rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]"
        >
          {error}
        </p>
      ) : null}

      {isSubmitted &&
      canWithdrawPracticeFromModeration({
        moderationStatus,
      }) ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onWithdrawFromModeration()}
          className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
        >
          Отозвать с модерации
        </button>
      ) : null}

      {isPublished && publicPath ? (
        <Link
          href={publicPath}
          className="rounded-[22px] border border-[#c6afe6] px-5 py-4 text-center font-semibold text-[#7042c5]"
        >
          Открыть публичную карточку
        </Link>
      ) : null}

      {mode === "edit" && practiceId && !deleteLockedAfterPaidPurchase ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDeleteProduct()}
          className="rounded-[22px] border border-[#f2c7c7] px-5 py-4 font-semibold text-[#9b3d3d] disabled:opacity-60"
        >
          Удалить продукт
        </button>
      ) : null}

      {mode === "edit" && practiceId && deleteLockedAfterPaidPurchase ? (
        <p className="w-full text-sm text-[#9b3d3d]">
          Удалить этот продукт нельзя, потому что его уже приобрели
          пользователи. Вы можете снять продукт с публикации – новые покупки
          прекратятся, а прежние покупатели сохранят доступ.
        </p>
      ) : null}
    </div>
  );
}
