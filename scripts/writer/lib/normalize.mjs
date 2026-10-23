// Deterministic typographic normalization. Every change is recorded for the PR body.
const BRAND_SUFFIX = " – АудиоЛад";

const RULES = [
  { name: "U+2011/U+2010 → дефис", re: /[\u2010\u2011]/g, to: "-" },
  { name: "длинное тире (U+2014) → «–»", re: /\u2014/g, to: "\u2013" },
  { name: "неразрывный пробел → пробел", re: /[\u00a0\u202f]/g, to: " " },
  { name: "AudioLad → АудиоЛад", re: /\bAudio[Ll]ad\b/g, to: "АудиоЛад" },
  { name: "двойные пробелы", re: / {2,}/g, to: " " },
  { name: "числовой диапазон через дефис → «–»", re: /(?<![\d.,:/-])(\d{1,3})-(\d{1,3})(?![\d.,:/-])/g, to: "$1\u2013$2" },
];

function fixString(value, counts, { trim = true } = {}) {
  let text = value;
  for (const rule of RULES) {
    text = text.replace(rule.re, (...match) => {
      counts[rule.name] = (counts[rule.name] ?? 0) + 1;
      return rule.to.replace(/\$(\d)/g, (_, n) => match[Number(n)]);
    });
  }
  if (!trim) return text;
  const trimmed = text.trim();
  if (trimmed !== text) counts["пробелы по краям"] = (counts["пробелы по краям"] ?? 0) + 1;
  return trimmed;
}

const segmentText = (segment) => segment.text ?? segment.strong ?? segment.label ?? "";
const SEGMENT_FIELD = (segment) => ["text", "strong", "label"].find((key) => typeof segment[key] === "string");

// Segments are rendered back to back, so the spaces between them live inside the segment
// strings and must not be trimmed. Missing spaces next to a link («попробуйте[ссылка]») are added.
function fixSegments(segments, counts) {
  const out = segments.map((segment) => {
    if (!segment || typeof segment !== "object") return segment;
    const copy = { ...segment };
    for (const key of ["text", "strong", "label"]) {
      if (typeof copy[key] === "string") copy[key] = fixString(copy[key], counts, { trim: key === "label" });
    }
    if (typeof copy.href === "string") copy.href = copy.href.trim();
    return copy;
  });
  for (let i = 1; i < out.length; i += 1) {
    const left = segmentText(out[i - 1]);
    const right = segmentText(out[i]);
    if (!left || !right || /\s$/u.test(left) || /^[\s.,;:!?)»…]/u.test(right) || /[(«]$/u.test(left)) continue;
    const leftKey = SEGMENT_FIELD(out[i - 1]);
    const rightKey = SEGMENT_FIELD(out[i]);
    if (leftKey === "text") out[i - 1].text = `${left} `;
    else if (rightKey === "text") out[i].text = ` ${right}`;
    else continue;
    counts["пробел между сегментами со ссылкой"] = (counts["пробел между сегментами со ссылкой"] ?? 0) + 1;
  }
  const first = out[0];
  const last = out.at(-1);
  if (first?.text) first.text = first.text.replace(/^\s+/u, "");
  if (last?.text) last.text = last.text.replace(/\s+$/u, "");
  for (const segment of out) {
    for (const key of ["text", "strong"]) {
      if (typeof segment?.[key] === "string") segment[key] = segment[key].replace(/ {2,}/g, " ");
    }
  }
  return out;
}

function walk(value, counts, key = "") {
  if (typeof value === "string") return key === "href" ? value.trim() : fixString(value, counts);
  if (Array.isArray(value)) return key === "segments" ? fixSegments(value, counts) : value.map((item) => walk(item, counts));
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
