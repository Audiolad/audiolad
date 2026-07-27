import type { PlatformPermission } from "@/lib/auth/platform-permissions";
import {
  snapshotHasPermission,
  type PlatformAccessSnapshot,
} from "@/lib/auth/platform-access";

export type AdminNavItem = {
  href: string;
  label: string;
  requiredPermission: PlatformPermission;
  match: (path: string) => boolean;
};

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
    href: "/admin/author-applications",
    label: "Заявки авторов",
    requiredPermission: "authors.view",
    match: (path) => path.startsWith("/admin/author-applications"),
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
    href: "/admin/users",
    label: "Пользователи",
    requiredPermission: "users.view",
    match: (path) => path.startsWith("/admin/users"),
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
