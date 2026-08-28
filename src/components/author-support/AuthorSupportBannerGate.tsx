import { peekAuthorExecutionContext } from "@/lib/author-support/context";

import { AuthorSupportBanner } from "./AuthorSupportBanner";
import { AuthorSupportModeProvider } from "./AuthorSupportModeProvider";

export async function AuthorSupportBannerGate({
  children,
  variant = "light",
}: {
  children: React.ReactNode;
  variant?: "light" | "dark";
}) {
  const execution = await peekAuthorExecutionContext();
  const active = execution?.isSupportMode === true;

  return (
    <AuthorSupportModeProvider active={active}>
      {active ? (
        <AuthorSupportBanner
          actingDisplayName={execution.actingDisplayName ?? "Пользователь"}
          actingAuthorName={execution.actingAuthorName ?? "Автор"}
          variant={variant}
        />
      ) : null}
      {children}
    </AuthorSupportModeProvider>
  );
}
