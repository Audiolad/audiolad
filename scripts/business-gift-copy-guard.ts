/**
 * Shared checks for the short gift copy (PR #1049): the visible lines of a rendered
 * block, and the wording that must not come back (Studio limits, MB, hours, gift title).
 */
import assert from "node:assert/strict";

/** Visible text of static markup, one entry per text run between tags. */
export function visibleLines(html: string): string[] {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const NOT_LETTER = "(?<![A-Za-zА-Яа-яЁё])";
const NOT_LETTER_AFTER = "(?![A-Za-zА-Яа-яЁё])";

/** Text that must not appear on the gift card or the confirmation screen. */
export const FORBIDDEN_GIFT_TEXT: ReadonlyArray<readonly [string, RegExp]> = [
  ["Studio", /studio/i],
  ["Студия", /студи/i],
  ["MB", new RegExp(`${NOT_LETTER}(MB|МБ|Мб|мб)${NOT_LETTER_AFTER}`)],
  ["мегабайт", /мегабайт|megabyte/i],
  ["hours", new RegExp(`${NOT_LETTER}(hours?|час|часа|часов|часы)${NOT_LETTER_AFTER}`, "i")],
  ["безлимит", /безлимит/i],
  ["дорожк", /дорожк/i],
  ["em dash", /\u2014/],
];

export function assertNoForbiddenGiftText(text: string, where: string, extra: ReadonlyArray<readonly [string, RegExp]> = []) {
  for (const [name, pattern] of [...FORBIDDEN_GIFT_TEXT, ...extra]) {
    assert.doesNotMatch(text, pattern, `${where}: must not contain ${name}`);
  }
}
