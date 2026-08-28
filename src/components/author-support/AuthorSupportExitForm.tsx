import { stopAuthorSupportMode } from "@/lib/author-support/actions";

export const AUTHOR_SUPPORT_EXIT_LABEL = "Выйти из режима поддержки";

type AuthorSupportExitFormProps = {
  variant?: "light" | "dark";
};

export function AuthorSupportExitForm({
  variant = "light",
}: AuthorSupportExitFormProps) {
  const className =
    variant === "dark"
      ? "inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
      : "inline-flex min-h-10 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white";

  return (
    <form action={stopAuthorSupportMode}>
      <button type="submit" className={className}>
        {AUTHOR_SUPPORT_EXIT_LABEL}
      </button>
    </form>
  );
}
