import { AFFIRMATSII_NA_DENGI_ARTICLE } from "./content/affirmatsii-na-dengi";
import { BESPLATNYE_MEDITATSII_ONLAYN_ARTICLE } from "./content/besplatnye-meditatsii-onlayn";
import { CHTO_TAKOE_DENEZHNYY_POTOK_ARTICLE } from "./content/chto-takoe-denezhnyy-potok";
import { KAK_IZMENIT_OTNOSHENIE_K_DENGAM_ARTICLE } from "./content/kak-izmenit-otnoshenie-k-dengam";
import { KAK_OTPUSTIT_OBIDU_ARTICLE } from "./content/kak-otpustit-obidu";
import { KAK_OTPUSTIT_PROSHLOE_ARTICLE } from "./content/kak-otpustit-proshloe";
import { KAK_PERESTAT_ZLITSYA_NA_CHELOVEKA_ARTICLE } from "./content/kak-perestat-zlitsya-na-cheloveka";
import { KAK_PONYAT_CHEGO_YA_HOCHU_ARTICLE } from "./content/kak-ponyat-chego-ya-hochu";
import { KAK_PRIVLECH_DENGI_V_SVOYU_ZHIZN_ARTICLE } from "./content/kak-privlech-dengi-v-svoyu-zhizn";
import { KAK_PROSTIT_CHELOVEKA_ARTICLE } from "./content/kak-prostit-cheloveka";
import { KAK_PROSTIT_SEBYA_ARTICLE } from "./content/kak-prostit-sebya";
import { KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE } from "./content/kak-razvit-lyubov-k-sebe";
import { KAK_VOYTI_V_SOSTOYANIE_IZOBILIYA_ARTICLE } from "./content/kak-voyti-v-sostoyanie-izobiliya";
import { KAK_ZHENSHCHINE_RAZRESHIT_SEBE_DENGI_ARTICLE } from "./content/kak-zhenshchine-razreshit-sebe-dengi";
import { MEDITATSIYA_NA_DENGI_ARTICLE } from "./content/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem";
import { MEDITATSIYA_NA_ISPOLNENIE_ZHELANIY_ARTICLE } from "./content/meditatsiya-na-ispolnenie-zhelaniy";
import { MEDITATSIYA_NA_IZOBILIE_ARTICLE } from "./content/meditatsiya-na-izobilie";
import { MEDITATSIYA_NA_PRIVLECHENIE_DENEG_ARTICLE } from "./content/meditatsiya-na-privlechenie-deneg";
import { POCHEMU_MY_POSTOYANNO_OBIZHAEMSYA_ARTICLE } from "./content/pochemu-my-postoyanno-obizhaemsya";
import { VIZUALIZATSIYA_ZHELANIY_ARTICLE } from "./content/vizualizatsiya-zhelaniy";
import { KAK_PERESTAT_EKONOMIT_NA_SEBE_ARTICLE } from "./content/kak-perestat-ekonomit-na-sebe";
import { DENEZHNYE_USTANOVKI_ARTICLE } from "./content/denezhnye-ustanovki";
import { KAK_PRINIMAT_DENGI_ARTICLE } from "./content/kak-prinimat-dengi";
import { STRAH_TRATIT_DENGI_NA_SEBYA_ARTICLE } from "./content/strah-tratit-dengi-na-sebya";
import { ZHENSKAYA_SAMOTSENNOST_I_DENGI_ARTICLE } from "./content/zhenskaya-samotsennost-i-dengi";
import type { ArticleDefinition } from "./types";

const ARTICLE_DEFINITIONS = [
  KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
  MEDITATSIYA_NA_DENGI_ARTICLE,
  KAK_VOYTI_V_SOSTOYANIE_IZOBILIYA_ARTICLE,
  BESPLATNYE_MEDITATSII_ONLAYN_ARTICLE,
  CHTO_TAKOE_DENEZHNYY_POTOK_ARTICLE,
  MEDITATSIYA_NA_IZOBILIE_ARTICLE,
  MEDITATSIYA_NA_PRIVLECHENIE_DENEG_ARTICLE,
  KAK_PRIVLECH_DENGI_V_SVOYU_ZHIZN_ARTICLE,
  AFFIRMATSII_NA_DENGI_ARTICLE,
  KAK_IZMENIT_OTNOSHENIE_K_DENGAM_ARTICLE,
  MEDITATSIYA_NA_ISPOLNENIE_ZHELANIY_ARTICLE,
  VIZUALIZATSIYA_ZHELANIY_ARTICLE,
  KAK_OTPUSTIT_OBIDU_ARTICLE,
  KAK_PROSTIT_CHELOVEKA_ARTICLE,
  POCHEMU_MY_POSTOYANNO_OBIZHAEMSYA_ARTICLE,
  KAK_OTPUSTIT_PROSHLOE_ARTICLE,
  KAK_PONYAT_CHEGO_YA_HOCHU_ARTICLE,
  KAK_PROSTIT_SEBYA_ARTICLE,
  KAK_PERESTAT_ZLITSYA_NA_CHELOVEKA_ARTICLE,
  KAK_ZHENSHCHINE_RAZRESHIT_SEBE_DENGI_ARTICLE,
  ZHENSKAYA_SAMOTSENNOST_I_DENGI_ARTICLE,
  STRAH_TRATIT_DENGI_NA_SEBYA_ARTICLE,
  KAK_PERESTAT_EKONOMIT_NA_SEBE_ARTICLE,
  KAK_PRINIMAT_DENGI_ARTICLE,
  DENEZHNYE_USTANOVKI_ARTICLE,
] as const satisfies readonly ArticleDefinition[];

const ARTICLE_BY_SLUG = new Map<string, ArticleDefinition>(
  ARTICLE_DEFINITIONS.map((article) => [article.slug, article]),
);

export function listArticleDefinitions(): readonly ArticleDefinition[] {
  return ARTICLE_DEFINITIONS;
}

export function listArticleSlugs(): string[] {
  return ARTICLE_DEFINITIONS.map((article) => article.slug);
}

export function getArticleBySlug(slug: string): ArticleDefinition | null {
  const normalized = slug.trim().toLowerCase();
  return ARTICLE_BY_SLUG.get(normalized) ?? null;
}

export function listArticlesByTopicSlug(
  topicSlug: string,
): readonly ArticleDefinition[] {
  const normalized = topicSlug.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return ARTICLE_DEFINITIONS.filter(
    (article) => article.topicSlug.trim().toLowerCase() === normalized,
  );
}
