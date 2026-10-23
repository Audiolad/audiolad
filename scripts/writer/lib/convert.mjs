// Converts a validated article JSON into the site format and updates repository files.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AUDIT_PATH, MASTER_PATH, REGISTRY_PATH } from "./context.mjs";

export const COUNT_TEST_FILES = [
  "scripts/geo-aeo-block2-unit.mjs",
  "scripts/articles-evergreen-dates-unit.mjs",
  "scripts/geo-aeo-stage2a2-unit.mjs",
];

export const TOPIC = {
  topicSlug: "pending-hub-reconciliation",
  topicTitle: "Статьи",
  topicHref: "/articles",
};

export function constName(slug) {
  return `${slug.replace(/-/g, "_").toUpperCase()}_ARTICLE`;
}

/** Builds the PracticeArticleDefinition object (plain data, field order as in existing articles). */
export function toDefinition(article, brief, publishedAt) {
  const iso = `${publishedAt}T00:00:00.000Z`;
  return {
    productContinuation: { kind: "practice" },
    slug: brief.slug,
    title: article.title,
    breadcrumbTitle: article.breadcrumbTitle,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    leadBeforeAudio: article.leadBeforeAudio,
    captionAfterAudio: "",
    primaryPracticeEyebrow: "Практика по теме статьи",
    primaryPracticeIntro: article.primaryPracticeIntro,
    shortAnswer: article.shortAnswer,
    authorLabel: "Редакция АудиоЛада",
    ...TOPIC,
    primaryPractice: { practiceKey: brief.primaryPractice.key },
    relatedPractices: brief.relatedPractices.map((practice) => ({
      practiceKey: practice.key,
      blurb: article.relatedPracticeBlurbs[practice.key],
    })),
    faq: article.faq.map((item) => ({ question: item.question, answer: item.answer })),
    introAfterAudio: article.introAfterAudio,
    sections: article.sections.map((section) => ({
      id: section.id,
      title: section.title,
      paragraphs: [],
      blocks: section.blocks.map((block) => {
        if (block.kind === "table") {
          return {
            kind: "table",
            ...(block.caption ? { caption: block.caption } : {}),
            columns: block.columns,
            rows: block.rows,
          };
        }
        if (block.kind === "rich_paragraph") {
          return {
            kind: "rich_paragraph",
            segments: block.segments.map((segment) =>
              "href" in segment ? { href: segment.href, label: segment.label } : segment,
            ),
          };
        }
        return block;
      }),
    })),
    finalAudioLead: "",
    seeAlsoLinks: article.seeAlsoLinks.map((link) => ({
      href: link.href,
      title: link.title,
      description: link.description,
    })),
    closingSection: { id: "glavnoe", title: "Главное", paragraphs: article.closingSection.paragraphs },
    publishedAt: iso,
    updatedAt: iso,
  };
}

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

function literal(value, indent) {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => `${inner}${literal(item, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return `{\n${entries
    .map(([key, item]) => `${inner}${IDENT_RE.test(key) ? key : JSON.stringify(key)}: ${literal(item, indent + 1)},`)
    .join("\n")}\n${pad}}`;
}

export function toTypeScript(definition, brief, modelLabel) {
  const source = [
    "// Сгенерировано «Райтер» (" + modelLabel + ") по брифу; правки – обычным ревью.",
    'import type { ArticleDefinition } from "../types";',
    "",
    `export const ${constName(brief.slug)} = ${literal(definition, 0)} as const satisfies ArticleDefinition;`,
    "",
  ].join("\n");
  if (source.includes("\u2014")) throw new Error("em dash в итоговом модуле");
  if (/[\u2010\u2011]/.test(source)) throw new Error("U+2010/U+2011 в итоговом модуле");
  return source;
}

export function updateRegistry(repoDir, slug) {
  const path = join(repoDir, REGISTRY_PATH);
  let text = readFileSync(path, "utf8");
  const name = constName(slug);
  const importLine = `import { ${name} } from "./content/${slug}";\n`;
  const typeImport = 'import type { ArticleDefinition } from "./types";';
  if (!text.includes(typeImport)) throw new Error("registry.ts: не найден импорт типов");
  text = text.replace(typeImport, `${importLine}${typeImport}`);
  const closing = "] as const satisfies readonly ArticleDefinition[];";
  if (!text.includes(closing)) throw new Error("registry.ts: не найден конец массива");
  text = text.replace(closing, `  ${name},\n${closing}`);
  writeFileSync(path, text);
}

/** N → N+1 in the count-asserting tests; refuses when the expected number is not found. */
export function bumpCountTests(repoDir, before) {
  const after = before + 1;
  const changed = [];
  for (const file of COUNT_TEST_FILES) {
    const path = join(repoDir, file);
    const text = readFileSync(path, "utf8");
    let hits = 0;
    const next = text
      .split("\n")
      .map((line) => {
        if (!/\.length/.test(line)) return line;
        return line.replace(new RegExp(`(?<![\\d.])${before}(?![\\d])`, "g"), () => {
          hits += 1;
          return String(after);
        });
      })
      .join("\n");
    if (!hits) throw new Error(`${file}: не найдено утверждение о количестве ${before}`);
    writeFileSync(path, next);
    changed.push({ file, hits });
  }
  return changed;
}

export function masterEntry(definition, brief, today) {
  const practice = brief.primaryPractice;
  return {
    articleId: `ART_new_${today.replace(/-/g, "")}_${brief.slug}`,
    articleIdStatus: "OPERATIONAL_ID_ASSIGNED",
    title: definition.title,
    slug: brief.slug,
    productionUrl: null,
    plannedUrl: `https://audiolad.ru/articles/${brief.slug}`,
    primaryQuery: brief.primaryKeyword,
    primaryQueryFrequency: brief.keywordFrequency,
    frequencyStatus: brief.keywordFrequency === null ? "UNVERIFIED" : "PROVIDED_BY_OWNER",
    status: "PLANNED",
    articleType: "practice",
    cluster: brief.cluster,
    hub: {
      slug: null,
      title: null,
      url: null,
      status: "PENDING_EXISTING_HUB_RECONCILIATION",
      note: "Generated by Райтер; no Topic Hub assigned and no new hub was created.",
    },
    practice: {
      key: practice.key,
      title: practice.title,
      slug: practice.key,
      productionUrl: `https://audiolad.ru${practice.href}`,
      authorPath: practice.authorPath,
      availabilityStatus: "PUBLISHED_CATALOG_CONFIRMED_PUBLIC_URL",
    },
    practiceRelevance: "ACCEPTABLE",
    publishedAt: definition.publishedAt,
    updatedAt: definition.updatedAt,
    validationStatus: "NOT_VALIDATED",
    sources: {
      type: "AUTHORITATIVE_EDITORIAL_MARKDOWN",
      evidence: "Draft generated by Райтер from an owner brief and validated by scripts/writer. Status stays PLANNED until review, deploy and a production smoke check.",
      operationalAddedAt: today,
    },
  };
}

export function auditEntry(entry) {
  return {
    articleId: entry.articleId,
    articleIdStatus: entry.articleIdStatus,
    slug: entry.slug,
    productionUrl: null,
    plannedUrl: entry.plannedUrl,
    primaryQuery: entry.primaryQuery,
    primaryQueryFrequency: entry.primaryQueryFrequency,
    frequencyStatus: entry.frequencyStatus,
    status: "PLANNED",
    cluster: entry.cluster,
    hubStatus: entry.hub.status,
    practiceKey: entry.practice.key,
    practiceAuthorPath: entry.practice.authorPath,
    practiceRelevance: entry.practiceRelevance,
    // seo-operational-master-unit: PLANNED audit entries must carry validationStatus PLANNED.
    validationStatus: "PLANNED",
    evidence: entry.sources.evidence,
    operationalAddedAt: entry.sources.operationalAddedAt,
  };
}

function indentBlock(json, spaces) {
  const pad = " ".repeat(spaces);
  return json
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

/** Appends to the master text-wise to keep its hand-formatted layout intact. */
export function updateOperational(repoDir, entry) {
  const masterPath = join(repoDir, MASTER_PATH);
  const master = readFileSync(masterPath, "utf8");
  const anchor = /\n {4}\}\n {2}\],\n {2}"nextQueue"/;
  if (!anchor.test(master)) throw new Error("SEO_OPERATIONAL_MASTER.json: не найден конец списка articles");
  const block = indentBlock(JSON.stringify(entry, null, 2), 4);
  const nextMaster = master.replace(anchor, `\n    },\n${block}\n  ],\n  "nextQueue"`);
  JSON.parse(nextMaster);
  writeFileSync(masterPath, nextMaster);

  const auditPath = join(repoDir, AUDIT_PATH);
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  audit.entries.push(auditEntry(entry));
  writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
}

export function applyToRepo(repoDir, article, brief, context, options) {
  const publishedAt = options.publishedAt;
  const definition = toDefinition(article, brief, publishedAt);
  const contentPath = `src/lib/seo/articles/content/${brief.slug}.ts`;
  writeFileSync(join(repoDir, contentPath), toTypeScript(definition, brief, options.modelLabel));
  updateRegistry(repoDir, brief.slug);
  const counts = bumpCountTests(repoDir, context.articles.length);
  const entry = masterEntry(definition, brief, options.today);
  updateOperational(repoDir, entry);
  return {
    definition,
    files: [contentPath, REGISTRY_PATH, MASTER_PATH, AUDIT_PATH, ...counts.map((c) => c.file)],
    counts,
    articleId: entry.articleId,
  };
}
