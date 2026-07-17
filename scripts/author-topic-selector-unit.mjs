#!/usr/bin/env node
/**
 * Author topic selector unit checks (no DB).
 */
import { readFileSync } from "node:fs";

import {
  assertPublishedTopicMinimum,
  assertTopicCountWithinLimit,
} from "../src/lib/topics/limits.ts";
import { mapTopicRpcError } from "../src/lib/topics/errors.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Mirrors TopicSelector active-count logic */
function countActiveSelected(value, options, archivedTopics) {
  const optionKeys = new Set(options.map((option) => option.key));
  const archivedKeySet = new Set(archivedTopics.map((topic) => topic.key));

  return value.filter(
    (key) => optionKeys.has(key) && !archivedKeySet.has(key),
  ).length;
}

function toggleTopic(value, key, options, archivedTopics, limit) {
  if (value.includes(key)) {
    return value.filter((item) => item !== key);
  }

  const activeCount = countActiveSelected(value, options, archivedTopics);

  if (activeCount >= limit) {
    return value;
  }

  return [...value, key];
}

const topicSelector = readFileSync(
  "src/components/author-products/TopicSelector.tsx",
  "utf8",
);
const authorForm = readFileSync(
  "src/components/author-dashboard/AuthorProductForm.tsx",
  "utf8",
);
const topicsRoute = readFileSync(
  "src/app/api/author/products/[id]/topics/route.ts",
  "utf8",
);
const topicFormData = readFileSync(
  "src/lib/author-products/topic-form-data.ts",
  "utf8",
);
const syncLib = readFileSync("src/lib/topics/sync.ts", "utf8");
const newPage = readFileSync(
  "src/app/author-dashboard/products/new/page.tsx",
  "utf8",
);
const editPage = readFileSync(
  "src/app/author-dashboard/products/[id]/page.tsx",
  "utf8",
);
const publishRoute = readFileSync(
  "src/app/api/author/products/[id]/publish/route.ts",
  "utf8",
);

assert(!topicSelector.includes("<input"), "TopicSelector has no free-text input");
assert(!topicSelector.includes("allowCreate"), "TopicSelector has no create flow");
assert(!topicSelector.includes("textarea"), "TopicSelector has no textarea");
assert(topicSelector.includes("options"), "options come through props");
assert(topicSelector.includes("limit"), "limit comes through props");
assert(!topicSelector.includes("MAX_TOPICS"), "limit is not hardcoded in UI");
assert(topicSelector.includes("Выбрано"), "counter is present");
assert(topicSelector.includes("из {limit}"), "counter uses limit prop");
assert(topicSelector.includes("aria-pressed"), "chip buttons use aria-pressed");
assert(topicSelector.includes('type="button"'), "uses real button elements");
assert(!/<div[^>]*onClick/.test(topicSelector), "no div onClick pattern");
assert(topicSelector.includes("min-h-11"), "touch target sizing");

assert(authorForm.includes("TopicSelector"), "AuthorProductForm wires TopicSelector");
assert(authorForm.includes("topicFormData"), "form receives server topic data via props");
assert(newPage.includes("loadAuthorProductTopicFormData"), "create page loads topics on server");
assert(editPage.includes("loadAuthorProductTopicFormData"), "edit page loads assigned topics");
assert(newPage.includes("topicFormData={topicFormData}"), "create passes topic props");
assert(editPage.includes("topicFormData={topicFormData}"), "edit passes topic props");
assert(!authorForm.includes("useEffect") || !authorForm.includes("listActiveTopics"), "no client useEffect topic fetch");

assert(topicsRoute.includes("setPracticeTopics"), "save uses setPracticeTopics RPC wrapper");
assert(syncLib.includes('rpc("set_practice_topics"'), "sync calls set_practice_topics RPC");
assert(
  !topicsRoute.includes('.from("practice_topics").insert'),
  "no direct insert into practice_topics",
);
assert(
  !authorForm.includes('.from("practice_topics")'),
  "form does not write practice_topics directly",
);

assert(authorForm.includes("syncProductTopics"), "form syncs topics on save");
assert(authorForm.includes("getActiveTopicKeysForSync"), "archived keys excluded from sync payload");
assert(authorForm.includes("assertPublishedTopicMinimum"), "publish checks topic minimum");
assert(publishRoute.includes("topic_min_required") || publishRoute.includes("mapped.code"), "publish maps topic errors");

assert(topicFormData.includes("listActiveTopics"), "server loads active directory");
assert(topicFormData.includes("resolveAuthorTopicLimit"), "server resolves topic limit");
assert(topicFormData.includes("getPracticeTopics"), "edit loads assigned topics");

const options = [
  { key: "money", title: "Деньги", isActive: true },
  { key: "love", title: "Любовь", isActive: true },
  { key: "health", title: "Здоровье", isActive: true },
  { key: "work", title: "Работа", isActive: true },
];
const archived = [{ key: "legacy", title: "Старая тема", isActive: false, isArchived: true }];
const limit = 3;

let value = [];
assert(countActiveSelected(value, options, archived) === 0, "draft starts with 0 active topics");

value = toggleTopic(value, "money", options, archived, limit);
assert(value.length === 1 && value[0] === "money", "can select first topic");

value = toggleTopic(value, "love", options, archived, limit);
value = toggleTopic(value, "health", options, archived, limit);
assert(countActiveSelected(value, options, archived) === 3, "three active topics selected");

const blocked = toggleTopic(value, "work", options, archived, limit);
assert(blocked.length === 3, "fourth topic is not added at limit=3");

value = toggleTopic(value, "health", options, archived, limit);
assert(value.length === 2, "can deselect a chosen topic");

const withArchived = [...value, "legacy"];
assert(
  countActiveSelected(withArchived, options, archived) === value.length,
  "archived topic does not increase active limit count",
);

assert(
  topicSelector.includes("Архивная тема"),
  "archived topic label is shown",
);

const draftMin = assertPublishedTopicMinimum(0);
assert(draftMin.ok === false, "publish without active topic returns topic_min_required");

const limitError = assertTopicCountWithinLimit(4, 3);
assert(limitError.ok === false, "topic_limit_exceeded when over limit");

const notFound = mapTopicRpcError("topic_not_found");
assert(
  notFound.message === "Выбранная тема недоступна.",
  "topic_not_found maps to user message",
);

const limitExceeded = mapTopicRpcError("topic_limit_exceeded");
assert(
  limitExceeded.message.includes("3"),
  "topic_limit_exceeded maps to user message",
);

assert(
  topicsRoute.includes("requirePracticeAccess"),
  "topics route checks author access for foreign products",
);

assert(
  authorForm.includes("reloadSavedProduct") && authorForm.includes("/topics"),
  "reload fetches topics after save",
);

console.log("author-topic-selector-unit: ok");
