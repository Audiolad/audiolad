import type { PromoPageStatus } from "@/lib/promo-pages/types";

export function getPromoPageStatusLabel(status: PromoPageStatus | string): string {
  switch (status) {
    case "published":
      return "Опубликована";
    case "unpublished":
      return "Снята с публикации";
    case "draft":
    default:
      return "Черновик";
  }
}

export function getPromoPageStatusClassName(status: PromoPageStatus | string): string {
  switch (status) {
    case "published":
      return "bg-[#eaf7ef] text-[#3d8d65]";
    case "unpublished":
      return "bg-[#eef3ff] text-[#4f6db8]";
    default:
      return "bg-[#fff4df] text-[#b67a1d]";
  }
}
