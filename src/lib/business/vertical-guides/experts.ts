import registryJson from "@/content/business/coffee-experts.registry.json";

export type ExpertOrigin = "ru" | "foreign";
export type ExpertGender = "woman" | "man";

export type ExpertQuote = {
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceDate: string | null;
  context: string;
  /** Language of `text`. A quote that is not Russian is shown with a labelled translation. */
  language?: "ru" | "en";
  /** Plain-text source line printed on the page after «Источник:». Never a URL. */
  sourceLabel?: string;
};

export type CoffeeExpert = {
  id: string;
  name: string;
  nameOriginal: string;
  country: string;
  countryCode: string;
  origin: ExpertOrigin;
  gender: ExpertGender;
  role: string;
  competence: string;
  competenceUrl: string;
  /**
   * Required: an expert without a real, freely licensed portrait does not go into the registry
   * (no initials placeholders). `credit` is printed on the page and must be Russian only.
   */
  photo: {
    file: string;
    commonsPage: string;
    license: string;
    licenseUrl: string;
    author: string;
    credit: string;
    rightsNote: string;
  };
  quotes: ExpertQuote[];
};

const ALLOWED_LICENSES = new Set([
  "CC0",
  "CC BY 2.0",
  "CC BY 3.0",
  "CC BY 4.0",
  "CC BY-SA 2.0",
  "CC BY-SA 3.0",
  "CC BY-SA 4.0",
]);

/** Latin letters are not allowed in anything the guide prints (owner rule, 2026-10-29). */
export const HAS_LATIN = /[A-Za-z]/;

export const COFFEE_EXPERTS = registryJson.experts as unknown as readonly CoffeeExpert[];

export function getCoffeeExpert(id: string): CoffeeExpert | null {
  return COFFEE_EXPERTS.find((expert) => expert.id === id) ?? null;
}

export function expertQuote(expert: CoffeeExpert, index: number): ExpertQuote {
  const quote = expert.quotes[index];
  if (!quote) {
    throw new Error(`Coffee expert ${expert.id} has no quote at index ${index}`);
  }
  return quote;
}

/** Pure checks for the registry. Throws on the first broken record. */
export function assertCoffeeExpertRegistry(experts: readonly CoffeeExpert[] = COFFEE_EXPERTS): void {
  const ids = new Set<string>();
  for (const expert of experts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expert.id)) {
      throw new Error(`Bad expert id: ${expert.id}`);
    }
    if (ids.has(expert.id)) {
      throw new Error(`Duplicate expert id: ${expert.id}`);
    }
    ids.add(expert.id);
    if (expert.origin === "ru" && expert.countryCode !== "RU") {
      throw new Error(`${expert.id}: Russian origin requires countryCode RU`);
    }
    if (expert.origin === "foreign" && expert.countryCode === "RU") {
      throw new Error(`${expert.id}: foreign origin cannot be RU`);
    }
    if (expert.quotes.length < 1 || expert.quotes.length > 2) {
      throw new Error(`${expert.id}: need 1 or 2 quotes`);
    }
    if (!expert.photo) {
      throw new Error(`${expert.id}: a real portrait is required, no initials placeholders`);
    }
    if (!ALLOWED_LICENSES.has(expert.photo.license)) {
      throw new Error(`${expert.id}: license ${expert.photo.license} is not in the allowlist`);
    }
    if (!expert.photo.file.startsWith("/business/coffee-guides/experts/")) {
      throw new Error(`${expert.id}: photo must live in the guide portrait folder`);
    }
    if (!expert.photo.credit || /https?:\/\//.test(expert.photo.credit)) {
      throw new Error(`${expert.id}: visible credit must name the author without a URL`);
    }
    if (HAS_LATIN.test(expert.photo.credit)) {
      throw new Error(`${expert.id}: visible photo credit must be Russian only`);
    }
    for (const quote of expert.quotes) {
      if (quote.text.trim().length < 40) {
        throw new Error(`${expert.id}: quote is too short to be a real passage`);
      }
      if (!quote.sourceUrl.startsWith("https://")) {
        throw new Error(`${expert.id}: quote source must be an https URL`);
      }
      if (!quote.context.trim()) {
        throw new Error(`${expert.id}: quote context is required`);
      }
      if (quote.sourceLabel !== undefined && (!quote.sourceLabel.trim() || /https?:\/\/|www\./.test(quote.sourceLabel))) {
        throw new Error(`${expert.id}: source label must be plain text without a URL`);
      }
    }
  }
}

export function countExperts(experts: readonly CoffeeExpert[] = COFFEE_EXPERTS): {
  total: number;
  women: number;
  men: number;
  russian: number;
  foreign: number;
  russianWomen: number;
  russianMen: number;
  foreignWomen: number;
  foreignMen: number;
} {
  const women = experts.filter((expert) => expert.gender === "woman");
  const men = experts.filter((expert) => expert.gender === "man");
  const russian = experts.filter((expert) => expert.origin === "ru");
  const foreign = experts.filter((expert) => expert.origin === "foreign");
  return {
    total: experts.length,
    women: women.length,
    men: men.length,
    russian: russian.length,
    foreign: foreign.length,
    russianWomen: russian.filter((expert) => expert.gender === "woman").length,
    russianMen: russian.filter((expert) => expert.gender === "man").length,
    foreignWomen: foreign.filter((expert) => expert.gender === "woman").length,
    foreignMen: foreign.filter((expert) => expert.gender === "man").length,
  };
}
