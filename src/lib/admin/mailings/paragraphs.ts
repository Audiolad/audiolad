/**
 * Admin mailing «Текст» ↔ content.paragraphs[].
 *
 * Blank line(s) = paragraph block (array element → one <p>).
 * Single newlines inside a block are kept and rendered as <br>.
 * Legacy rows (one line per array element, no embedded \n) still round-trip
 * when joined with paragraphsToText (\n\n between blocks).
 */

/** Max paragraph blocks in one campaign body. */
export const MAX_CAMPAIGN_PARAGRAPHS = 40;

/** Max characters per paragraph block (may contain embedded newlines). */
export const MAX_CAMPAIGN_PARAGRAPH_CHARS = 8000;

/** Max non-empty lines inside one paragraph block. */
export const MAX_CAMPAIGN_LINES_PER_PARAGRAPH = 60;

/**
 * Split textarea value into paragraph blocks.
 * One or more blank lines separate blocks; single newlines stay inside a block.
 */
export function paragraphsFromText(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split(/\n(?:[ \t]*\n)+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/** Serialize stored paragraphs back into the editor textarea. */
export function paragraphsToText(paragraphs: readonly string[]): string {
  return paragraphs
    .map((block) => block.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function countNonEmptyLines(paragraph: string): number {
  return paragraph
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}
