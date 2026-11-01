import { BIZNES_PLAN_KOFEYNI } from "./articles/biznes-plan-kofeyni";
import { CHTO_NUZHNO_DLYA_OTKRYTIYA_KOFEYNI } from "./articles/chto-nuzhno-dlya-otkrytiya-kofeyni";
import { BARNAYA_STOYKA_DLYA_KOFEYNI } from "./articles/barnaya-stoyka-dlya-kofeyni";
import { OPISANIE_BIZNESA_KOFEYNI } from "./articles/opisanie-biznesa-kofeyni";
import { PECHENE_DLYA_KOFEYNI } from "./articles/pechene-dlya-kofeyni";
import { KOFE_V_ZERNAH_DLYA_KOFEYNI } from "./articles/kofe-v-zernah-dlya-kofeyni";
import { STOLIKI_DLYA_KOFEYNI } from "./articles/stoliki-dlya-kofeyni";
import { KAK_VYBRAT_KOFEMASHINU_DLYA_KOFEYNI } from "./articles/kak-vybrat-kofemashinu-dlya-kofeyni";
import { STAKANCHIKI_DLYA_KOFEYNI } from "./articles/stakanchiki-dlya-kofeyni";
import { KOFEYNYA_SAMOOBSLUZHIVANIYA } from "./articles/kofeynya-samoobsluzhivaniya";
import { CHTO_ZAKUPIT_DLYA_KOFEYNI } from "./articles/chto-zakupit-dlya-kofeyni";
import { OSENNIE_NAPITKI_DLYA_KOFEYNI } from "./articles/osennie-napitki-dlya-kofeyni";
import { KAK_OTKRYT_KOFEYNYU_V_MOSKVE } from "./articles/kak-otkryt-kofeynyu-v-moskve";
import { KOFEYNYA_V_BIZNES_TSENTRE } from "./articles/kofeynya-v-biznes-tsentre";
import { CHASHKI_DLYA_KOFEYNI } from "./articles/chashki-dlya-kofeyni";
import { KAK_GOTOVYAT_KOFE_V_KOFEYNE } from "./articles/kak-gotovyat-kofe-v-kofeyne";
import { FOTO_DLYA_KOFEYNI } from "./articles/foto-dlya-kofeyni";
import { KAK_NAZVAT_KOFEYNYU } from "./articles/kak-nazvat-kofeynyu";
import { FRANSHIZA_KOFEYNI_SAMOOBSLUZHIVANIYA } from "./articles/franshiza-kofeyni-samoobsluzhivaniya";
import { GOTOVAYA_EDA_DLYA_KOFEYNI } from "./articles/gotovaya-eda-dlya-kofeyni";
import { VIDY_KOFE_V_KOFEYNE } from "./articles/vidy-kofe-v-kofeyne";
import { OFORMLENIE_KOFEYNI } from "./articles/oformlenie-kofeyni";
import { VYVESKA_DLYA_KOFEYNI } from "./articles/vyveska-dlya-kofeyni";
import { DIZAYNER_KOFEYNI } from "./articles/dizayner-kofeyni";
import { PRILOZHENIE_DLYA_KOFEYNI } from "./articles/prilozhenie-dlya-kofeyni";
import { PLANIROVKA_KOFEYNI } from "./articles/planirovka-kofeyni";
import type { GuideParagraph, TextPart, VerticalGuideArticle } from "./types";
import { getVertical } from "./verticals";

const ARTICLES: readonly VerticalGuideArticle[] = [KOFE_V_ZERNAH_DLYA_KOFEYNI, BIZNES_PLAN_KOFEYNI, CHTO_NUZHNO_DLYA_OTKRYTIYA_KOFEYNI, BARNAYA_STOYKA_DLYA_KOFEYNI, OPISANIE_BIZNESA_KOFEYNI, PECHENE_DLYA_KOFEYNI, STOLIKI_DLYA_KOFEYNI, KAK_VYBRAT_KOFEMASHINU_DLYA_KOFEYNI, STAKANCHIKI_DLYA_KOFEYNI, KOFEYNYA_SAMOOBSLUZHIVANIYA, CHTO_ZAKUPIT_DLYA_KOFEYNI, OSENNIE_NAPITKI_DLYA_KOFEYNI, KAK_OTKRYT_KOFEYNYU_V_MOSKVE, KOFEYNYA_V_BIZNES_TSENTRE, CHASHKI_DLYA_KOFEYNI, KAK_GOTOVYAT_KOFE_V_KOFEYNE, FOTO_DLYA_KOFEYNI, KAK_NAZVAT_KOFEYNYU, FRANSHIZA_KOFEYNI_SAMOOBSLUZHIVANIYA, GOTOVAYA_EDA_DLYA_KOFEYNI, VIDY_KOFE_V_KOFEYNE, OFORMLENIE_KOFEYNI, VYVESKA_DLYA_KOFEYNI, DIZAYNER_KOFEYNI, PRILOZHENIE_DLYA_KOFEYNI, PLANIROVKA_KOFEYNI];

export function listVerticalArticles(verticalId?: string): VerticalGuideArticle[] {
  return ARTICLES.filter((article) => !verticalId || article.verticalId === verticalId);
}

export function getVerticalArticle(verticalId: string, slug: string): VerticalGuideArticle | null {
  return (
    ARTICLES.find((article) => article.verticalId === verticalId && article.slug === slug) ?? null
  );
}

export function buildVerticalArticlePath(verticalId: string, slug: string): string | null {
  const vertical = getVertical(verticalId);
  if (!vertical || vertical.status !== "active") {
    return null;
  }
  return `${vertical.path}/${slug}`;
}

export function articlePath(article: VerticalGuideArticle): string {
  const path = buildVerticalArticlePath(article.verticalId, article.slug);
  if (!path) {
    throw new Error(`Article ${article.slug} has no active vertical path`);
  }
  return path;
}

function walkParagraphs(blocks: readonly GuideParagraph[], onPart: (part: TextPart) => void): void {
  for (const paragraph of blocks) {
    for (const part of paragraph) {
      onPart(part);
    }
  }
}

function articleParagraphBlocks(article: VerticalGuideArticle): GuideParagraph[] {
  const blocks: GuideParagraph[] = [...article.intro];
  for (const section of [...article.partOne, ...article.partTwo]) {
    blocks.push(...section.paragraphs);
    for (const subsection of section.subsections ?? []) {
      blocks.push(...subsection.paragraphs);
    }
  }
  blocks.push(...article.table.intro, ...article.table.after);
  for (const slot of [article.expertOne, article.expertTwo]) {
    blocks.push(...slot.lead, ...slot.after);
  }
  return blocks;
}

/** Every editorial string of the article (for typography and wording checks). */
export function collectArticleText(article: VerticalGuideArticle): string[] {
  const parts: string[] = [
    article.title,
    article.seoTitle,
    article.description,
    ...article.summary,
    article.ogImage.alt,
    article.question,
    article.hero.caption,
    article.hero.alt,
    ...[...article.partOne, ...article.partTwo].flatMap((section) => [
      section.heading,
      ...(section.subsections ?? []).map((subsection) => subsection.heading),
    ]),
    article.table.heading,
    article.table.caption,
    ...article.table.columns,
    ...article.table.rows.flat(),
    ...[article.expertOne, article.expertTwo].flatMap((slot) =>
      [slot.heading, slot.translation].filter((item): item is string => Boolean(item)),
    ),
    article.steps.heading,
    article.steps.intro,
    ...article.steps.items.flatMap((step) => [step.title, step.text]),
    article.checklist.title,
    article.checklist.note,
    article.checklist.doneNote,
    ...article.checklist.items.map((item) => item.text),
    ...article.faq.flatMap((item) => [item.question, item.answer]),
    article.finalQuestion,
    ...article.readMore.map((link) => link.label),
  ];
  walkParagraphs(articleParagraphBlocks(article), (part) => {
    parts.push(typeof part === "string" ? part : part.label);
  });
  return parts;
}

/** Every link target the article renders from its data (must all be internal). */
export function collectArticleHrefs(article: VerticalGuideArticle): string[] {
  const hrefs = article.readMore.map((link) => link.href);
  walkParagraphs(articleParagraphBlocks(article), (part) => {
    if (typeof part !== "string") {
      hrefs.push(part.href);
    }
  });
  return hrefs;
}
