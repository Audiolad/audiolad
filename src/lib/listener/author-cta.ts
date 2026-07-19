import type { AuthorWorkspace } from "@/lib/author-products/types";
import type { ProfileApplicationVariant } from "@/lib/author-applications/types";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

export type ListenerAuthorCta = {
  label: string;
  href: string;
};

export function resolveListenerAuthorCta(input: {
  workspaces: AuthorWorkspace[];
  applicationVariant: ProfileApplicationVariant | null;
}): ListenerAuthorCta {
  if (input.workspaces.length > 0) {
    const href =
      input.workspaces.length === 1
        ? `/author-dashboard?author=${encodeURIComponent(input.workspaces[0]!.slug)}`
        : "/author-dashboard";

    return {
      label: "Кабинет автора",
      href,
    };
  }

  const variant = input.applicationVariant ?? "none";

  switch (variant) {
    case "draft":
      return { label: "Продолжить", href: BECOME_AUTHOR_HREF };
    case "submitted":
      return { label: "Посмотреть заявку", href: BECOME_AUTHOR_HREF };
    case "in_review":
      return { label: "Статус заявки", href: BECOME_AUTHOR_HREF };
    case "needs_changes":
      return { label: "Дополнить заявку", href: BECOME_AUTHOR_HREF };
    case "approved_pending_access":
      return { label: "Заявка одобрена", href: BECOME_AUTHOR_HREF };
    case "rejected":
      return { label: "Посмотреть решение", href: BECOME_AUTHOR_HREF };
    default:
      return { label: "Стать автором", href: BECOME_AUTHOR_HREF };
  }
}

export function resolveShowBecomeAuthorPromo(input: {
  workspaces: AuthorWorkspace[];
  applicationVariant: ProfileApplicationVariant | null;
}): boolean {
  if (input.workspaces.length > 0) {
    return false;
  }

  const cta = resolveListenerAuthorCta(input);

  return cta.label === "Стать автором" || cta.label === "Посмотреть решение";
}
