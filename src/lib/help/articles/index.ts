import type { HelpArticle } from "@/lib/help/types";

import { authorPageArticle } from "@/lib/help/articles/authors/author-page";
import { createFirstProductArticle } from "@/lib/help/articles/authors/create-first-product";
import { languageAndFormattingArticle } from "@/lib/help/articles/authors/language-and-formatting";
import { publishProductArticle } from "@/lib/help/articles/authors/publish-product";
import { commercialStatusArticle } from "@/lib/help/articles/finance/commercial-status";
import { earningsAndPayoutsArticle } from "@/lib/help/articles/finance/earnings-and-payouts";
import { installOnPhoneArticle } from "@/lib/help/articles/listeners/install-on-phone";
import { resetPasswordArticle } from "@/lib/help/articles/listeners/reset-password";
import { saveToLibraryArticle } from "@/lib/help/articles/listeners/save-to-library";
import { signUpAndSignInArticle } from "@/lib/help/articles/listeners/sign-up-and-sign-in";
import { createPersonalMaterialArticle } from "@/lib/help/articles/personal-work/create-personal-material";
import { sendPersonalMaterialArticle } from "@/lib/help/articles/personal-work/send-personal-material";
import { authorStatsArticle } from "@/lib/help/articles/promotion/author-stats";
import { createCampaignArticle } from "@/lib/help/articles/promotion/create-campaign";
import { createPromoPageArticle } from "@/lib/help/articles/promotion/create-promo-page";
import { emailNotReceivedArticle } from "@/lib/help/articles/troubleshooting/email-not-received";

export const ALL_HELP_ARTICLES: readonly HelpArticle[] = [
  signUpAndSignInArticle,
  resetPasswordArticle,
  saveToLibraryArticle,
  installOnPhoneArticle,
  createFirstProductArticle,
  languageAndFormattingArticle,
  publishProductArticle,
  authorPageArticle,
  createPersonalMaterialArticle,
  sendPersonalMaterialArticle,
  createPromoPageArticle,
  createCampaignArticle,
  authorStatsArticle,
  commercialStatusArticle,
  earningsAndPayoutsArticle,
  emailNotReceivedArticle,
] as const;

export {
  authorPageArticle,
  authorStatsArticle,
  commercialStatusArticle,
  createCampaignArticle,
  createFirstProductArticle,
  createPersonalMaterialArticle,
  createPromoPageArticle,
  earningsAndPayoutsArticle,
  emailNotReceivedArticle,
  installOnPhoneArticle,
  languageAndFormattingArticle,
  publishProductArticle,
  resetPasswordArticle,
  saveToLibraryArticle,
  sendPersonalMaterialArticle,
  signUpAndSignInArticle,
};
