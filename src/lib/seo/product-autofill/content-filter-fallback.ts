import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { buildDeterministicListenOnlineFaqItem } from "@/lib/seo/listen-online-faq-intent";
import { countExactNormalizedSeoPhrase } from "@/lib/seo/primary-query-overuse";
import {
  containsSeoPhrase,
  PRODUCT_SEO_TITLE_SEPARATOR,
} from "@/lib/seo/product-metadata";
import type {
  ProductSeoAccessMode,
  ProductSeoAiRawDraft,
} from "@/lib/seo/product-autofill/types";
import { distinctiveQueryStems } from "@/lib/seo/secondary-query-coverage";

export type ProductSeoContentFilterFallbackInput = {
  title: string;
  productKind: string;
  primaryQuery: string;
  activeSecondaryQueries: readonly string[];
  accessMode: ProductSeoAccessMode;
};

function audioFormatNoun(productKind: string): string {
  return productKind.trim() === "practice" ? "аудиопрактика" : "аудиозапись";
}

function clipToLimit(value: string, limit: number): string {
  const text = value.trim();
  if (text.length <= limit) {
    return text;
  }
  return text.slice(0, limit).trim();
}

function themePhraseWithoutExactPrimary(
  query: string,
  primaryQuery: string,
): string {
  const phrase = query.trim().replace(/\s+/g, " ");
  if (!phrase) {
    return "";
  }
  if (!primaryQuery || countExactNormalizedSeoPhrase(phrase, primaryQuery) === 0) {
    return phrase;
  }
  return distinctiveQueryStems(phrase, primaryQuery).join(" ").trim();
}

export function buildFallbackSeoTitle(input: {
  title: string;
  primaryQuery: string;
}): string {
  const title = input.title.trim().replace(/\s+/g, " ");
  const primary = input.primaryQuery.trim();
  const limit = PRODUCT_CONTENT_LIMITS.seoTitle;

  if (primary) {
    if (title && containsSeoPhrase(title, primary) && title.length <= limit) {
      return title;
    }
    if (title && !containsSeoPhrase(title, primary)) {
      const combined = `${primary}${PRODUCT_SEO_TITLE_SEPARATOR}${title}`;
      if (combined.length <= limit && !/,\s*[^,]+\s*,/.test(combined)) {
        return combined;
      }
    }
    return clipToLimit(primary, limit);
  }

  return clipToLimit(title || "Аудиозапись на АудиоЛаде", limit);
}

export function buildFallbackSeoDescription(input: {
  title: string;
  productKind: string;
  primaryQuery: string;
}): string {
  const title = input.title.trim().replace(/\s+/g, " ");
  const primary = input.primaryQuery.trim();
  const format = audioFormatNoun(input.productKind);
  const head = primary || title;
  const quoted = head ? `«${head}»` : "Эта аудиозапись";
  let text = `${quoted} – ${format} для самостоятельного прослушивания на АудиоЛаде.`;

  if (primary && !containsSeoPhrase(text, primary)) {
    text = `${primary} – ${format} для самостоятельного прослушивания на АудиоЛаде.`;
  }

  if (text.length < 80) {
    text = `${text} Запись можно слушать онлайн на этой странице.`;
  }

  if (text.length > PRODUCT_CONTENT_LIMITS.seoDescription) {
    if (primary && primary.length <= PRODUCT_CONTENT_LIMITS.seoDescription) {
      const shortened = `${primary} – ${format} для прослушивания на АудиоЛаде.`;
      if (
        shortened.length <= PRODUCT_CONTENT_LIMITS.seoDescription &&
        containsSeoPhrase(shortened, primary)
      ) {
        return shortened;
      }
      return clipToLimit(primary, PRODUCT_CONTENT_LIMITS.seoDescription);
    }
    return clipToLimit(text, PRODUCT_CONTENT_LIMITS.seoDescription);
  }

  return text;
}

function buildFallbackUsageItems(input: {
  primaryQuery: string;
  secondary1: string;
}): Array<{ content: string }> {
  const primary = input.primaryQuery.trim();
  const theme = themePhraseWithoutExactPrimary(input.secondary1, primary);
  const first = theme
    ? `Слушать в спокойной обстановке, когда нужна тема «${theme}».`
    : "Слушать в спокойной обстановке.";
  const items = [
    clipToLimit(first, PRODUCT_CONTENT_LIMITS.seoUsageItem),
    "Возвращаться к записи в удобное время.",
    "Использовать как часть личной практики прослушивания.",
  ];

  return items.map((content, index, all) => {
    const duplicate = all.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.toLocaleLowerCase("ru-RU") === content.toLocaleLowerCase("ru-RU"),
    );
    if (!duplicate) {
      return { content };
    }
    return {
      content: `${content} Вариант ${index + 1}.`.trim(),
    };
  });
}

function buildFallbackQ1(input: {
  title: string;
  productKind: string;
  primaryQuery: string;
}): { question: string; answer: string; anchor: string } {
  const title = input.title.trim().replace(/\s+/g, " ");
  const primary = input.primaryQuery.trim();
  const format = audioFormatNoun(input.productKind);
  const question = primary
    ? `Что такое «${primary}»?`
    : title
      ? `Что такое «${title}»?`
      : "Что представляет собой этот аудиоматериал?";

  let answer = `Это ${format} для самостоятельного прослушивания.`;
  if (
    title &&
    primary &&
    countExactNormalizedSeoPhrase(title, primary) === 0
  ) {
    answer = `«${title}» – ${format} для самостоятельного прослушивания.`;
  }

  return {
    question: clipToLimit(question, PRODUCT_CONTENT_LIMITS.seoFaqQuestion),
    answer: clipToLimit(answer, PRODUCT_CONTENT_LIMITS.seoFaqAnswer),
    anchor: "chto-takoe",
  };
}

function buildFallbackQ2(input: {
  primaryQuery: string;
  secondary2: string;
}): { question: string; answer: string; anchor: string } {
  const primary = input.primaryQuery.trim();
  const theme = themePhraseWithoutExactPrimary(input.secondary2, primary);

  if (theme) {
    return {
      question: clipToLimit(
        "Как эта страница связана с авторской поисковой темой?",
        PRODUCT_CONTENT_LIMITS.seoFaqQuestion,
      ),
      answer: clipToLimit(
        `Аудиоматериал на этой странице относится к поисковой теме «${theme}».`,
        PRODUCT_CONTENT_LIMITS.seoFaqAnswer,
      ),
      anchor: "kak-svyazano",
    };
  }

  return {
    question: "Когда удобно возвращаться к этой записи?",
    answer: "Запись можно включать в удобное время, когда есть возможность спокойно послушать.",
    anchor: "kak-svyazano",
  };
}

/**
 * Local CONTENT-FILTER fallback. Uses only author-owned known facts.
 * Does not call a provider and does not invent claims.
 */
export function buildProductSeoContentFilterFallback(
  input: ProductSeoContentFilterFallbackInput,
): ProductSeoAiRawDraft {
  const secondary1 = input.activeSecondaryQueries[0]?.trim() ?? "";
  const secondary2 = input.activeSecondaryQueries[1]?.trim() ?? "";

  return {
    seoTitle: buildFallbackSeoTitle({
      title: input.title,
      primaryQuery: input.primaryQuery,
    }),
    seoDescription: buildFallbackSeoDescription({
      title: input.title,
      productKind: input.productKind,
      primaryQuery: input.primaryQuery,
    }),
    usageItems: buildFallbackUsageItems({
      primaryQuery: input.primaryQuery,
      secondary1,
    }),
    faqItems: [
      buildFallbackQ1({
        title: input.title,
        productKind: input.productKind,
        primaryQuery: input.primaryQuery,
      }),
      buildFallbackQ2({
        primaryQuery: input.primaryQuery,
        secondary2,
      }),
      buildDeterministicListenOnlineFaqItem({
        productTitle: input.title,
        accessMode: input.accessMode,
      }),
    ],
  };
}
