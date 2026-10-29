import { BUSINESS_GIFT_TITLE } from "@/lib/access-grants/copy";
import { coffeeStorefrontUrl } from "@/lib/business-app/host";
import { BUSINESS_PLAN_PERIOD_LABEL, formatBusinessMonthlyPrice } from "@/lib/business/plan";
import { BUSINESS_LANDING_PATH } from "@/lib/business/landing";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

export const COFFEE_ATLAS_PATH = `${BUSINESS_LANDING_PATH}/atlas-kofeen`;

export function buildCoffeeAtlasShopPath(slug: string): string {
  return `${COFFEE_ATLAS_PATH}/${slug}`;
}

export const COFFEE_ATLAS_CANONICAL = `${PRODUCTION_APP_ORIGIN}${COFFEE_ATLAS_PATH}`;

export const COFFEE_ATLAS_TITLE = "Атлас звучания кофеен мира";

export const COFFEE_ATLAS_SUBTITLE =
  "10 вдохновляющих кофеен на пяти континентах – и как могла бы звучать каждая из них";

export const COFFEE_ATLAS_ASSET_DIR = "/business/atlas-kofeen";

export function coffeeAtlasAsset(file: string): string {
  return `${COFFEE_ATLAS_ASSET_DIR}/${file}`;
}

/** The full PDF atlas — downloaded only from the header pill «Скачать PDF-атлас». */
export const COFFEE_ATLAS_PDF_PATH = coffeeAtlasAsset("atlas-10-kofeen-mira.pdf");
export const COFFEE_ATLAS_PDF_DOWNLOAD_NAME = "Атлас-10-кофеен-мира-АудиоЛад.pdf";

/** Web CTA is gated until DNS/TLS rollout; the permanent PDF URL stays available. */
export const COFFEE_ATLAS_CTA_LABEL = "Подобрать звучание моей кофейни";
export const COFFEE_ATLAS_CTA_HREF = coffeeStorefrontUrl();

/** AudioLad Business offer printed at the bottom of every atlas page. */
export const COFFEE_ATLAS_OFFER = {
  title: "АудиоЛад Бизнес для вашей кофейни",
  price: formatBusinessMonthlyPrice(),
  period: BUSINESS_PLAN_PERIOD_LABEL,
  trial: BUSINESS_GIFT_TITLE,
  /** Checklist line after the gift. The digits stay the plan price. */
  afterTrial: `Далее ${formatBusinessMonthlyPrice()} ${BUSINESS_PLAN_PERIOD_LABEL}`,
  rights: "Лицензионная музыка с соблюдением прав",
  rightsHref: `${BUSINESS_LANDING_PATH}/prava`,
} as const;

/** Honest framing of the examples (not official recordings / no partnership). */
export const COFFEE_ATLAS_MUSIC_NOTE =
  "Музыкальные примеры – треки из каталога АудиоЛада, вдохновлённые атмосферой заведения. Это не официальная музыка кофейни и не партнёрство с ней.";

export const COFFEE_ATLAS_DISCLAIMER =
  "Атлас – вдохновляющий обзор для владельцев кофеен. АудиоЛад не связан с упомянутыми кофейнями; их названия принадлежат владельцам. Иллюстрации – из PDF-атласа.";
