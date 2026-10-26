// Cheap checks on the JSON draft, before a model repair. They do not change the publish gate.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SZ, SZ_BODY_PLAN } from "./config.mjs";
import { szH2Count } from "./metrics.mjs";
import {
  anchorHasBrackets, faqAnswerTypeMismatch, genericLinkAnchor, hasGluedLead, linkLeadResidue,
  markdownLinks, normalize, paragraphsTooClose, sectionRetellsStory, statedListCount, words,
} from "./rules.mjs";

const LINK_FREE = /^(?:story|transition|storyEnding|invitation|question|practiceIntro|checklist|psychologyIntro|experts|specialist|faq|finalInvite|finalQuestion)(?:\.|\[|$)/;

function stringsOf(value, path, out) {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((item, index) => stringsOf(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) stringsOf(item, path ? `${path}.${key}` : key, out);
  }
}

function bodyText(fields) {
  const parts = [];
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const section of fields?.[key] ?? []) parts.push(section?.title, ...(section?.paragraphs ?? []));
  }
  const table = fields?.tableSection ?? {};
  parts.push(table.title, ...(table.paragraphsBefore ?? []), ...(table.paragraphsAfter ?? []), ...(table.rows ?? []).flat());
  const steps = fields?.steps ?? {};
  parts.push(steps.title, steps.intro, ...(steps.items ?? []).flatMap((item) => [item?.title, item?.text]));
  parts.push(fields?.specialist?.intro, ...(fields?.specialist?.items ?? []));
  return parts.filter((part) => typeof part === "string").join("\n");
}

function quotedBlock(text) {
  return /^[«“„>]|<\s*blockquote\b/u.test(String(text ?? "").trim());
}

/**
 * Defects a draft can show before repair. Codes: draft-link-place, draft-link-glue,
 * draft-link-anchor, draft-link-residue, draft-link-missing, draft-retell, draft-duplicate,
 * draft-extra-query, draft-faq-type, draft-steps-count, draft-body-short, draft-h2.
 */
export function draftFieldDefects(fields, article = {}) {
  const hits = [];
  const add = (code, where, message) => hits.push({ code, where, message });
  const slots = [];
  stringsOf(fields ?? {}, "", slots);
  const bodySlugs = new Set();
  for (const slot of slots) {
    const links = markdownLinks(slot.text).filter((link) => link.slug);
    const bannedPlace = LINK_FREE.test(slot.path) || quotedBlock(slot.text);
    if (links.length && bannedPlace && !/^(?:sectionsBefore|sectionsAfter|tableSection|steps)/.test(slot.path)) {
      add("draft-link-place", slot.path, "ссылка в истории, цитате или молитве");
    }
    if (quotedBlock(slot.text) && links.length) add("draft-link-place", slot.path, "ссылка внутри цитаты или молитвы");
    if (hasGluedLead(slot.text)) add("draft-link-glue", slot.path, "склейка ярлыка и ссылки");
    if (linkLeadResidue(slot.text).length) add("draft-link-residue", slot.path, "ярлык с разделителем без ссылки");
    for (const link of links) {
      if (/^(?:sectionsBefore|sectionsAfter|tableSection|steps)/.test(slot.path)) bodySlugs.add(link.slug);
      if (genericLinkAnchor(link.anchor) || anchorHasBrackets(link.anchor)) {
        add("draft-link-anchor", slot.path, `анкор «${link.anchor}»`);
      }
    }
  }
  for (const slug of article.links?.contextual ?? []) {
    if (!bodySlugs.has(slug)) add("draft-link-missing", "sections", `нет /s/${slug} в основной части`);
  }
  const story = [...(fields?.story ?? []), fields?.transition ?? ""].filter((part) => typeof part === "string").join("\n\n");
  const seen = new Set();
  for (const sectionKey of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields?.[sectionKey] ?? []).entries()) {
      const prose = (section?.paragraphs ?? []).join("\n\n");
      if (sectionRetellsStory(story, prose)) add("draft-retell", `${sectionKey}[${index}]`, `раздел «${section?.title ?? ""}» пересказывает историю`);
      for (const paragraph of section?.paragraphs ?? []) {
        const mark = `${sectionKey}[${index}]:${paragraph.slice(0, 48)}`;
        if (seen.has(mark)) continue;
        if (!(fields?.story ?? []).some((opening) => paragraphsTooClose(opening, paragraph))) continue;
        seen.add(mark);
        add("draft-duplicate", `${sectionKey}[${index}]`, "абзац повторяет историю");
      }
    }
  }
  const bodyNorm = normalize(bodyText(fields));
  for (const phrase of article.additionalQueries ?? []) {
    if (phrase && !bodyNorm.includes(normalize(phrase))) add("draft-extra-query", "sections", `нет «${phrase}» в основной части`);
  }
  for (const [index, item] of (fields?.faq ?? []).entries()) {
    if (faqAnswerTypeMismatch(item?.question, item?.answer)) add("draft-faq-type", `faq[${index}]`, `открытый вопрос «${item.question}» начинается как да/нет`);
  }
  const steps = fields?.steps;
  if (steps && statedListCount(steps.title) !== (steps.items ?? []).length) {
    add("draft-steps-count", "steps", `«${steps.title}» не совпадает с ${(steps.items ?? []).length} пунктами`);
  }
  const checklist = fields?.checklist;
  if (checklist && statedListCount(checklist.title) != null && statedListCount(checklist.title) !== (checklist.items ?? []).length) {
    add("draft-steps-count", "checklist", `«${checklist.title}» не совпадает с ${(checklist.items ?? []).length} пунктами`);
  }
  const proseWords = words(bodyText(fields));
  if (proseWords + SZ_BODY_PLAN.chromeWords < SZ.limits.mainBody[0]) {
    add("draft-body-short", "sections", `основная часть около ${proseWords + SZ_BODY_PLAN.chromeWords} слов, цель ${SZ_BODY_PLAN.target[0]}–${SZ_BODY_PLAN.target[1]}`);
  }
  // The prompt aims at 5. The gate allows 4–6, and the approved angel article uses 6.
  if (fields && (szH2Count(fields) < SZ.limits.bodyH2[0] || szH2Count(fields) > SZ.limits.bodyH2[1])) {
    add("draft-h2", "sections", `H2 ${szH2Count(fields)}, нужно ${SZ_BODY_PLAN.h2} (гейт ${SZ.limits.bodyH2[0]}–${SZ.limits.bodyH2[1]})`);
  }
  return hits;
}

const CONTROL_DIRS = [
  "control-out/830372c9-a1",
  "control-out/830372c9-a2",
  "1bbf9c05/control-out/830372c9-a1",
  "1bbf9c05/control-out/830372c9-a2",
  "/workspace/1bbf9c05/control-out/830372c9-a1",
  "/workspace/1bbf9c05/control-out/830372c9-a2",
];

function readJsonIf(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Load a saved control draft when the directory is on disk. Missing dirs are reported, not invented. */
export function loadControlDraft(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const fields = readJsonIf(join(dir, "fields.json")) ?? readJsonIf(join(dir, "article.json"));
  const names = readdirSync(dir);
  const mdName = names.find((name) => name.endsWith(".md") && name !== "report.md");
  const md = mdName ? readFileSync(join(dir, mdName), "utf8") : null;
  return { dir, fields, md };
}

export function findControlDrafts(roots = CONTROL_DIRS) {
  const found = [];
  for (const dir of roots) {
    const loaded = loadControlDraft(dir);
    if (loaded) found.push(loaded);
  }
  return found;
}
