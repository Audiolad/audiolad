import { cache } from "react";

import { getAdminAuthorApplicationAttentionSummary } from "@/lib/admin/queries";

/** One DB read per admin request tree for nav badge + dashboard card. */
export const getCachedAdminAuthorApplicationAttentionSummary = cache(
  async () => getAdminAuthorApplicationAttentionSummary(),
);
