// Cheap checks on the JSON draft, before a model repair. They do not change the publish gate.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SZ, SZ_BODY_PLAN } from "./config.mjs";
import { szH2Count } from "./metrics.mjs";
import {
  anchorHasBrackets, faqAnswerTypeMismatch, genericLinkAnchor, hasGluedLead, linkLeadResidue,
  danglingLeads, faqStanceMismatch, firstPersonNarration, linkAnchorMismatches, listPromiseMismatches, markdownLinks,
  paragraphSentenceCount, paragraphsTooClose, phraseInProse, sectionRetellsStory, statedListCount,
  examplePhraseDefect, ungrammaticalLinks, words,
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
 * draft-extra-query, draft-faq-type, draft-faq-stance, draft-steps-count, draft-body-short,
 * draft-body-short, draft-h2, draft-paragraph, draft-dangling, draft-link-map,
 * draft-link-grammar, draft-story-pov, draft-practice-name, draft-example-count.
 * draft-dangling, draft-link-grammar, draft-faq-stance and a count that is not
 * «N шаг/шага/шагов» are hints for one cheap look. They do not fail the publish gate.
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
    if (ungrammaticalLinks(slot.text).length) add("draft-link-grammar", slot.path, "ссылка в конструкции «и […] через»");
    if (/^(?:sectionsBefore|sectionsAfter|tableSection|steps|specialist)/.test(slot.path) && paragraphSentenceCount(slot.text) > 7) {
      add("draft-paragraph", slot.path, `абзац из ${paragraphSentenceCount(slot.text)} предложений`);
    }
  }
  for (const item of linkAnchorMismatches(bodyText(fields), article.links?.anchors)) {
    add("draft-link-map", "sections", `анкор «${item.anchor}» должен вести на ${item.href}`);
  }
  for (const lead of danglingLeads(bodyText(fields))) add("draft-dangling", "sections", `подводка без списка: «${lead.slice(0, 60)}»`);
  for (const hit of listPromiseMismatches(bodyText(fields))) {
    add("draft-steps-count", "sections", `«${hit.title}» обещает ${hit.stated}, а пунктов ${hit.count}`);
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
  const prose = bodyText(fields);
  for (const phrase of article.additionalQueries ?? []) {
    const forms = article.additionalQueryForms?.[phrase] ?? [];
    if (phrase && ![phrase, ...forms].some((form) => phraseInProse(prose, form))) add("draft-extra-query", "sections", `нет «${phrase}» в основной части`);
  }
  for (const [index, item] of (fields?.faq ?? []).entries()) {
    if (faqAnswerTypeMismatch(item?.question, item?.answer)) add("draft-faq-type", `faq[${index}]`, `открытый вопрос «${item.question}» начинается как да/нет`);
    if (faqStanceMismatch(item?.question, item?.answer, article.faqHints)) add("draft-faq-stance", `faq[${index}]`, `ответ противоречит позиции «${item.question}»`);
  }
  if (article.storyHeroine && firstPersonNarration((fields?.story ?? []).join("\n"))) {
    add("draft-story-pov", "story", `героиня «${article.storyHeroine}», а в истории «сказала я»`);
  }
  const practiceTitle = article.practice?.title ?? "";
  if (article.practice?.subtitle && practiceTitle && !(fields?.practiceIntro ?? []).join("\n").includes(practiceTitle)) {
    add("draft-practice-name", "practiceIntro", `нужно дословное название «${practiceTitle}»`);
  }
  if (article.examplePhrases) {
    const ready = (fields?.exampleCandidates ?? []).filter((phrase) => !examplePhraseDefect(phrase)).length;
    if (ready >= article.examplePhrases.min && ready <= Math.max(article.examplePhrases.max, 16)) {
      // Code installs the list. A prose retelling in the section is replaced, so it is not a draft defect.
    } else {
    const titled = [...(fields?.sectionsBefore ?? []), ...(fields?.sectionsAfter ?? []), fields?.tableSection]
      .filter(Boolean)
      .filter((section) => /пример/iu.test(section.title ?? ""));
    const listed = titled.reduce((sum, section) => {
      const rows = Math.max((section.rows?.length ?? 0) - 0, 0);
      const quotes = (section.paragraphs ?? []).filter((paragraph) => /^«[^»]+»$/u.test(paragraph.trim())).length;
      return sum + rows + (section.items?.length ?? 0) + quotes;
    }, 0);
    if (!titled.length) add("draft-example-count", "sections", `нет раздела с примерами фраз (${article.examplePhrases.min}–${article.examplePhrases.max})`);
    else if (listed < article.examplePhrases.min || listed > article.examplePhrases.max) {
      add("draft-example-count", "sections", `примеров ${listed}, нужно ${article.examplePhrases.min}–${article.examplePhrases.max}`);
    }
    }
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
  // The prompt asks for ~1200. This cheap check only flags a draft the gate itself would reject.
  // A text already inside 880–1600 is not sent back to a paid repair just to chase the prompt midpoint.
  if (proseWords + SZ_BODY_PLAN.chromeWords < SZ.limits.mainBody[0]) {
    add("draft-body-short", "sections", `основная часть около ${proseWords + SZ_BODY_PLAN.chromeWords} слов, гейт ${SZ.limits.mainBody[0]}–${SZ.limits.mainBody[1]} (промпт просит ${SZ_BODY_PLAN.target[0]}–${SZ_BODY_PLAN.target[1]})`);
  }
  // The prompt aims at 5. The gate allows 4–6, and the approved angel article uses 6.
  if (fields && (szH2Count(fields) < SZ.limits.bodyH2[0] || szH2Count(fields) > SZ.limits.bodyH2[1])) {
    add("draft-h2", "sections", `H2 ${szH2Count(fields)}, гейт ${SZ.limits.bodyH2[0]}–${SZ.limits.bodyH2[1]} (промпт целится в ${SZ_BODY_PLAN.h2})`);
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
  "control-out/830372c9-a3",
  "1bbf9c05/control-out/830372c9-a3",
  "/workspace/1bbf9c05/control-out/830372c9-a3",
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
