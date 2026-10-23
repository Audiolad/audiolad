// Reads the sergey-zoya-site checkout (no dependencies, same regexes as the site's stage gates).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SZ } from "./config.mjs";

export const ARTICLES_DIR = "content/articles";

export const words = (text) => String(text).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
// Same as the stage gates: commas ignored, ё → е, case-insensitive.
export const normalize = (text) => String(text).trim().replace(/,/g, "").replace(/\s+/g, " ").toLocaleLowerCase("ru").replace(/ё/g, "е");
export const sharedHeading = (text) => /^(?:Частые вопросы|Читайте также$|Когда стоит обратиться к специалисту$)/iu.test(text);

export function splitMd(md) {
  const match = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  return match ? [match[1], match[2]] : [null, null];
}

export function scalar(fm, key) {
  const raw = fm?.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1];
  if (raw === undefined) return undefined;
  return raw.startsWith('"') ? JSON.parse(raw) : raw;
}

export function faqOf(fm) {
  return [...String(fm).matchAll(/^ {2}- question: (.+)\n {4}answer: (.+)$/gm)].map(([, q, a]) => [JSON.parse(q), JSON.parse(a)]);
}

/** Uniqueness sets from a list of {slug, md} (same extraction as check-stage24). */
export function collectUnique(entries) {
  const sets = { headings: new Map(), questions: new Map(), checklist: new Map(), quotations: new Map() };
  for (const { slug, md } of entries) {
    const [fm, body] = splitMd(md);
    if (!fm) continue;
    for (const [, quote] of body.matchAll(/^> («[^\n]+»\.?)$/gm)) sets.quotations.set(normalize(quote), slug);
    for (const [, heading] of body.matchAll(/^## (.+)$/gm)) if (!sharedHeading(heading)) sets.headings.set(normalize(heading), slug);
    const faqHeading = scalar(fm, "faqHeading");
    if (faqHeading) sets.headings.set(normalize(faqHeading), slug);
    for (const [question] of faqOf(fm)) sets.questions.set(normalize(question), slug);
    for (const [, block] of body.matchAll(/^:::checklist\n([\s\S]*?)\n:::/gm)) {
      for (const [, text] of block.matchAll(/^ {2}text: (.+)$/gm)) sets.checklist.set(normalize(text), slug);
    }
  }
  return sets;
}

const CARD = /<section class="article-expert" aria-label="([^"]+)">\n<div class="article-expert-head"><img class="article-expert-photo" src="\/media\/experts\/([^"]+)" alt="([^"]*)"[^>]*><div><p class="article-expert-name">[^<]*<\/p><p class="article-expert-role">([^<]*)<\/p><p class="article-expert-credit">([^<]*)<\/p>/g;

/** Expert cards already published on the site (latest wins) and per-expert usage (articles count). */
export function collectExperts(entries) {
  const cards = new Map();
  const usage = new Map();
  for (const { md } of [...entries].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const names = new Set();
    for (const [, name, photo, alt, role, credit] of md.matchAll(CARD)) {
      cards.set(name, { name, photo, alt, role, credit });
      names.add(name);
    }
    for (const name of names) usage.set(name, (usage.get(name) ?? 0) + 1);
  }
  return { cards, usage };
}

export function loadSzContext(repoDir) {
  const dir = join(repoDir, ARTICLES_DIR);
  if (!existsSync(dir)) throw new Error(`${repoDir}: нет ${ARTICLES_DIR} – это не репозиторий sergey-zoya-site`);
  const entries = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ slug: name.slice(0, -3), md: readFileSync(join(dir, name), "utf8") }));
  const articles = new Map();
  for (const { slug, md } of entries) {
    const [fm] = splitMd(md);
    articles.set(slug, {
      slug,
      title: scalar(fm, "title") ?? slug,
      draft: scalar(fm, "draft") === "true",
      listed: scalar(fm, "listed") !== "false",
      query: null,
    });
  }
  const reference = entries.find((entry) => entry.slug === SZ.referenceGallerySlug)?.md;
  const referenceGallery = reference?.match(/^:::gallery\n[\s\S]*?\n:::/m)?.[0] ?? null;
  const canonicalPath = join(repoDir, "scripts/check-canonical-order.mjs");
  const canonical = existsSync(canonicalPath) ? readFileSync(canonicalPath, "utf8") : "";
  const count = Number(canonical.match(/assert\.equal\(articles\.length, (\d+), "\d+ published articles"\)/)?.[1] ?? NaN);
  const stages = readdirSync(join(repoDir, "scripts"))
    .map((name) => Number(name.match(/^check-stage(\d+)-articles\.mjs$/)?.[1] ?? NaN))
    .filter(Number.isFinite);
  const expertPhotos = new Set(existsSync(join(repoDir, "public/media/experts")) ? readdirSync(join(repoDir, "public/media/experts")) : []);
  const experts = collectExperts(entries);
  return {
    repoDir,
    expertCards: experts.cards,
    expertUsage: experts.usage,
    portraitExists: (photo) => existsSync(join(repoDir, "public/media/experts", photo)),
    articles,
    unique: collectUnique(entries),
    referenceGallery,
    publishedCount: count,
    nextStage: Math.max(0, ...stages) + 1,
    expertPhotos,
    isPublished: (slug) => Boolean(articles.get(slug) && !articles.get(slug).draft),
  };
}
