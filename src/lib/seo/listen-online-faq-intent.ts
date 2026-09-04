import { countExactNormalizedSeoPhrase } from "@/lib/seo/primary-query-overuse";
import type { ProductSeoAccessMode } from "@/lib/seo/product-autofill/types";
import {
  distinctiveQueryStemsOutsideSources,
  textContainsAnyCoverageStem,
} from "@/lib/seo/secondary-query-coverage";

export const LITERAL_PRODUCT_TITLE_PLACEHOLDER = "название продукта";

export type ListenOnlineFaqIntentInput = {
  productTitle: string;
  accessMode: ProductSeoAccessMode;
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
  primaryQuery?: string;
  secondary2?: string;
};

export type ListenOnlineFaqIntent = {
  listenOnlineIntent: boolean;
  listenOnlineQuestionOk: boolean;
  listenOnlineAnswerOk: boolean;
  listenOnlineFalseFreeClaim: boolean;
  q3HasLiteralTitlePlaceholder: boolean;
  q3Secondary2Contaminated: boolean;
  accessMode: ProductSeoAccessMode;
};

const LISTEN_ROOT = /(?:по|про)?слуш/u;
const ONLINE = /онлайн/u;
const FREE_CLAIM = /бесплатн/u;
const PAGE_ACCESS =
  /на этой странице|в плеере|после получения доступа/u;

/**
 * Neutral product/reference nouns. They may appear in Q3 as ordinary copy
 * and must not prove secondary #2 stuffing by themselves. Used only by the
 * Q3 contamination check — never by secondary coverage.
 */
export const Q3_NEUTRAL_REFERENCE_VOCABULARY =
  "медитация практика аудиопрактика аудио материал запись сеанс трек продукт";

function normalizeListenText(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function hasListenRoot(text: string): boolean {
  return LISTEN_ROOT.test(normalizeListenText(text));
}

function hasOnline(text: string): boolean {
  return ONLINE.test(normalizeListenText(text));
}

function hasFreeClaim(text: string): boolean {
  return FREE_CLAIM.test(normalizeListenText(text));
}

function hasPageAccessWording(text: string): boolean {
  return PAGE_ACCESS.test(normalizeListenText(text));
}

/**
 * Soft quality signal for reserved FAQ Q3 listen-online intent.
 * Not a hard validator. Never invents free access.
 */
export function evaluateListenOnlineFaqIntent(
  input: ListenOnlineFaqIntentInput,
): ListenOnlineFaqIntent {
  const question = input.faqItems[2]?.question ?? "";
  const answer = input.faqItems[2]?.answer ?? "";
  const title = input.productTitle.trim();
  const accessMode = input.accessMode;
  const confirmedFree = accessMode === "free";
  const questionFreeClaim = hasFreeClaim(question);
  const answerFreeClaim = hasFreeClaim(answer);
  const listenOnlineFalseFreeClaim =
    !confirmedFree && (questionFreeClaim || answerFreeClaim);

  const q3HasLiteralTitlePlaceholder =
    hasLiteralProductTitlePlaceholder(question) ||
    hasLiteralProductTitlePlaceholder(answer);
  const q3Secondary2Contaminated = q3HasDistinctiveSecondary2(
    input.secondary2,
    input.primaryQuery,
    title,
    question,
    answer,
  );

  const listenOnlineQuestionOk =
    Boolean(question.trim()) &&
    hasListenRoot(question) &&
    hasOnline(question) &&
    (!title || countExactNormalizedSeoPhrase(question, title) === 1) &&
    (confirmedFree ? questionFreeClaim : !questionFreeClaim) &&
    !q3HasLiteralTitlePlaceholder;

  const listenOnlineAnswerOk =
    Boolean(answer.trim()) &&
    hasListenRoot(answer) &&
    hasPageAccessWording(answer) &&
    (!title || countExactNormalizedSeoPhrase(answer, title) === 0) &&
    (confirmedFree || !answerFreeClaim) &&
    !q3HasLiteralTitlePlaceholder;

  return {
    listenOnlineIntent:
      listenOnlineQuestionOk &&
      listenOnlineAnswerOk &&
      !listenOnlineFalseFreeClaim,
    listenOnlineQuestionOk,
    listenOnlineAnswerOk,
    listenOnlineFalseFreeClaim,
    q3HasLiteralTitlePlaceholder,
    q3Secondary2Contaminated,
    accessMode,
  };
}

function hasLiteralProductTitlePlaceholder(text: string): boolean {
  return normalizeListenText(text).includes(LITERAL_PRODUCT_TITLE_PLACEHOLDER);
}

function q3HasDistinctiveSecondary2(
  secondary2: string | undefined,
  primaryQuery: string | undefined,
  productTitle: string,
  question: string,
  answer: string,
): boolean {
  const forbiddenStems = distinctiveQueryStemsOutsideSources(
    secondary2 ?? "",
    primaryQuery ?? "",
    productTitle,
    Q3_NEUTRAL_REFERENCE_VOCABULARY,
  );
  if (forbiddenStems.length === 0) {
    return false;
  }

  return textContainsAnyCoverageStem(`${question} ${answer}`, forbiddenStems);
}
