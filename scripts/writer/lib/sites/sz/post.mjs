// Deterministic assembly after the draft: required internal links, the 8–12 example list,
// a verbatim practice title, and a short FAQ/description pad. No new facts and no new quotes.
// Links are only /s/<slug> from the brief. Example lines come from the draft or from brief facts.
import { SZ } from "./config.mjs";
import { examplePhraseDefect, genericLinkAnchor, markdownLinks, normalize, words } from "./rules.mjs";

export function linkSentence(anchor, slug) {
  const label = String(anchor ?? "").replace(/[\[\]]/g, "").trim();
  return `Смежная тема на сайте – [${label}](/s/${slug}).`;
}

function anchorFor(slug, links, titles) {
  const pair = (links?.anchors ?? []).find((item) => item?.slug === slug || item?.href === `/s/${slug}`);
  if (pair?.anchor) return pair.anchor;
  if (titles?.get?.(slug) || titles?.[slug]) return titles.get?.(slug) ?? titles[slug];
  return `разбор темы ${slug}`;
}

function requiredPairs(links, titles) {
  const slugs = [...new Set((links?.contextual ?? []).filter((slug) => /^[a-z0-9-]+$/.test(slug)))];
  return slugs.map((slug) => {
    const specified = (links?.anchors ?? []).find((item) => item?.slug === slug || item?.href === `/s/${slug}`);
    return {
      slug,
      anchor: anchorFor(slug, links, titles),
      href: specified?.href || `/s/${slug}`,
      explicit: Boolean(specified?.anchor),
    };
  });
}

function insideQuotes(text, index) {
  const before = String(text ?? "").slice(0, index);
  return (before.match(/«/g) ?? []).length > (before.match(/»/g) ?? []).length;
}

function rewriteMarkdownLinks(text, pairs, kept) {
  const allowed = new Set(pairs.map((pair) => pair.slug));
  const bySlug = new Map(pairs.map((pair) => [pair.slug, pair]));
  const edits = [];
  for (const link of markdownLinks(text)) {
    if (insideQuotes(text, link.start)) continue;
    if (!link.slug || !allowed.has(link.slug) || kept.has(link.slug)) {
      edits.push({ start: link.start, end: link.end, text: link.anchor });
      continue;
    }
    kept.add(link.slug);
    const pair = bySlug.get(link.slug);
    const anchor = pair.explicit || genericLinkAnchor(link.anchor) ? pair.anchor : link.anchor;
    const replacement = `[${anchor}](${pair.href})`;
    if (replacement !== link.raw) edits.push({ start: link.start, end: link.end, text: replacement });
  }
  let next = String(text ?? "");
  for (const edit of edits.reverse()) next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
  return next;
}

function hostSlots(fields) {
  const slots = [];
  const addList = (list, path) => {
    if (!Array.isArray(list)) return;
    for (let index = 0; index < list.length; index += 1) {
      if (typeof list[index] !== "string") continue;
      slots.push({
        path: `${path}[${index}]`,
        get: () => list[index],
        set: (value) => { list[index] = value; },
      });
    }
  };
  for (const [index, section] of (fields.sectionsBefore ?? []).entries()) addList(section?.paragraphs, `sectionsBefore[${index}].paragraphs`);
  addList(fields.tableSection?.paragraphsBefore, "tableSection.paragraphsBefore");
  addList(fields.tableSection?.paragraphsAfter, "tableSection.paragraphsAfter");
  for (const [index, item] of (fields.steps?.items ?? []).entries()) {
    if (typeof item?.text !== "string") continue;
    slots.push({
      path: `steps.items[${index}].text`,
      get: () => item.text,
      set: (value) => { item.text = value; },
    });
  }
  return slots;
}

function sentenceCount(text) {
  return String(text ?? "").split(/(?<=[.!?…])\s+/u).filter((part) => /\p{L}/u.test(part)).length;
}

const LINK_HOSTS = new Set(["sectionsBefore", "sectionsAfter", "tableSection", "steps"]);

function linkAcceptable(text, link) {
  if (!link?.slug || genericLinkAnchor(link.anchor) || insideQuotes(text, link.start)) return false;
  const before = String(text).slice(Math.max(0, link.start - 48), link.start);
  if (/(?:подробнее|читайте также|см\. также|узнайте больше|смотрите также)\s*[:–—-]\s*$/iu.test(before)) return false;
  return true;
}

/** A clean link outside the hosts still counts. A generic or glued one does not, so the body copy stays. */
function slugsOutsideHosts(value, allowed, into, inHost = false) {
  if (typeof value === "string") {
    if (!inHost) {
      for (const link of markdownLinks(value)) if (allowed.has(link.slug) && linkAcceptable(value, link)) into.add(link.slug);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) slugsOutsideHosts(item, allowed, into, inHost);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (key === "quote") continue;
    slugsOutsideHosts(value[key], allowed, into, inHost || LINK_HOSTS.has(key));
  }
}

function rewriteHostStrings(fields, pairs, kept) {
  const rewriteList = (list) => {
    if (!Array.isArray(list)) return;
    for (let index = 0; index < list.length; index += 1) {
      if (typeof list[index] === "string") list[index] = rewriteMarkdownLinks(list[index], pairs, kept);
    }
  };
  for (const section of [...(fields.sectionsBefore ?? []), ...(fields.sectionsAfter ?? [])]) rewriteList(section?.paragraphs);
  rewriteList(fields.tableSection?.paragraphsBefore);
  rewriteList(fields.tableSection?.paragraphsAfter);
  for (const row of fields.tableSection?.rows ?? []) rewriteList(row);
  if (typeof fields.steps?.intro === "string") fields.steps.intro = rewriteMarkdownLinks(fields.steps.intro, pairs, kept);
  for (const item of fields.steps?.items ?? []) {
    if (typeof item?.text === "string") item.text = rewriteMarkdownLinks(item.text, pairs, kept);
  }
}

function sectionKey(path) {
  return path.match(/sections(?:Before|After)\[\d+\]|tableSection|steps/)?.[0] ?? path;
}

/**
 * Puts each required brief link into the main-body prose, one sentence, with the brief anchor.
 * A slug that is not in the brief is unwrapped inside the link hosts. Duplicate slugs are unwrapped down to one.
 * Story, quotes and FAQ are not rewritten: a link that already lives there is left in place and not duplicated.
 */
export function ensureBriefLinks(fields, links, titles) {
  const pairs = requiredPairs(links, titles);
  if (!pairs.length || !fields) return { fields, notes: [] };
  const notes = [];
  const kept = new Set();
  slugsOutsideHosts(fields, new Set(pairs.map((pair) => pair.slug)), kept);
  rewriteHostStrings(fields, pairs, kept);
  const missing = pairs.filter((pair) => !kept.has(pair.slug));
  const slots = hostSlots(fields).filter((slot) => !markdownLinks(slot.get()).some((link) => link.slug) && sentenceCount(slot.get()) <= 6 && !slot.get().includes("\n"));
  const usedSections = new Set();
  for (const pair of missing) {
    let index = slots.findIndex((slot) => !usedSections.has(sectionKey(slot.path)));
    if (index < 0) index = slots.length ? 0 : -1;
    const sentence = linkSentence(pair.anchor, pair.slug);
    if (index >= 0) {
      const slot = slots.splice(index, 1)[0];
      slot.set(`${slot.get().trim()} ${sentence}`.trim());
      usedSections.add(sectionKey(slot.path));
    } else {
      const hosts = [
        ...(fields.sectionsBefore ?? []).map((section, i) => ({ section, key: `sectionsBefore[${i}]` })),
        ...(fields.sectionsAfter ?? []).map((section, i) => ({ section, key: `sectionsAfter[${i}]` })),
      ];
      const host = hosts.find((item) => !usedSections.has(item.key)) ?? hosts[0];
      if (!host) break;
      host.section.paragraphs = [...(host.section.paragraphs ?? []), sentence];
      usedSections.add(host.key);
    }
    kept.add(pair.slug);
    notes.push(`вставлена ссылка /s/${pair.slug}`);
  }
  return { fields, notes };
}

function pushPhrase(found, raw) {
  let text = String(raw ?? "").trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
  text = text.replace(/^«|»$/g, "").replace(/\.$/u, "").trim();
  if (!text || examplePhraseDefect(text)) return;
  if (words(text) > 18) return;
  if (found.some((item) => normalize(item) === normalize(text))) return;
  found.push(text);
}

function phrasesInBlob(blob, found) {
  for (const line of String(blob ?? "").split("\n")) {
    const item = line.match(/^(?:[-*] |\d+\. )(.+)/);
    if (item) pushPhrase(found, item[1]);
    const quoted = line.trim().match(/^«([^»]{1,160})»\.?$/u);
    if (quoted) pushPhrase(found, quoted[1]);
  }
}

/** Model lines (lists, «ёлочки», short table cells) plus brief facts that already pass the example gate. */
export function harvestExamplePhrases(fields, facts = []) {
  const found = [];
  const sections = [...(fields?.sectionsBefore ?? []), ...(fields?.sectionsAfter ?? [])];
  for (const section of sections) {
    if (!/пример/iu.test(section?.title ?? "")) continue;
    for (const paragraph of section.paragraphs ?? []) phrasesInBlob(paragraph, found);
  }
  const table = fields?.tableSection;
  for (const row of table?.rows ?? []) {
    for (const cell of row ?? []) pushPhrase(found, cell);
  }
  for (const fact of facts ?? []) pushPhrase(found, fact);
  return found;
}

function sentencesWith(text, needles) {
  return String(text ?? "").split(/(?<=[.!?…])\s+/u).filter((part) => {
    const plain = part.trim();
    return plain && needles.some((needle) => needle && normalize(plain).includes(normalize(needle)));
  });
}

export function assembleExampleSection(fields, { min = 8, max = 12, facts = [], keepTexts = [] } = {}) {
  if (!fields) return { fields, notes: [] };
  const phrases = harvestExamplePhrases(fields, facts).slice(0, max);
  const sections = [...(fields.sectionsBefore ?? []), ...(fields.sectionsAfter ?? [])];
  const section = sections.find((item) => /пример/iu.test(item?.title ?? ""));
  if (!section || phrases.length < min) {
    const note = section && phrases.length ? `список примеров не собран: ${phrases.length} из ${min}–${max}` : "";
    return { fields, notes: note ? [note] : [] };
  }
  const kept = (section.paragraphs ?? []).flatMap((paragraph) => sentencesWith(paragraph, keepTexts));
  const list = [...phrases.map((phrase) => `- ${phrase}`), ...kept].join("\n");
  if ((section.paragraphs ?? []).join("\n") === list) return { fields, notes: [] };
  section.paragraphs = [list];
  return { fields, notes: [`список примеров собран из черновика: ${phrases.length}`] };
}

const GUARANTEE = [
  // Longer forms first: «гарантированное» must not become «заранеее».
  { source: "гарантированн(\\p{L}*)", replace: (_match, ending) => (ending === "о" ? "заранее" : `обещанн${ending}`) },
  { source: "гарантируем", replace: () => "обещаем" },
  { source: "гарантируют", replace: () => "обещают" },
  { source: "гарантирует", replace: () => "обещает" },
];

/**
 * Replaces the promise stem the gate bans.
 * «не гарантирует» stays, unless the brief's own forbidden list contains the stem:
 * the gate then matches it as a substring. Expert quote fields are skipped by the walker.
 */
export function replaceGuaranteeStem(text, { phrases = null } = {}) {
  const banNegation = (phrases ?? []).some((phrase) => normalize(phrase).includes("гарантир"));
  const boundary = banNegation ? "" : "(?<!не )";
  let next = String(text ?? "");
  for (const item of GUARANTEE) {
    const pattern = new RegExp(`${boundary}${item.source}`, "giu");
    next = next.replace(pattern, (match, ...rest) => {
      const replacement = item.replace(match, ...rest);
      const head = match[0] ?? "";
      const upper = head !== head.toLocaleLowerCase("ru") && head === head.toLocaleUpperCase("ru");
      return upper ? replacement[0].toLocaleUpperCase("ru") + replacement.slice(1) : replacement;
    });
  }
  return next;
}

export function padDescription(description, { min = 140, max = 160 } = {}) {
  const text = String(description ?? "").trim();
  const length = [...text].length;
  if (!text || length >= min) return text;
  const pads = [" Это настройка внимания.", " Без обещания дохода.", " Шаг остаётся вашим."];
  for (const pad of pads) {
    const joined = `${text}${pad}`;
    const size = [...joined].length;
    if (size >= min && size <= max) return joined;
  }
  return text;
}

const FAQ_PAD = " Смысл здесь про внимание и выбранный шаг, без денежного результата.";

export function padFaqAnswer(answer, { min = 40, max = 80 } = {}) {
  const text = String(answer ?? "").trim();
  if (!text || words(text) >= min || words(text) > max) return text;
  const joined = `${text}${FAQ_PAD}`;
  if (words(joined) < min || words(joined) > max) return text;
  return joined;
}

export function ensurePracticeTitle(fields, practice) {
  const title = String(practice?.title ?? "").trim();
  if (!title || !practice?.subtitle) return { fields, notes: [] };
  const intro = fields?.practiceIntro;
  if (!Array.isArray(intro) || intro.join("\n").includes(title)) return { fields, notes: [] };
  const sentence = `Запись называется «${title}».`;
  const limit = SZ.limits.practiceIntroWords;
  if (intro.length === 0) intro.push(sentence);
  else if (words(`${sentence} ${intro[0]}`) <= limit) intro[0] = `${sentence} ${intro[0]}`.trim();
  else if (intro.length < 2 && words(sentence) <= limit) intro.unshift(sentence);
  else return { fields, notes: [] };
  return { fields, notes: ["название практики вставлено дословно"] };
}

function yesNoQuestion(question) {
  return /^(?:а\s+)?(?:можно|нужно|стоит|есть|будет|надо|возможно)\s+ли\b/iu.test(String(question ?? "").trim())
    || /гарантир|обещает\s+ли/iu.test(String(question ?? ""));
}

/** Makes a duplicated FAQ question unique with the article query, without quotation marks. */
export function uniqueFaqQuestion(question, query, phrases = null) {
  const text = replaceGuaranteeStem(String(question ?? "").trim(), { phrases });
  const topic = String(query ?? "").trim();
  if (!topic || normalize(text).includes(normalize(topic))) return text;
  const glue = yesNoQuestion(text) ? "в теме" : "по теме";
  return text.replace(/\?\s*$/u, ` ${glue} ${topic}?`);
}

export function diversifySharedFaqFields(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    for (const [index, faq] of (item.fields?.faq ?? []).entries()) {
      const phrases = item.brief?.forbiddenPhrases ?? item.forbiddenPhrases ?? null;
      const key = normalize(replaceGuaranteeStem(faq?.question ?? "", { phrases }));
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push({ item, index });
      groups.set(key, list);
    }
  }
  let changed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) {
      const only = list[0];
      if (!only) continue;
      const phrases = only.item.brief?.forbiddenPhrases ?? only.item.forbiddenPhrases ?? null;
      const current = only.item.fields.faq[only.index];
      const replaced = replaceGuaranteeStem(current.question, { phrases });
      if (replaced !== current.question) {
        current.question = replaced;
        changed += 1;
      }
      if (typeof current.answer === "string") {
        const answer = replaceGuaranteeStem(current.answer, { phrases });
        if (answer !== current.answer) {
          current.answer = answer;
          changed += 1;
        }
      }
      continue;
    }
    for (const { item, index } of list) {
      const phrases = item.brief?.forbiddenPhrases ?? item.forbiddenPhrases ?? null;
      const current = item.fields.faq[index];
      const next = uniqueFaqQuestion(current.question, item.brief?.query ?? item.query ?? "", phrases);
      if (next !== current.question) changed += 1;
      current.question = next;
      if (typeof current.answer === "string") {
        const answer = replaceGuaranteeStem(current.answer, { phrases });
        if (answer !== current.answer) {
          current.answer = answer;
          changed += 1;
        }
      }
    }
  }
  return changed;
}

function mapFieldStrings(fields, fn) {
  const visit = (value) => {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        if (key === "quote") continue;
        value[key] = visit(value[key]);
      }
    }
    return value;
  };
  return visit(fields);
}

/**
 * Field-level fixes used before the gate and before any paid repair.
 * `links` null leaves links alone (callers that only trim a description).
 */
export function applyStructuralFixes(fields, options = {}) {
  const notes = [];
  let next = fields;
  if (options.links) {
    const linked = ensureBriefLinks(next, options.links, options.titles);
    next = linked.fields;
    notes.push(...linked.notes);
  }
  if (options.examplePhrases) {
    const keepTexts = (options.additionalQueries ?? []).map((item) => (typeof item === "string" ? item : item?.text)).filter(Boolean);
    const built = assembleExampleSection(next, { ...options.examplePhrases, facts: options.facts ?? [], keepTexts });
    next = built.fields;
    notes.push(...built.notes);
  }
  if (options.practice) {
    const titled = ensurePracticeTitle(next, options.practice);
    next = titled.fields;
    notes.push(...titled.notes);
  }
  const before = JSON.stringify(next);
  next = mapFieldStrings(next, (text) => replaceGuaranteeStem(text, { phrases: options.forbiddenPhrases }));
  if (JSON.stringify(next) !== before) notes.push("слово «гарантирует» заменено");
  if (typeof next.description === "string") {
    const padded = padDescription(next.description, { min: SZ.limits.description[0], max: SZ.limits.description[1] });
    if (padded !== next.description && normalize(padded).includes(normalize(options.query ?? ""))) {
      next.description = padded;
      notes.push("description дополнен до 140 символов");
    }
  }
  for (const item of next.faq ?? []) {
    if (typeof item?.answer !== "string") continue;
    const padded = padFaqAnswer(item.answer, { min: SZ.limits.faqAnswer[0], max: SZ.limits.faqAnswer[1] });
    if (padded !== item.answer) {
      item.answer = padded;
      notes.push("короткий ответ FAQ дополнен");
    }
  }
  return { fields: next, notes };
}

function frontmatterValue(fm, key) {
  const raw = fm.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1];
  if (raw === undefined) return null;
  try {
    return raw.startsWith('"') ? JSON.parse(raw) : raw;
  } catch {
    return raw;
  }
}

function setFrontmatter(fm, key, value) {
  const line = `${key}: ${JSON.stringify(value)}`;
  if (new RegExp(`^${key}: `, "m").test(fm)) return fm.replace(new RegExp(`^${key}: .+$`, "m"), line);
  return fm;
}

function insertPracticeTitle(body, practice) {
  const title = String(practice?.title ?? "").trim();
  if (!practice?.subtitle || !title || body.includes(title)) return body;
  const sentence = `Запись называется «${title}».`;
  const marker = ":::overview\n:::\n";
  const at = body.indexOf(marker);
  if (at < 0) return body;
  const start = at + marker.length;
  const audio = body.indexOf(":::practiceAudio", start);
  if (audio < 0) return body;
  const intro = body.slice(start, audio).trim().split(/\n\n+/).filter(Boolean);
  const limit = SZ.limits.practiceIntroWords;
  if (intro.length === 0) return `${body.slice(0, start)}\n${sentence}\n\n${body.slice(start)}`;
  if (words(`${sentence} ${intro[0]}`) <= limit) {
    const replaced = `${body.slice(start, audio).replace(intro[0], `${sentence} ${intro[0]}`)}`;
    return `${body.slice(0, start)}${replaced}${body.slice(audio)}`;
  }
  if (intro.length < 2 && words(sentence) <= limit) return `${body.slice(0, start)}\n${sentence}\n\n${body.slice(start)}`;
  return body;
}

/**
 * The same structural fixes on an already assembled article, for the offline re-gate.
 * Blockquotes (expert quotes) are left byte for byte.
 */
export function postProcessDraftMarkdown(md, brief, packFaqs = []) {
  const match = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { md, notes: [] };
  let fm = match[1];
  let body = match[2];
  const notes = [];
  const description = frontmatterValue(fm, "description");
  if (typeof description === "string") {
    const padded = padDescription(description);
    if (padded !== description && normalize(padded).includes(normalize(brief.query ?? ""))) {
      fm = setFrontmatter(fm, "description", padded);
      notes.push("description");
    }
  }
  const seo = frontmatterValue(fm, "seoTitle");
  if (typeof seo === "string" && [...seo].length > SZ.limits.seoTitleMax) {
    const wordsOf = seo.split(/\s+/u);
    while (wordsOf.length > 2 && [...wordsOf.join(" ")].length > SZ.limits.seoTitleMax) wordsOf.pop();
    const trimmed = wordsOf.join(" ");
    if ([...trimmed].length <= SZ.limits.seoTitleMax && normalize(trimmed).startsWith(normalize(brief.query ?? ""))) {
      fm = setFrontmatter(fm, "seoTitle", trimmed);
      notes.push("seoTitle");
    }
  }
  const seen = new Map();
  for (const question of packFaqs) seen.set(normalize(question), (seen.get(normalize(question)) ?? 0) + 1);
  fm = fm.replace(/^ {2}- question: (.+)\n {4}answer: (.+)$/gm, (full, qRaw, aRaw) => {
    let question = JSON.parse(qRaw);
    let answer = JSON.parse(aRaw);
    const phrases = brief.forbiddenPhrases;
    const stemQuestion = replaceGuaranteeStem(question, { phrases });
    const duplicated = (seen.get(normalize(question)) ?? 0) > 1 || (seen.get(normalize(stemQuestion)) ?? 0) > 1;
    if (duplicated) question = uniqueFaqQuestion(question, brief.query, phrases);
    else question = stemQuestion;
    answer = replaceGuaranteeStem(answer, { phrases });
    answer = padFaqAnswer(answer);
    if (question !== JSON.parse(qRaw) || answer !== JSON.parse(aRaw)) notes.push("faq");
    return `  - question: ${JSON.stringify(question)}\n    answer: ${JSON.stringify(answer)}`;
  });
  body = insertPracticeTitle(body, brief.practice ?? {});
  if (body !== match[2]) notes.push("practice-name");
  body = rewriteExampleSection(body, brief);
  notes.push("examples");
  body = rewriteBodyLinks(body, brief);
  notes.push("links");
  body = body.split("\n").map((line) => (/^\s*>/.test(line) || /^Источник:/.test(line) ? line : replaceGuaranteeStem(line, { phrases: brief.forbiddenPhrases }))).join("\n");
  return { md: `---\n${fm}\n---\n${body}`, notes };
}

function mainBodySlice(body) {
  const faqAt = body.search(/^:::faq\n:::$/m);
  const specialist = body.search(/^## Когда стоит обратиться к специалисту$/m);
  const end = specialist >= 0 && (faqAt < 0 || specialist < faqAt) ? specialist : faqAt;
  if (end < 0) return null;
  const start = body.lastIndexOf("</section>", end);
  const from = start >= 0 ? start + "</section>".length : 0;
  return { from, end };
}

function rewriteBodyLinks(body, brief) {
  const slice = mainBodySlice(body);
  if (!slice) return body;
  const pairs = requiredPairs(brief.links, null);
  const kept = new Set();
  const before = body.slice(0, slice.from);
  for (const link of markdownLinks(before)) {
    if (pairs.some((pair) => pair.slug === link.slug) && linkAcceptable(before, link)) kept.add(link.slug);
  }
  let chunk = rewriteMarkdownLinks(body.slice(slice.from, slice.end), pairs, kept);
  const missing = pairs.filter((pair) => !kept.has(pair.slug));
  const blocks = chunk.split(/\n\n/);
  let example = false;
  const exampleBlock = blocks.map((block) => {
    const title = block.trim().match(/^## (.+)/)?.[1];
    if (title) example = /пример/iu.test(title);
    return example;
  });
  let used = 0;
  for (const pair of missing) {
    let placed = false;
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i].trim();
      if (exampleBlock[i]) continue;
      if (!block || /^## /.test(block) || /^### /.test(block) || /^\|/.test(block) || /^[-*] /.test(block) || block.includes("](/s/")) continue;
      if (sentenceCount(block) > 6) continue;
      blocks[i] = `${block} ${linkSentence(pair.anchor, pair.slug)}`;
      placed = true;
      used += 1;
      break;
    }
    if (!placed) blocks.push(linkSentence(pair.anchor, pair.slug));
  }
  void used;
  const next = blocks.join("\n\n");
  return `${body.slice(0, slice.from)}${next}${body.slice(slice.end)}`;
}

function rewriteExampleSection(body, brief) {
  const bounds = [...body.matchAll(/^## .+$/gm)].map((item) => ({ title: item[0], index: item.index }));
  const example = bounds.find((item) => /пример/iu.test(item.title));
  if (!example) return body;
  const nextHeading = bounds.find((item) => item.index > example.index);
  const end = nextHeading ? nextHeading.index : body.length;
  const section = body.slice(example.index, end);
  const found = [];
  phrasesInBlob(section, found);
  const table = body.slice(0, end);
  for (const row of table.match(/^\|(.+)\|\s*$/gm) ?? []) {
    if (/^\|[\s|:-]+\|$/.test(row.trim())) continue;
    for (const cell of row.split("|").slice(1, -1)) pushPhrase(found, cell);
  }
  for (const fact of brief.facts ?? []) pushPhrase(found, fact);
  const min = brief.examplePhrases?.min ?? 8;
  const max = brief.examplePhrases?.max ?? 12;
  const phrases = found.slice(0, max);
  if (phrases.length < min) return body;
  const queries = (brief.additionalQueries ?? []).map((item) => (typeof item === "string" ? item : item?.text)).filter(Boolean);
  const kept = section.split(/\n\n+/).flatMap((paragraph) => sentencesWith(paragraph.replace(/^## .+\n?/u, ""), queries));
  const list = [...phrases.map((phrase) => `- ${phrase}`), ...kept].join("\n");
  const heading = example.title.startsWith("## ") ? example.title : `## ${example.title}`;
  const replacement = `${heading}\n\n${list}\n\n`;
  return `${body.slice(0, example.index)}${replacement}${body.slice(end)}`;
}
