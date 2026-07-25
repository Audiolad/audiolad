/**
 * Shared typography for SEO article body content (`/articles/{slug}`).
 * Apply to body stacks/paragraphs so all current and future articles inherit
 * the same reading size — not headings, nav, breadcrumbs, TOC, or chrome.
 */

const ARTICLE_BODY_LIST_QUOTE_CLASS = [
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5",
  "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
  "[&_li]:leading-[1.7] sm:[&_li]:leading-[1.75]",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[#c9b6ea] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#4a3d73]",
].join(" ");

/** Main article body: 18px mobile / 19px sm+ with comfortable line-height. */
export const articleBodyClass = [
  "text-[18px] leading-[1.7] text-[#4a3d73] sm:text-[19px] sm:leading-[1.75]",
  ARTICLE_BODY_LIST_QUOTE_CLASS,
].join(" ");

/** Body stack with vertical rhythm between paragraphs / blocks. */
export const articleBodyStackClass = ["space-y-4", articleBodyClass].join(" ");

/** FAQ answers: one step smaller than body (16px / 17px sm+). */
export const articleFaqAnswerClass =
  "text-base leading-[1.7] text-[#4a3d73] sm:text-[17px] sm:leading-[1.75]";
