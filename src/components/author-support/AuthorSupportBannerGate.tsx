import { peekAuthorExecutionContext } from "@/lib/author-support/context";
import { readAuthorSupportCookie } from "@/lib/author-support/session";

import { AuthorSupportBanner } from "./AuthorSupportBanner";
import { AuthorSupportModeProvider } from "./AuthorSupportModeProvider";

export async function AuthorSupportBannerGate({
  children,
  variant = "light",
}: {
  children: React.ReactNode;
  variant?: "light" | "dark";
}) {
  const [execution, supportCookie] = await Promise.all([
    peekAuthorExecutionContext(),
    readAuthorSupportCookie(),
  ]);
  const active = execution?.isSupportMode === true || Boolean(supportCookie);

  return (
    <AuthorSupportModeProvider active={active}>
      {active ? (
        <AuthorSupportBanner
          actingDisplayName={execution?.actingDisplayName ?? "Пользователь"}
          actingAuthorName={execution?.actingAuthorName ?? "Автор"}
          variant={variant}
        />
      ) : null}
      {children}
    </AuthorSupportModeProvider>
  );
}
