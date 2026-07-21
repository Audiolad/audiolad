import { isValidAccessTokenFormat } from "@/lib/personal-materials/tokens";

export type PersonalMaterialGuestApiPaths = {
  audio: string;
  pdf: string;
  pdfOpen: string;
  claim: string;
  claimContext: string;
};

export function buildPersonalMaterialGuestApiPaths(
  rawToken: string,
): PersonalMaterialGuestApiPaths | null {
  if (!isValidAccessTokenFormat(rawToken)) {
    return null;
  }

  const encoded = encodeURIComponent(rawToken.trim());

  return {
    audio: `/api/d/${encoded}/audio`,
    pdf: `/api/d/${encoded}/pdf`,
    pdfOpen: `/api/d/${encoded}/pdf/open`,
    claim: `/api/d/${encoded}/claim`,
    claimContext: `/api/d/${encoded}/claim-context`,
  };
}
