#!/usr/bin/env node
/**
 * Static regression checks for profile/author shell integration.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

const authorDashboardClient = read(
  "src/components/author-dashboard/AuthorDashboardClient.tsx",
);
const authorPromotionClient = read(
  "src/components/author-dashboard/AuthorPromotionClient.tsx",
);
const globals = read("src/app/globals.css");

assert(
  !authorDashboardClient.includes(
    "Вернуться в пользовательскую часть платформы",
  ),
  "AuthorDashboardClient must not duplicate Audiolad exit text link",
);

assert(
  !authorPromotionClient.includes(
    "Вернуться в пользовательскую часть платформы",
  ),
  "AuthorPromotionClient must not duplicate Audiolad exit text link",
);

assert(
  globals.includes(".listener-app-shell__body--no-right-column"),
  "globals.css must define no-right-column grid override",
);

assert(
  globals.includes(".listener-app-shell__body--no-mobile-bottom-nav"),
  "globals.css must define author mobile padding override",
);

console.log("listener-shell-integration-unit: ok");
