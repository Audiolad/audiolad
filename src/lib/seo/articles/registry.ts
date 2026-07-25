import { BESPLATNYE_MEDITATSII_ONLAYN_ARTICLE } from "./content/besplatnye-meditatsii-onlayn";
import { CHTO_TAKOE_DENEZHNYY_POTOK_ARTICLE } from "./content/chto-takoe-denezhnyy-potok";
import { KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE } from "./content/kak-razvit-lyubov-k-sebe";
import { KAK_VOYTI_V_SOSTOYANIE_IZOBILIYA_ARTICLE } from "./content/kak-voyti-v-sostoyanie-izobiliya";
import { MEDITATSIYA_NA_DENGI_ARTICLE } from "./content/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem";
import { MEDITATSIYA_NA_IZOBILIE_ARTICLE } from "./content/meditatsiya-na-izobilie";
import { MEDITATSIYA_NA_PRIVLECHENIE_DENEG_ARTICLE } from "./content/meditatsiya-na-privlechenie-deneg";
import type { ArticleDefinition } from "./types";

const ARTICLE_DEFINITIONS = [
  KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
  MEDITATSIYA_NA_DENGI_ARTICLE,
  KAK_VOYTI_V_SOSTOYANIE_IZOBILIYA_ARTICLE,
  BESPLATNYE_MEDITATSII_ONLAYN_ARTICLE,
  CHTO_TAKOE_DENEZHNYY_POTOK_ARTICLE,
  MEDITATSIYA_NA_IZOBILIE_ARTICLE,
  MEDITATSIYA_NA_PRIVLECHENIE_DENEG_ARTICLE,
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
