export type SeoQueryLifecycle =
  | "available"
  | "in_progress"
  | "moderation"
  | "published";

export type SeoQueryOpportunity = {
  id: string;
  queryText: string;
  normalizedQuery: string;
  source: string;
  frequency: number | null;
  clusterName: string | null;
  intent: string | null;
  recommendedFormat: string | null;
  audioFit: string | null;
  lifecycle: SeoQueryLifecycle;
  reservationId: string | null;
  expiresAt: string | null;
  productId: string | null;
  productTitle: string | null;
};

export function lifecycleLabel(value: SeoQueryLifecycle): string {
  switch (value) {
    case "in_progress":
      return "В работе";
    case "moderation":
      return "На модерации";
    case "published":
      return "Опубликован";
    default:
      return "Свободен";
  }
}
