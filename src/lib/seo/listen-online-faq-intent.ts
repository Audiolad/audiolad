import { countExactNormalizedSeoPhrase } from "@/lib/seo/primary-query-overuse";
import type { ProductSeoAccessMode } from "@/lib/seo/product-autofill/types";

export type ListenOnlineFaqIntentInput = {
  productTitle: string;
  accessMode: ProductSeoAccessMode;
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
};

export type ListenOnlineFaqIntent = {
  listenOnlineIntent: boolean;
  listenOnlineQuestionOk: boolean;
  listenOnlineAnswerOk: boolean;
  listenOnlineFalseFreeClaim: boolean;
  accessMode: ProductSeoAccessMode;
};

const LISTEN_ROOT = /(?:по|про)?слуш/u;
const ONLINE = /онлайн/u;
const FREE_CLAIM = /бесплатн/u;
const PAGE_ACCESS =
  /на этой странице|в плеере|после получения доступа/u;

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

  const listenOnlineQuestionOk =
    Boolean(question.trim()) &&
    hasListenRoot(question) &&
    hasOnline(question) &&
    (!title || countExactNormalizedSeoPhrase(question, title) === 1) &&
    (confirmedFree ? questionFreeClaim : !questionFreeClaim);

  const listenOnlineAnswerOk =
    Boolean(answer.trim()) &&
    hasListenRoot(answer) &&
    hasPageAccessWording(answer) &&
    (!title || countExactNormalizedSeoPhrase(answer, title) === 0) &&
    (confirmedFree || !answerFreeClaim);

  return {
    listenOnlineIntent:
      listenOnlineQuestionOk &&
      listenOnlineAnswerOk &&
      !listenOnlineFalseFreeClaim,
    listenOnlineQuestionOk,
    listenOnlineAnswerOk,
    listenOnlineFalseFreeClaim,
    accessMode,
  };
}
