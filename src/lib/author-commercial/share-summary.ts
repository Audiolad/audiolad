import {
  getCommercialShareDisplayLines,
  PLATFORM_COMMISSION_SCOPE_TEXT,
  resolveDisplayCommercialShare,
} from "@/lib/author-commercial/economics";
import { getCurrentApprovedAuthorCommercialShare } from "@/lib/author-commercial/current-terms";

export type AuthorCommercialShareSummary = {
  authorLine: string;
  platformLine: string;
  scopeText: string;
  isIndividual: boolean;
};

export async function loadAuthorCommercialShareSummary(
  authorId: string,
): Promise<AuthorCommercialShareSummary> {
  const individual = await getCurrentApprovedAuthorCommercialShare(authorId);
  const share = resolveDisplayCommercialShare(
    individual
      ? {
          authorShareBps: individual.authorShareBps,
          platformShareBps: individual.platformShareBps,
        }
      : null,
  );
  const lines = getCommercialShareDisplayLines(share);

  return {
    authorLine: lines.authorLine,
    platformLine: lines.platformLine,
    scopeText: PLATFORM_COMMISSION_SCOPE_TEXT,
    isIndividual: share.isIndividual,
  };
}
