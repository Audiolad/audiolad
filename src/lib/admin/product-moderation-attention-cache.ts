import { cache } from "react";

import { countAdminProductModerationSubmitted } from "@/lib/admin/product-moderation-queries";

/**
 * One head-count read per admin request tree for the «Модерация продуктов» nav badge.
 * Same filter as the «На модерации» sub-tab (moderation_status = submitted, not deleted).
 * Returns a number only — no product rows or author data leave the server.
 */
export const getCachedAdminProductModerationSubmittedCount = cache(
  async () => countAdminProductModerationSubmitted(),
);
