export type TextPart = string | { href: string; label: string };

export type GuideCup = {
  id: string;
  title: string;
  text: string;
};

export type GuideChecklistItem = {
  id: string;
  text: string;
};

export type GuideExpertSlot = {
  expertId: string;
  /** Index into the registry quotes. The page prints that quote verbatim. */
  quoteIndex: number;
  /** Editorial bridge. Must not repeat the quote as if the expert had said something else. */
  bridge: string;
  /** Optional second verbatim quote from the same answer, with its own bridge. */
  secondQuoteIndex?: number;
  secondBridge?: string;
  /** Editorial translation of an original-language quote. Never marked as the speaker's words. */
  translation?: string;
};

export type GuideSection = {
  id: string;
  heading: string;
  paragraphs: TextPart[][];
  subsections?: Array<{
    heading: string;
    paragraphs: TextPart[][];
  }>;
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
  /** Related phrases. Frequency stays null unless a committed SEO plan supplies it. */
  relatedQueries: Array<{ phrase: string; frequency: null; note: string }>;
  hero: GuideFigure;
  story: string[];
  leadIn: string;
  question: string;
  cups: readonly [GuideCup, GuideCup, GuideCup, GuideCup];
  playerLead: TextPart[];
  track: { authorSlug: string; productSlug: string };
  trackPagePath: string;
  checklistTitle: string;
  checklistStorageKey: string;
  checklist: GuideChecklistItem[];
  experts: readonly [GuideExpertSlot, GuideExpertSlot];
  sections: GuideSection[];
  faq: GuideFaqItem[];
  further: GuideLink[];
};

export type VerticalStatus = "active" | "planned";

export type B2BVertical = {
  id: string;
  status: VerticalStatus;
  /** Public article section. Must not reuse a reserved venue or atlas path. */
  path: string;
  title: string;
  kicker: string;
  intro: string;
  /** Venue landing reserved by the business page, when one exists. */
  reservedVenuePath: string | null;
};
