import { DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "./content/denezhnaya-meditatsiya-slushat-onlayn-besplatno";
import { MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "./content/meditatsiya-na-dengi-slushat-onlayn-besplatno";
import { MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE } from "./content/meditatsiya-na-bogatstvo-slushat-onlayn";
import { MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "./content/meditatsiya-na-izobilie-slushat-onlayn-besplatno";
import { MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE } from "./content/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya";
import { MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "./content/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno";
import { MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE } from "./content/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn";
import { MEDITATSIYA_NA_DENGI_I_IZOBILIE_DLYA_ZHENSHCHIN_PAGE } from "./content/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin";
import { UTRENNYAYA_MEDITATSIYA_NA_DENGI_I_IZOBILIE_PAGE } from "./content/utrennyaya-meditatsiya-na-dengi-i-izobilie";
import { MEDITATSIYA_IZOBILIYA_I_BOGATSTVA_DLYA_SNA_PAGE } from "./content/meditatsiya-izobiliya-i-bogatstva-dlya-sna";
import { SHUM_VODY_SLUSHAT_ONLAYN_PAGE } from "./content/shum-vody-slushat-onlayn";
import { ZHURCHANIE_VODY_SLUSHAT_ONLAYN_PAGE } from "./content/zhurchanie-vody-slushat-onlayn";
import type { ListenPageDefinition } from "./types";

/**
 * Production listen pages are added only from an approved SEO TZ.
 * Composition always comes from the DB playlist named by `playlistSlug`.
 */
const LISTEN_PAGE_DEFINITIONS: readonly ListenPageDefinition[] = [
  MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE,
  MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE,
  MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE,
  MEDITATSIYA_NA_DENGI_I_IZOBILIE_DLYA_ZHENSHCHIN_PAGE,
  UTRENNYAYA_MEDITATSIYA_NA_DENGI_I_IZOBILIE_PAGE,
  MEDITATSIYA_IZOBILIYA_I_BOGATSTVA_DLYA_SNA_PAGE,
  SHUM_VODY_SLUSHAT_ONLAYN_PAGE,
  ZHURCHANIE_VODY_SLUSHAT_ONLAYN_PAGE,
];

const LISTEN_PAGE_BY_SLUG = new Map<string, ListenPageDefinition>(
  LISTEN_PAGE_DEFINITIONS.map((page) => [page.slug, page]),
);

export function listListenPageDefinitions(): readonly ListenPageDefinition[] {
  return LISTEN_PAGE_DEFINITIONS;
}

export function listIndexableListenPageDefinitions(): readonly ListenPageDefinition[] {
  return LISTEN_PAGE_DEFINITIONS.filter((page) => page.indexable !== false);
}

export function listListenPageSlugs(): string[] {
  return LISTEN_PAGE_DEFINITIONS.map((page) => page.slug);
}

export function getListenPageBySlug(slug: string): ListenPageDefinition | null {
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return LISTEN_PAGE_BY_SLUG.get(normalized) ?? null;
}
