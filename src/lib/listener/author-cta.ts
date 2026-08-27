import type { AuthorWorkspace } from "@/lib/author-products/types";
import type { ProfileApplicationVariant } from "@/lib/author-applications/types";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

export type ListenerAuthorCta = {
  label: string;
  href: string;
};

/** Confirmed lookup vs failed author/admin role read. Security stays fail-closed. */
export type AuthorRoleLookupStatus = "confirmed" | "unknown";

const BECOME_AUTHOR_LABEL = "Стать автором";
const AUTHOR_CABINET_LABEL = "Кабинет автора";

export function resolveListenerAuthorCta(input: {
  workspaces: AuthorWorkspace[];
  applicationVariant: ProfileApplicationVariant | null;
  roleLookupStatus?: AuthorRoleLookupStatus;
}): ListenerAuthorCta {
  if (input.workspaces.length > 0) {
    const href =
      input.workspaces.length === 1
        ? `/author-dashboard?author=${encodeURIComponent(input.workspaces[0]!.slug)}`
        : "/author-dashboard";

    return {
      label: AUTHOR_CABINET_LABEL,
      href,
    };
  }

  if (input.roleLookupStatus === "unknown") {
    return { label: "Профиль", href: "/profile" };
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
      return { label: BECOME_AUTHOR_LABEL, href: BECOME_AUTHOR_HREF };
  }
}

export function resolveShowBecomeAuthorPromo(input: {
  workspaces: AuthorWorkspace[];
  applicationVariant: ProfileApplicationVariant | null;
  roleLookupStatus?: AuthorRoleLookupStatus;
}): boolean {
  if (input.roleLookupStatus === "unknown") {
    return false;
  }

  if (input.workspaces.length > 0) {
    return false;
  }

  const cta = resolveListenerAuthorCta(input);

  return cta.label === BECOME_AUTHOR_LABEL || cta.label === "Посмотреть решение";
}

/** Desktop sidebar bottom promo — hidden for active authors (cabinet CTA lives in the right column). */
export function resolveShowSidebarAuthorPromo(input: {
  workspaces: AuthorWorkspace[];
  applicationVariant: ProfileApplicationVariant | null;
  roleLookupStatus?: AuthorRoleLookupStatus;
}): boolean {
  if (input.roleLookupStatus === "unknown") {
    return false;
  }

  return resolveListenerAuthorCta(input).label !== AUTHOR_CABINET_LABEL;
}

/**
 * Right-column author entry vs control panel are independent.
 * Staff without an author cabinet should not see become-author CTAs here.
 * Unknown role lookup must not fall back to «Стать автором».
 */
export function resolveShowAuthorEntry(input: {
  authorCtaLabel: string;
  showAdminPanel: boolean;
  roleLookupStatus?: AuthorRoleLookupStatus;
}): boolean {
  if (input.authorCtaLabel === AUTHOR_CABINET_LABEL) {
    return true;
  }
  if (input.roleLookupStatus === "unknown") {
    return false;
  }
  if (input.showAdminPanel) {
    return false;
  }
  return true;
}
