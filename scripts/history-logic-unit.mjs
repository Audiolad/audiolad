#!/usr/bin/env node

import {
  aggregateProgressByPractice,
  filterHistoryItems,
  getHistoryPeriod,
  groupHistoryItems,
  parseHistoryFilter,
} from "../src/lib/history/logic.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeItem(overrides) {
  return {
    practiceId: overrides.practiceId,
    title: overrides.title ?? "Practice",
    authorName: overrides.authorName ?? "Author",
    authorSlug: overrides.authorSlug ?? "author",
    productSlug: overrides.productSlug ?? "product",
    formatLabel: overrides.formatLabel ?? "Медитация",
    metaLabel: overrides.metaLabel ?? null,
    coverUrl: overrides.coverUrl ?? null,
    isProgram: overrides.isProgram ?? false,
    stepLabel: overrides.stepLabel ?? null,
    progressPercent: overrides.progressPercent ?? 50,
    progressLabel: overrides.progressLabel ?? "Продолжить",
    status: overrides.status ?? "in-progress",
    lastActivityAt: overrides.lastActivityAt,
    lastActivityLabel: overrides.lastActivityLabel ?? "",
    canListen: overrides.canListen ?? true,
    actionLabel: overrides.actionLabel ?? "Продолжить",
    actionHref: overrides.actionHref ?? "/listen/author/product",
  };
}

function testParseHistoryFilter() {
  assert(parseHistoryFilter(undefined) === "all", "default filter is all");
  assert(parseHistoryFilter("in-progress") === "in-progress", "in-progress filter");
  assert(parseHistoryFilter("completed") === "completed", "completed filter");
  assert(parseHistoryFilter("unknown") === "all", "unknown filter falls back to all");
}

function testAggregateProgressByPractice() {
  const aggregated = aggregateProgressByPractice([
    {
      practice_id: "p1",
      audio_item_id: "a1",
      position_seconds: 10,
      completed: false,
      updated_at: "2026-07-15T10:00:00.000Z",
    },
    {
      practice_id: "p1",
      audio_item_id: "a2",
      position_seconds: 0,
      completed: false,
      updated_at: "2026-07-16T12:00:00.000Z",
    },
    {
      practice_id: "p2",
      audio_item_id: "b1",
      position_seconds: 100,
      completed: true,
      updated_at: "2026-07-14T08:00:00.000Z",
    },
  ]);

  assert(aggregated.length === 2, "aggregates by practice");
  assert(aggregated[0].practiceId === "p1", "sorts by latest updated_at desc");
  assert(aggregated[0].rows.length === 2, "merges rows for same practice");
}

function testFilterHistoryItems() {
  const items = [
    makeItem({
      practiceId: "p1",
      status: "in-progress",
      lastActivityAt: "2026-07-16T12:00:00.000Z",
    }),
    makeItem({
      practiceId: "p2",
      status: "completed",
      lastActivityAt: "2026-07-15T10:00:00.000Z",
    }),
  ];

  assert(filterHistoryItems(items, "all").length === 2, "all filter keeps all");
  assert(
    filterHistoryItems(items, "in-progress").length === 1,
    "in-progress filter keeps only active",
  );
  assert(
    filterHistoryItems(items, "completed").length === 1,
    "completed filter keeps only completed",
  );
}

function testGetHistoryPeriod() {
  const now = new Date("2026-07-16T15:00:00.000Z");

  assert(
    getHistoryPeriod("2026-07-16T08:00:00.000Z", now) === "today",
    "same day is today",
  );
  assert(
    getHistoryPeriod("2026-07-15T08:00:00.000Z", now) === "yesterday",
    "previous day is yesterday",
  );
  assert(
    getHistoryPeriod("2026-07-12T08:00:00.000Z", now) === "this-week",
    "within 6 days is this-week",
  );
  assert(
    getHistoryPeriod("2026-07-01T08:00:00.000Z", now) === "earlier",
    "older dates are earlier",
  );
}

function testGroupHistoryItems() {
  const now = new Date("2026-07-16T15:00:00.000Z");
  const groups = groupHistoryItems(
    [
      makeItem({
        practiceId: "today",
        lastActivityAt: "2026-07-16T08:00:00.000Z",
      }),
      makeItem({
        practiceId: "yesterday",
        lastActivityAt: "2026-07-15T08:00:00.000Z",
      }),
    ],
    now,
  );

  assert(groups.length === 2, "groups by period");
  assert(groups[0].period === "today", "today group first");
  assert(groups[1].period === "yesterday", "yesterday group second");
}

function run() {
  testParseHistoryFilter();
  testAggregateProgressByPractice();
  testFilterHistoryItems();
  testGetHistoryPeriod();
  testGroupHistoryItems();
  console.log("history-logic-unit: all tests passed");
}

run();
