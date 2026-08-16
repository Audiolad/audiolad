import type { ListenPageDefinition } from "./types";

const validListen: ListenPageDefinition = {
  type: "listen",
  slug: "type-contract",
  title: "Type contract",
  description: "Type contract",
  h1: "Type contract",
  intro: ["Intro"],
  playlistSlug: "editorial-playlist-slug",
  sections: [],
  faq: [],
};

// @ts-expect-error A listen definition must always state type: "listen".
const listenWithoutType: ListenPageDefinition = {
  slug: "type-contract",
  title: "Type contract",
  description: "Type contract",
  h1: "Type contract",
  intro: ["Intro"],
  playlistSlug: "editorial-playlist-slug",
  sections: [],
  faq: [],
};

const listenWithHardcodedItems: ListenPageDefinition = {
  type: "listen",
  slug: "type-contract",
  title: "Type contract",
  description: "Type contract",
  h1: "Type contract",
  intro: ["Intro"],
  playlistSlug: "editorial-playlist-slug",
  sections: [],
  faq: [],
  // @ts-expect-error Listen definitions cannot store hardcoded playlist items.
  items: [{ practiceId: "x" }],
};

const listenWithPracticeSlugs: ListenPageDefinition = {
  type: "listen",
  slug: "type-contract",
  title: "Type contract",
  description: "Type contract",
  h1: "Type contract",
  intro: ["Intro"],
  playlistSlug: "editorial-playlist-slug",
  sections: [],
  faq: [],
  // @ts-expect-error Listen definitions cannot store practice slugs.
  practiceSlugs: ["practice-a"],
};

void validListen;
void listenWithoutType;
void listenWithHardcodedItems;
void listenWithPracticeSlugs;
