#!/usr/bin/env node
/**
 * Continue Listening overlay card UI contract checks.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testCoverOverlayCardStructure() {
  const source = readFileSync("src/components/home/CoverOverlayCard.tsx", "utf8");

  assert(source.includes("ProductCoverThumbnail"), "cover overlay uses product thumbnail");
  assert(source.includes("rounded-[28px]"), "cover overlay keeps large card radius");
  assert(source.includes("object-cover") || source.includes("h-full w-full"), "cover fills card area");
  assert(source.includes("bg-gradient-to-t"), "cover overlay adds bottom gradient");
  assert(source.includes("bg-gradient-to-r"), "cover overlay adds side gradient");
  assert(!source.includes("listenHref"), "cover overlay has no business logic");
}

function testContinueListeningUsesOverlayCard() {
  const source = readFileSync("src/components/home/ContinueListening.tsx", "utf8");

  assert(source.includes("CoverOverlayCard"), "continue listening uses overlay card");
  assert(source.includes("item.listenHref"), "continue listening keeps listen href");
  assert(source.includes("product.href"), "continue listening keeps product href");
  assert(source.includes("item.progressLabel"), "continue listening keeps progress label");
  assert(source.includes("item.progressPercent"), "continue listening keeps progress percent");
  assert(source.includes("line-clamp-2"), "title clamps to two lines");
  assert(!source.includes("bg-white p-4"), "white split card layout removed");
}

function testContinueListeningLinksAreSeparate() {
  const source = readFileSync("src/components/home/ContinueListening.tsx", "utf8");

  const linkCount = (source.match(/<Link/g) ?? []).length;
  assert(linkCount === 2, "continue card exposes separate product and listen links");

  assert(
    !source.includes("<Link") || !source.match(/<Link[\s\S]*<Link[\s\S]*<\/Link[\s\S]*<\/Link/),
    "links are not nested",
  );
}

function testContinueListeningProgramFieldsOptional() {
  const source = readFileSync("src/components/home/ContinueListening.tsx", "utf8");

  assert(source.includes("currentTrackTitle"), "program track title remains optional");
  assert(source.includes("stepLabel"), "program step label remains optional");
}

const tests = [
  ["cover overlay card structure", testCoverOverlayCardStructure],
  ["continue listening uses overlay card", testContinueListeningUsesOverlayCard],
  ["continue listening links are separate", testContinueListeningLinksAreSeparate],
  ["continue listening program fields optional", testContinueListeningProgramFieldsOptional],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok ${name}`);
}

console.log(`${tests.length} continue-listening ui checks passed`);
