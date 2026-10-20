import type { PlatformAccessSnapshot } from "@/lib/auth/platform-access";
import { formatAdminNavBadgeCount } from "@/lib/admin/nav-badge";

export const ADMIN_NAV_ATTENTION_QUEUES = [
  { href: "/admin/product-moderation", permission: "author_products.moderate", label: "На модерации", table: "practices", column: "moderation_status", statuses: ["submitted"] },
  { href: "/admin/author-applications", permission: "authors.manage", label: "Ждут решения", table: "author_applications", column: "status", statuses: ["submitted", "in_review"] },
  { href: "/admin/commercial-applications", permission: "authors.manage", label: "Ждут решения", table: "author_commercial_applications", column: "status", statuses: ["submitted", "in_review"] },
  { href: "/admin/payout-profiles", permission: "authors.payout_profiles.review", label: "Ждут решения", table: "author_payout_profiles", column: "status", statuses: ["submitted", "in_review"] },
  { href: "/admin/business-verification", permission: "author_products.moderate", label: "Ждут решения", table: "business_rightsholder_verifications", column: "status", statuses: ["submitted"] },
  { href: "/classica/production", permission: "classica.production.access", label: "Ждут решения", table: "classica_production_jobs", column: "status", statuses: ["in_review"] },
] as const;

// Author attention includes submitted + needs_changes; commercial open includes
// needs_changes; Business open includes needs_info. Payout defaults to all non-drafts.
// needs_changes / needs_info wait for the applicant and are absent from nav counts.
// Classica uses production.access for the nav count as specified; its review RPC
// separately enforces production.moderate. Nav visibility is unchanged.
export type AdminNavAttentionCounts = Partial<Record<string, number | null>>;
export function canCountAdminQueue(access: PlatformAccessSnapshot, permission: string): boolean {
  return access.roles.includes("owner") || access.permissions.has(permission);
}
export function shouldExcludeOwnBusinessCases(isPlatformOwner: boolean): boolean {
  return !isPlatformOwner;
}
export function resolveAdminNavBadge(access: PlatformAccessSnapshot, counts: AdminNavAttentionCounts, href: string) {
  const queue = ADMIN_NAV_ATTENTION_QUEUES.find((q) => q.href === href);
  const count = counts[href];
  if (!queue || !canCountAdminQueue(access, queue.permission) || formatAdminNavBadgeCount(count) === null) return {};
  return { badgeCount: count as number, badgeTone: "attention" as const, badgeLabel: queue.label };
}
export function buildAdminNavAttention(access: PlatformAccessSnapshot, counts: AdminNavAttentionCounts) {
  return Object.fromEntries(ADMIN_NAV_ATTENTION_QUEUES.map((q) => [q.href, resolveAdminNavBadge(access, counts, q.href)]));
}
