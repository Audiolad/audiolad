export type AdminNavActiveTarget = {
  href: string;
  activePrefixes?: readonly string[];
};

/**
 * Top-menu active state.
 * «Обзор» matches only /admin. Other items match their href and child paths.
 * activePrefixes highlights a section for a service route that is not a menu item.
 */
export function isAdminNavPathActive(
  item: AdminNavActiveTarget,
  pathname: string,
): boolean {
  const hrefActive =
    item.href === "/admin"
      ? pathname === "/admin"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  if (hrefActive) {
    return true;
  }

  return (item.activePrefixes ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
