import { effectivePublishedAt, PUBLICATION_TIME_ZONE } from "./scheduled-publication";

/** Calendar dates in every product UI use Moscow time, regardless of host/browser. */
export function formatProductDate(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PUBLICATION_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

/** Never fall back to record creation, last edit, or an uncertain legacy stamp. */
export function productFirstPublicationAt(product: {
  status?: string | null;
  first_published_at?: string | null;
  first_publication_date_unknown?: boolean;
  published_at?: string | null;
  scheduled_publish_at?: string | null;
}, now = new Date()): string | null {
  if (product.first_published_at) {
    const ms = Date.parse(product.first_published_at);
    return Number.isFinite(ms) && ms <= now.getTime() ? product.first_published_at : null;
  }
  // Only an explicitly tracked, approved schedule can go live without a write.
  if (product.first_publication_date_unknown !== false || product.published_at) return null;
  return effectivePublishedAt({
    status: product.status,
    scheduledPublishAt: product.scheduled_publish_at,
    now,
  });
}
