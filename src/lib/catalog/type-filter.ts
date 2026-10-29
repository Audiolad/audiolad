import type { CatalogClassFilter } from "./listing-contract";

/** Listing types refine the existing publication classes; stories are not a DB class. */
export type CatalogTypeRow = {
  publication_class?: string | null;
  product_kind?: string | null;
  catalog_section?: string | null;
  format?: string | null;
};

type Predicate =
  | { field: keyof CatalogTypeRow; value: string | null; negate?: boolean }
  | { op: "and" | "or"; args: Predicate[] };

const eq = (field: keyof CatalogTypeRow, value: string | null): Predicate => ({ field, value });
const and = (...args: Predicate[]): Predicate => ({ op: "and", args });
const or = (...args: Predicate[]): Predicate => ({ op: "or", args });

const legacyClass = (kind: string): Predicate => and(
  eq("publication_class", null),
  kind === "practice"
    ? or(eq("product_kind", kind), eq("product_kind", null))
    : eq("product_kind", kind),
);
const publicationClass = (value: string, kind: string): Predicate => or(
  eq("publication_class", value), legacyClass(kind),
);
const practiceClass = publicationClass("practice", "practice");
const postFormat = or(eq("format", "Аудиопост"), eq("format", "Аудиоэфир"));
const story = or(eq("catalog_section", "stories"), eq("format", "Аудиоистория"));

// Practice formats include custom author labels. Known non-practice
// formats/sections are excluded even on legacy publication_class=practice rows.
const nonPracticeFormats = [
  "Аудиоистория", "Аудиопост", "Аудиоэфир", "Аудиокурс", "Аудиокнига",
  "Лекция", "Музыка", "Музыкальный трек", "Музыкальный альбом", "Медитативная музыка",
];

function notValues(field: keyof CatalogTypeRow, values: string[]): Predicate {
  // Represent NOT IN with nullable-safe predicates in the same tree used below.
  return and(...values.map((value) => ({ field, value, negate: true })));
}

function typePredicate(filter: CatalogClassFilter): Predicate | null {
  switch (filter) {
    case "all": return null;
    case "practice": return and(
      practiceClass,
      notValues("catalog_section", ["music", "education", "stories", "books"]),
      notValues("format", nonPracticeFormats),
    );
    case "stories": return and(practiceClass, story, notValues("format", ["Аудиопост", "Аудиоэфир"]));
    case "post": return or(publicationClass("post", "audio_post"), and(practiceClass, postFormat));
    case "release": return publicationClass("release", "music");
    case "course": return eq("publication_class", "course");
    case "audiobook": return eq("publication_class", "audiobook");
  }
}

function serialize(predicate: Predicate): string {
  if ("op" in predicate) {
    return `${predicate.op}(${predicate.args.map(serialize).join(",")})`;
  }
  const { field, value, negate } = predicate;
  if (value === null) return `${field}.is.null`;
  if (negate) {
    return `or(${field}.is.null,${field}.neq.${JSON.stringify(value)})`;
  }
  return `${field}.eq.${JSON.stringify(value)}`;
}

/** Passed to PostgREST .or() before search limits and listing pagination. */
export function catalogTypeQueryFilter(filter: CatalogClassFilter): string | null {
  const predicate = typePredicate(filter);
  return predicate ? serialize(predicate) : null;
}

function matches(row: CatalogTypeRow, predicate: Predicate): boolean {
  if ("op" in predicate) {
    return predicate.op === "and"
      ? predicate.args.every((arg) => matches(row, arg))
      : predicate.args.some((arg) => matches(row, arg));
  }
  const actual = row[predicate.field] ?? null;
  return predicate.negate
    ? actual !== predicate.value
    : actual === predicate.value;
}

export function matchesCatalogProductType(row: CatalogTypeRow, filter: CatalogClassFilter): boolean {
  const predicate = typePredicate(filter);
  return predicate === null || matches(row, predicate);
}
