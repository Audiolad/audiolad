/**
 * Data model of a B2B vertical guide article (reference: «Кофе в зёрнах для кофейни»).
 *
 * The page renders these slots in a fixed order (docs/business/coffee-guides/TEMPLATE.md):
 * header → H1 + intro → «Четыре чашки» slider → partOne → atlas cover banner → table →
 * expertOne → partTwo → «10 кофеен» banner → expertTwo → steps → checklist → FAQ →
 * final cups block → «Читайте также». A new article only fills this data; it never
 * adds its own markup.
 */
export type TextPart = string | { href: string; label: string };

/** One paragraph made of plain text and internal links. */
export type GuideParagraph = TextPart[];

export type GuideChecklistItem = {
  id: string;
  text: string;
};

export type GuideExpertSlot = {
  expertId: string;
  /** Index into the registry quotes. The page prints that quote verbatim. */
  quoteIndex: number;
  /** Short heading of the thought, written by the editor (not a quote). */
  heading: string;
  /** Editorial text before the quote. Must not put words into the expert's mouth. */
  lead: GuideParagraph[];
  /**
   * Faithful Russian translation of a quote in another language. When present the page
   * shows the translation in the quote block, labels it as a translation and prints the
   * original verbatim under it.
   */
  translation?: string;
  /** Editorial explanation after the quote: what it means for a coffee shop. */
  after: GuideParagraph[];
};

export type GuideSection = {
  id: string;
  heading: string;
  paragraphs: GuideParagraph[];
  subsections?: Array<{
    heading: string;
    paragraphs: GuideParagraph[];
  }>;
};

export type GuideTable = {
  id: string;
  heading: string;
  intro: GuideParagraph[];
  /** Screen-reader caption of the table. */
  caption: string;
  columns: string[];
  /** Every row has exactly `columns.length` cells. */
  rows: string[][];
  after: GuideParagraph[];
};

export type GuideStep = {
  title: string;
  text: string;
};

export type GuideSteps = {
  id: string;
  heading: string;
  intro: string;
  items: readonly [GuideStep, GuideStep, GuideStep];
};

export type GuideChecklist = {
  title: string;
  /** localStorage key; unique per article. */
  storageKey: string;
  items: GuideChecklistItem[];
  /** Short caption under the list. */
  note: string;
  /** Caption shown when every item is ticked. */
  doneNote: string;
};

export type GuideFaqItem = {
  question: string;
  answer: string;
};

export type GuideLink = {
  href: string;
  label: string;
};

export type GuideFigure = {
  src: string;
  alt: string;
  caption: string;
};

export type VerticalGuideArticle = {
  verticalId: "coffee";
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  primaryQuery: string;
  /**
   * Related phrases. Frequency is a Wordstat monthly count from
   * docs/business/coffee-guides/wordstat-candidates.csv, or null when the
   * phrase is not in that file.
   */
  relatedQueries: Array<{ phrase: string; frequency: number | null; note: string }>;
  /** Social preview and JSON-LD image. Not rendered in the article header. */
  hero: GuideFigure;
  /** Paragraphs right under the H1. */
  intro: string[];
  /** Heading above the «Четыре чашки» slider. */
  question: string;
  partOne: GuideSection[];
  table: GuideTable;
  expertOne: GuideExpertSlot;
  partTwo: GuideSection[];
  expertTwo: GuideExpertSlot;
  steps: GuideSteps;
  checklist: GuideChecklist;
  faq: GuideFaqItem[];
  /** Bold lead-in question above the single four-cups picture at the bottom. */
  finalQuestion: string;
  /** Internal links only. */
  readMore: GuideLink[];
};

export type VerticalStatus = "active" | "planned";

export type B2BVertical = {
  id: string;
  status: VerticalStatus;
  /** Public article section. Must not reuse a reserved venue or atlas path. */
  path: string;
  title: string;
  kicker: string;
  byline?: string;
  intro: string;
  /** Venue landing reserved by the business page, when one exists. */
  reservedVenuePath: string | null;
};
