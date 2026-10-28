import type { AdminNavBadgeTone } from "@/lib/admin/nav-badge";

type BusinessNavLink = {
  href: string;
  label: string;
  navId?: string;
  badgeCount?: number;
  badgeTone?: AdminNavBadgeTone;
  badgeLabel?: string;
  matchPrefixes?: string[];
};

/** Top-level admin pill. Submenu labels stay on the real section URLs. */
export const AUDIOLAD_BUSINESS_NAV_LABEL = "АудиоЛад Бизнес";
export const AUDIOLAD_BUSINESS_NAV_ID = "audiolad-business";

const CHILD_LABELS: Record<string, string> = {
  "/admin/business-admissions": "Допуски музыки",
  "/admin/business-verification": "Проверка правообладателей",
  "/admin/business-track-review": "Прослушивание треков",
};

export function isAudioladBusinessNavHref(href: string): boolean {
  return href === "/admin/business" || href.startsWith("/admin/business-");
}

export function audioladBusinessChildLabel(href: string, label: string): string {
  return CHILD_LABELS[href] ?? label.replace(/^Бизнес:\s+/, "");
}

function sumBadges(children: readonly BusinessNavLink[]): Pick<BusinessNavLink, "badgeCount" | "badgeTone" | "badgeLabel"> {
  const positive = children.filter((item) => typeof item.badgeCount === "number" && Number.isFinite(item.badgeCount) && item.badgeCount > 0);
  const sum = positive.reduce((total, item) => total + Math.floor(item.badgeCount ?? 0), 0);
  if (sum <= 0) return {};
  const labels = [...new Set(positive.map((item) => item.badgeLabel).filter((label): label is string => Boolean(label)))];
  return {
    badgeCount: sum,
    badgeTone: positive.some((item) => item.badgeTone === "attention") ? "attention" : undefined,
    badgeLabel: labels.length === 1 ? labels[0] : "Ждут решения",
  };
}

/**
 * Collapses every /admin/business-* pill into one «АудиоЛад Бизнес» button.
 * Child hrefs stay the real pages. The parent opens the first visible section.
 */
export function groupAudioladBusinessNav(items: readonly BusinessNavLink[]): {
  primary: BusinessNavLink[];
  business: BusinessNavLink[] | null;
} {
  const indexes = items.flatMap((item, index) => isAudioladBusinessNavHref(item.href) ? [index] : []);
  if (indexes.length === 0) return { primary: [...items], business: null };
  const business = indexes.map((index) => {
    const item = items[index];
    return { ...item, label: audioladBusinessChildLabel(item.href, item.label) };
  });
  const parent: BusinessNavLink = {
    href: business[0].href,
    navId: AUDIOLAD_BUSINESS_NAV_ID,
    label: AUDIOLAD_BUSINESS_NAV_LABEL,
    matchPrefixes: business.slice(1).flatMap((item) => [item.href, ...(item.matchPrefixes ?? [])]),
    ...sumBadges(business),
  };
  const primary = items.filter((item) => !isAudioladBusinessNavHref(item.href));
  const insertAt = items.slice(0, indexes[0]).filter((item) => !isAudioladBusinessNavHref(item.href)).length;
  primary.splice(insertAt, 0, parent);
  return { primary, business };
}
