/**
 * Data model of a B2B vertical guide article (reference: «Кофе в зёрнах для кофейни»).
 *
 * The page renders these slots in a fixed order (docs/business/coffee-guides/TEMPLATE.md):
 * header → H1 + intro → «Четыре чашки» slider → partOne[0] → atlas cover banner →
 * partOne[1] → table → partTwo[0] → expertOne → partTwo[1] → «10 кофеен» banner →
 * partTwo[2] → expertTwo → steps → checklist → FAQ → final cups block → «Читайте также».
 * Text and inserts alternate: never two text sections in a row. A new article only fills
 * this data; it never adds its own markup.
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

/** Generated text card (own artwork, not a photo) for social previews and JSON-LD. */
export type GuideOgImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
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
  /**
   * ISO dates (YYYY-MM-DD). Owner decision: never rendered on the page.
   * Used only in JSON-LD Article, sitemap lastmod and article:*_time meta.
   */
  publishedAt: string;
  updatedAt: string;
  /** Social preview and JSON-LD image. Not rendered in the article header. */
  hero: GuideFigure;
  /** Text card for og:image and JSON-LD (public/images/b/coffee/og/<slug>.png). */
  ogImage: GuideOgImage;
  /** Paragraphs right under the H1 (may carry internal links). */
  intro: GuideParagraph[];
  /** «Коротко» box under the intro: 3–5 one-sentence takeaways. */
  summary: string[];
  /** Lead-in above the «Четыре чашки» slider (shown after partOne[0], not a heading). */
  question: string;
  /** [0] before the «Четыре чашки» slider, [1] before the table. */
  partOne: [GuideSection, GuideSection];
  table: GuideTable;
  expertOne: GuideExpertSlot;
  /** [0] before expertOne, [1] before the «10 кофеен» banner, [2] before expertTwo. */
  partTwo: [GuideSection, GuideSection, GuideSection];
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
  /** «О разделе» block on the section index (anchor #o-razdele); byline links there. */
  about?: string[];
  /** Venue landing reserved by the business page, when one exists. */
  reservedVenuePath: string | null;
};
