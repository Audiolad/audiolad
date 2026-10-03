import {
  buildYandexWebmasterXlsx,
  type YandexWebmasterSheetRow,
} from "@/lib/seo-analytics/yandex-webmaster-xlsx";

/**
 * Derived from GitHub issue #735 published control totals.
 * This is not a live Yandex Webmaster export. The three named queries use the
 * issue's impressions, clicks, and average positions. The remaining rows exist
 * only so the file contains 2 701 queries and the published impression buckets.
 */
export const ISSUE_735_CONTROL = {
  queryCount: 2701,
  impressions: 26549,
  clicks: 948,
  impressionsAvgPosition4to10: 21579,
  impressionsAvgPosition11to20: 3732,
  zeroClickImpressions: 14119,
  periodStart: "2026-08-29",
  periodEnd: "2026-09-29",
  datesRange: "2026-08-29 — 2026-09-29",
  rows: {
    water: { query: "шум воды", impressions: 2219, clicks: 55, avgPosition: 6.551 },
    hotel: {
      query: "музыка для отелей и ресторанов",
      impressions: 450,
      clicks: 0,
      avgPosition: 6.42,
    },
    dryer: { query: "шум фена", impressions: 438, clicks: 1, avgPosition: 10.71 },
  },
} as const;

const POSITION_BREAKDOWN_HEADER = "Shows: 4-10";

function allocateImpressions(rowCount: number, total: number, heavyCount: number): number[] {
  const lightCount = rowCount - heavyCount;
  const remaining = total - lightCount;
  const heavyBase = Math.floor(remaining / heavyCount);
  let extra = remaining - heavyBase * heavyCount;
  const values: number[] = [];
  for (let index = 0; index < heavyCount; index += 1) {
    values.push(heavyBase + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
  }
  for (let index = 0; index < lightCount; index += 1) values.push(1);
  return values;
}

function sheetRow(
  query: string,
  impressions: number,
  clicks: number,
  avgPosition: number,
): YandexWebmasterSheetRow {
  const ctrPercent = impressions === 0 ? 0 : (clicks / impressions) * 100;
  return {
    query,
    datesRange: ISSUE_735_CONTROL.datesRange,
    impressions,
    clicks,
    ctrPercent,
    avgPosition,
    avgClickPosition: clicks > 0 ? Math.max(avgPosition - 0.2, 1) : null,
    extra: {
      [POSITION_BREAKDOWN_HEADER]: avgPosition > 3 && avgPosition <= 10 ? impressions : 0,
    },
  };
}

function groupRows(
  label: string,
  impressions: readonly number[],
  clicksEach: number,
  avgPosition: number,
): YandexWebmasterSheetRow[] {
  return impressions.map((value, index) =>
    sheetRow(`${label} ${index + 1}`, value, clicksEach, avgPosition),
  );
}

export function buildIssue735ControlRows(): YandexWebmasterSheetRow[] {
  const { rows } = ISSUE_735_CONTROL;
  const fastZero = allocateImpressions(1200, 10000, 200);
  const stepZero = allocateImpressions(400, 3294, 100);
  const tailZero = allocateImpressions(206, 375, 20);
  const fastClicks = allocateImpressions(800, 8910, 800);
  const winners = allocateImpressions(92, 863, 92);
  return [
    sheetRow(rows.water.query, rows.water.impressions, rows.water.clicks, rows.water.avgPosition),
    sheetRow(rows.hotel.query, rows.hotel.impressions, rows.hotel.clicks, rows.hotel.avgPosition),
    sheetRow(rows.dryer.query, rows.dryer.impressions, rows.dryer.clicks, rows.dryer.avgPosition),
    ...groupRows("резерв без кликов", fastZero, 0, 5.5),
    ...groupRows("шаг без кликов", stepZero, 0, 15),
    ...groupRows("хвост без кликов", tailZero, 0, 25),
    ...groupRows("резерв с кликами", fastClicks, 1, 7),
    ...groupRows("победитель", winners, 1, 2),
  ];
}

export function buildIssue735ControlWorkbook(): Buffer {
  const rows = buildIssue735ControlRows();
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const position4to10 = rows
    .filter((row) => row.avgPosition > 3 && row.avgPosition <= 10)
    .reduce((sum, row) => sum + row.impressions, 0);
  const position11to20 = rows
    .filter((row) => row.avgPosition > 10 && row.avgPosition <= 20)
    .reduce((sum, row) => sum + row.impressions, 0);
  const zeroClicks = rows
    .filter((row) => row.clicks === 0)
    .reduce((sum, row) => sum + row.impressions, 0);
  if (
    rows.length !== ISSUE_735_CONTROL.queryCount
    || impressions !== ISSUE_735_CONTROL.impressions
    || clicks !== ISSUE_735_CONTROL.clicks
    || position4to10 !== ISSUE_735_CONTROL.impressionsAvgPosition4to10
    || position11to20 !== ISSUE_735_CONTROL.impressionsAvgPosition11to20
    || zeroClicks !== ISSUE_735_CONTROL.zeroClickImpressions
  ) {
    throw new Error("issue_735_control_fixture_mismatch");
  }
  return buildYandexWebmasterXlsx(rows);
}
