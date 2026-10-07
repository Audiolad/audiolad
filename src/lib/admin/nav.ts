import { isAdminNavPathActive } from "@/lib/admin/nav-active";
import {
  snapshotHasPermission,
  type PlatformAccessSnapshot,
} from "@/lib/auth/platform-access";
import type { PlatformPermission } from "@/lib/auth/platform-permissions";

export { isAdminNavPathActive };

export type AdminNavItem = {
  href: string;
  label: string;
  requiredPermission: PlatformPermission;
  /** Service routes that should highlight this item without appearing in the menu. */
  activePrefixes?: readonly string[];
  match: (path: string) => boolean;
};

/** Kept off the top menu. Reachable from the authors section with authors.manage. */
const CREATE_AUTHOR_SPACE_HREF = "/admin/authors/new";

/**
 * Declarative admin navigation.
 * Visibility and route guards share the same requiredPermission.
 * Do not add empty future sections here until pages exist.
 */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: "Обзор",
    requiredPermission: "dashboard.view",
    match: (path) => path === "/admin",
  },
  {
    href: "/admin/ai-company",
    label: "ИИ-компания",
    requiredPermission: "ai_company.view",
    match: (path) => path.startsWith("/admin/ai-company"),
  },
  {
    href: "/admin/author-applications",
    label: "Заявки авторов",
    requiredPermission: "authors.view",
    activePrefixes: [CREATE_AUTHOR_SPACE_HREF],
    match: (path) =>
      path.startsWith("/admin/author-applications") ||
      isAdminNavPathActive({ href: CREATE_AUTHOR_SPACE_HREF }, path),
  },
  {
    href: "/admin/authors/slug",
    label: "Смена slug автора",
    requiredPermission: "authors.manage",
    match: (path) => path.startsWith("/admin/authors/slug"),
  },
  {
    href: "/admin/commercial-applications",
    label: "Коммерческие заявки",
    requiredPermission: "authors.view",
    match: (path) => path.startsWith("/admin/commercial-applications"),
  },
  {
    href: "/admin/payout-profiles",
    label: "Данные для выплат",
    requiredPermission: "authors.payout_profiles.review",
    match: (path) => path.startsWith("/admin/payout-profiles"),
  },
  {
    href: "/admin/product-moderation",
    label: "Модерация продуктов",
    requiredPermission: "author_products.moderate",
    match: (path) => path.startsWith("/admin/product-moderation"),
  },
  {
    href: "/admin/catalog-sections",
    label: "Разделы каталога",
    requiredPermission: "products.view",
    match: (path) => path.startsWith("/admin/catalog-sections"),
  },
  {
    href: "/admin/tracks",
    label: "Треки",
    requiredPermission: "products.view",
    match: (path) => path.startsWith("/admin/tracks"),
  },
  {
    href: "/admin/seo-queries",
    label: "SEO-запросы",
    requiredPermission: "seo.manage",
    match: (path) => path.startsWith("/admin/seo-queries"),
  },
  {
    href: "/admin/seo-analytics",
    label: "SEO-аналитика",
    requiredPermission: "seo.manage",
    match: (path) => path.startsWith("/admin/seo-analytics"),
  },
  {
    href: "/admin/users",
    label: "Пользователи",
    requiredPermission: "users.view",
    match: (path) => path.startsWith("/admin/users"),
  },
  {
    href: "/admin/sales",
    label: "Продажи",
    requiredPermission: "sales.view",
    match: (path) => path.startsWith("/admin/sales"),
  },
  {
    href: "/admin/mailings",
    label: "Рассылки",
    requiredPermission: "mailings.view",
    match: (path) => path.startsWith("/admin/mailings"),
  },
  {
    href: "/classica/production",
    label: "Classica",
    requiredPermission: "classica.production.access",
    match: (path) => path.startsWith("/classica/production"),
  },
] as const;

export function getVisibleAdminNavItems(
  access: PlatformAccessSnapshot,
): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) =>
    snapshotHasPermission(access, item.requiredPermission),
  );
}

export function findAdminNavItemForPath(path: string): AdminNavItem | null {
  return ADMIN_NAV_ITEMS.find((item) => item.match(path)) ?? null;
}
