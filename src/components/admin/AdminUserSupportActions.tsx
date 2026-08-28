import { startAuthorSupportMode } from "@/lib/author-support/actions";

type AdminUserSupportActionsProps = {
  targetUserId: string;
  targetAuthorId: string;
};

export function AdminUserSupportActions({
  targetUserId,
  targetAuthorId,
}: AdminUserSupportActionsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <form action={startAuthorSupportMode}>
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <input type="hidden" name="targetAuthorId" value={targetAuthorId} />
        <input type="hidden" name="destination" value="cabinet" />
        <button
          type="submit"
          className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
        >
          Войти в кабинет автора
        </button>
      </form>
      <form action={startAuthorSupportMode}>
        <input type="hidden" name="targetUserId" value={targetUserId} />
        <input type="hidden" name="targetAuthorId" value={targetAuthorId} />
        <input type="hidden" name="destination" value="studio" />
        <button
          type="submit"
          className="inline-flex min-h-10 items-center rounded-full border border-[#d7c6f2] bg-white px-4 text-sm font-semibold text-[#7042c5]"
        >
          Открыть Студию
        </button>
      </form>
    </div>
  );
}
