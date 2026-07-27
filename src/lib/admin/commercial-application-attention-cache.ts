import { cache } from "react";

import { getAdminCommercialApplicationAttentionSummary } from "@/lib/admin/commercial-application-queries";

/** One DB read per admin request tree for nav badge + dashboard card. */
export const getCachedAdminCommercialApplicationAttentionSummary = cache(
  async () => getAdminCommercialApplicationAttentionSummary(),
);
