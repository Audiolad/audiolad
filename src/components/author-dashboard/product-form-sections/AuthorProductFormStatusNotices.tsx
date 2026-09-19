type AuthorProductFormStatusNoticesProps = {
  contentLockedAfterSale: boolean;
  message: string | null;
  error: string | null;
  isSubmitted: boolean;
  needsChanges: boolean;
  moderationReviewComment: string | null;
};

export default function AuthorProductFormStatusNotices({
  contentLockedAfterSale,
  message,
  error,
  isSubmitted,
  needsChanges,
  moderationReviewComment,
}: AuthorProductFormStatusNoticesProps) {
  return (
    <>
      {contentLockedAfterSale ? (
        <p className="rounded-[18px] border border-[#e4d7f4] bg-[#f8f4ff] px-4 py-3 text-sm text-[#5f5484]">
          Этот продукт уже приобретён слушателями. Его можно снять с публикации,
          но удалить продукт или аудиоматериалы нельзя.
        </p>
      ) : null}

      {message ? (
        <p className="rounded-[18px] border border-[#d7ebdf] bg-[#f3fbf6] px-4 py-3 text-sm text-[#2f7a55]">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}

      {isSubmitted ? (
        <div className="rounded-[18px] border border-[#c9d7f5] bg-[#f3f6ff] px-4 py-3 text-sm text-[#35518f]">
          <p className="font-semibold">На модерации</p>
          <p className="mt-1 leading-5">
            Продукт отправлен на модерацию. Пока проверка не завершена, основные
            данные и аудиоматериалы нельзя изменять.
          </p>
        </div>
      ) : null}

      {needsChanges ? (
        <div className="rounded-[18px] border border-[#f0d7a8] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a16]">
          <p className="font-semibold">Требуются изменения</p>
          {moderationReviewComment ? (
            <p className="mt-2 whitespace-pre-wrap leading-5">
              {moderationReviewComment}
            </p>
          ) : null}
          <p className="mt-2 leading-5">
            Внесите необходимые изменения и повторно отправьте продукт на
            модерацию.
          </p>
        </div>
      ) : null}
    </>
  );
}
