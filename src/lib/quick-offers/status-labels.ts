import type { QuickOfferStatus } from "@/lib/quick-offers/types";

export function getQuickOfferStatusLabel(
  status: QuickOfferStatus | string,
): string {
  switch (status) {
    case "published":
      return "Опубликован";
    case "draft":
    default:
      return "Черновик";
  }
}

export function getQuickOfferStatusClassName(
  status: QuickOfferStatus | string,
): string {
  switch (status) {
    case "published":
      return "bg-[#eaf7ef] text-[#3d8d65]";
    default:
      return "bg-[#fff4df] text-[#b67a1d]";
  }
}
