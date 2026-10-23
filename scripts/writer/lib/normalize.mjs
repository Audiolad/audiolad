// Deterministic typographic normalization. Every change is recorded for the PR body.
const BRAND_SUFFIX = " – АудиоЛад";

const RULES = [
  { name: "U+2011/U+2010 → дефис", re: /[\u2010\u2011]/g, to: "-" },
  { name: "длинное тире (U+2014) → «–»", re: /\u2014/g, to: "\u2013" },
  { name: "неразрывный пробел → пробел", re: /[\u00a0\u202f]/g, to: " " },
  { name: "AudioLad → АудиоЛад", re: /\bAudio[Ll]ad\b/g, to: "АудиоЛад" },
  { name: "двойные пробелы", re: / {2,}/g, to: " " },
];

function fixString(value, counts) {
  let text = value;
  for (const rule of RULES) {
    text = text.replace(rule.re, () => {
      counts[rule.name] = (counts[rule.name] ?? 0) + 1;
      return rule.to;
    });
  }
  const trimmed = text.trim();
  if (trimmed !== text) counts["пробелы по краям"] = (counts["пробелы по краям"] ?? 0) + 1;
  return trimmed;
}

function walk(value, counts, key = "") {
  if (typeof value === "string") return key === "href" ? value.trim() : fixString(value, counts);
  if (Array.isArray(value)) return value.map((item) => walk(item, counts));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, counts, k)]));
  }
  return value;
}

export function normalizeArticle(article, context) {
  const counts = {};
  const result = walk(article, counts);
  if (typeof result.metaTitle === "string") {
    const stripped = result.metaTitle.replace(/\s*[|–\-:]?\s*АудиоЛад\s*$/u, "");
    const fixed = `${stripped}${BRAND_SUFFIX}`;
    if (fixed !== result.metaTitle) {
      counts["metaTitle: суффикс « – АудиоЛад»"] = 1;
      result.metaTitle = fixed;
    }
  }
  if (Array.isArray(result.seeAlsoLinks)) {
    for (const link of result.seeAlsoLinks) {
      const slug = String(link?.href ?? "")
        .replace(/^https:\/\/audiolad\.ru/, "")
        .match(/^\/articles\/([a-z0-9-]+)\/?$/)?.[1];
      const known = slug ? context.articleBySlug.get(slug) : null;
      if (known && link.title !== known.title) {
        link.title = known.title;
        counts["seeAlso: заголовок = H1 статьи"] = (counts["seeAlso: заголовок = H1 статьи"] ?? 0) + 1;
      }
    }
  }
  const changes = Object.entries(counts).map(([name, count]) => `${name}: ${count}`);
  return { article: result, changes };
}
