import { collapseNormalizedWebmasterMetrics } from "@/lib/seo-analytics/collapse-metrics";
import type { ParsedWebmasterMetric, ParsedWebmasterWorkbook } from "@/lib/seo-analytics/types";
import { unzipArchive, zipArchive } from "@/lib/seo-analytics/xlsx-zip";
import { normalizeSeoQueryText } from "@/lib/seo-queries/published-query-occupancy";

export const SEO_ANALYTICS_MAX_XLSX_BYTES = 8 * 1024 * 1024;
export const SEO_ANALYTICS_MAX_ROWS = 50_000;

export class SeoAnalyticsImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SeoAnalyticsImportError";
    this.code = code;
  }
}

const REQUIRED_HEADERS = {
  query: ["query", "запрос"],
  dates: ["dates range", "date range", "диапазон дат", "период"],
  impressions: ["impressions", "показы"],
  clicks: ["clicks", "клики"],
  ctr: ["ctr %", "ctr%", "ctr, %", "ctr,%"],
  avgPosition: ["avg. position", "avg position", "average position", "средняя позиция"],
} as const;

const CLICK_POSITION_HEADERS = [
  "avg. click position",
  "avg click position",
  "average click position",
  "средняя позиция клика",
];

const DATE_TOKEN = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})`;
const RANGE_PATTERN = new RegExp(`^(${DATE_TOKEN})\\s*[\\u2014\\u2013-]\\s*(${DATE_TOKEN})$`);

export type YandexWebmasterSheetRow = {
  query: string;
  datesRange: string;
  impressions: number;
  clicks: number;
  ctrPercent: number;
  avgPosition: number;
  avgClickPosition?: number | null;
  extra?: Record<string, number | string>;
};

function canonicalHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnName(index: number): string {
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0];
  if (!letters) throw new SeoAnalyticsImportError("not_xlsx", "В ячейке нет адреса колонки.");
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function formatXmlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new SeoAnalyticsImportError("invalid_metrics", "В выгрузке нечисловая метрика.");
  }
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function parseInteger(value: string, label: string, excelRow: number): number {
  const parsed = parseDecimal(value, label, excelRow);
  if (!Number.isInteger(parsed)) {
    throw new SeoAnalyticsImportError(
      "invalid_metrics",
      `Строка ${excelRow}: ${label} должно быть целым числом.`,
    );
  }
  return parsed;
}

function parseDecimal(value: string, label: string, excelRow: number): number {
  const cleaned = value.replace(/[\s\u00a0]/g, "").replace("%", "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    throw new SeoAnalyticsImportError(
      "invalid_metrics",
      `Строка ${excelRow}: не удалось прочитать «${label}».`,
    );
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new SeoAnalyticsImportError(
      "invalid_metrics",
      `Строка ${excelRow}: не удалось прочитать «${label}».`,
    );
  }
  return parsed;
}

function toIsoDate(token: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  const match = token.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    throw new SeoAnalyticsImportError("invalid_period", "Период в колонке Dates range не распознан.");
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function assertIsoDate(iso: string): void {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new SeoAnalyticsImportError("invalid_period", "Период в колонке Dates range не распознан.");
  }
}

export function parseDatesRange(value: string): { periodStart: string; periodEnd: string } {
  const match = value.trim().match(RANGE_PATTERN);
  if (!match) {
    throw new SeoAnalyticsImportError(
      "invalid_period",
      "Период должен быть в виде 2026-08-29 — 2026-09-29 или 29.08.2026 - 29.09.2026.",
    );
  }
  const periodStart = toIsoDate(match[1]);
  const periodEnd = toIsoDate(match[2]);
  assertIsoDate(periodStart);
  assertIsoDate(periodEnd);
  if (periodEnd < periodStart) {
    throw new SeoAnalyticsImportError("invalid_period", "Конец периода раньше начала.");
  }
  return { periodStart, periodEnd };
}

function collectText(xml: string): string {
  const withoutPhonetics = xml.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, "");
  const parts = [...withoutPhonetics.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) =>
    decodeXml(match[1]),
  );
  return parts.join("");
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => collectText(match[1]));
}

function cellValue(inner: string, type: string, strings: readonly string[]): string {
  if (type === "inlineStr") return collectText(inner);
  const value = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (value == null) return "";
  const decoded = decodeXml(value);
  if (type === "s") {
    const index = Number(decoded);
    return strings[index] ?? "";
  }
  return decoded;
}

function worksheetRows(xml: string, strings: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<number, string>();
    let maxIndex = -1;
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
      if (!ref) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const index = columnIndex(ref);
      cells.set(index, cellValue(cellMatch[2], type, strings));
      if (index > maxIndex) maxIndex = index;
    }
    if (maxIndex < 0) continue;
    const row = Array.from({ length: maxIndex + 1 }, () => "");
    for (const [index, value] of cells) row[index] = value;
    rows.push(row);
  }
  return rows;
}

function resolveWorksheetPath(files: Map<string, Buffer>): string {
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const target = rels.match(
    /Type="[^"]*\/worksheet"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/worksheet"/,
  );
  const raw = target?.[1] || target?.[2];
  if (!raw) return "xl/worksheets/sheet1.xml";
  const normalized = raw.replace(/^\/+/, "");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized.replace(/^\.\//, "")}`;
}

function headerIndex(headers: readonly string[], aliases: readonly string[]): number {
  const wanted = new Set(aliases);
  const matches = headers
    .map((header, index) => ({ header: canonicalHeader(header), index }))
    .filter((item) => item.header !== "" && wanted.has(item.header));
  if (matches.length > 1) {
    throw new SeoAnalyticsImportError(
      "ambiguous_columns",
      "Одна и та же метрика указана в нескольких колонках.",
    );
  }
  return matches[0]?.index ?? -1;
}

function ctrRatio(ctrPercent: number, impressions: number, clicks: number, excelRow: number): number {
  if (impressions === 0) {
    if (clicks !== 0 || ctrPercent !== 0) {
      throw new SeoAnalyticsImportError(
        "invalid_metrics",
        `Строка ${excelRow}: при нуле показов клики и CTR должны быть нулевыми.`,
      );
    }
    return 0;
  }
  const ratio = ctrPercent / 100;
  if (ratio < 0 || ratio > 1) {
    throw new SeoAnalyticsImportError(
      "invalid_metrics",
      `Строка ${excelRow}: CTR % вне диапазона 0–100.`,
    );
  }
  return ratio;
}

export type ValidatedWebmasterSource = {
  periodStart: string;
  periodEnd: string;
  rows: ParsedWebmasterMetric[];
};

export function parseYandexWebmasterXlsx(bytes: Buffer): ParsedWebmasterWorkbook {
  const source = parseYandexWebmasterSourceRows(bytes);
  const collapsed = collapseNormalizedWebmasterMetrics(source.rows);
  return {
    periodStart: source.periodStart,
    periodEnd: source.periodEnd,
    sourceRowCount: source.rows.length,
    collapsedGroupCount: collapsed.collapsedGroupCount,
    rows: collapsed.rows,
  };
}

export function parseYandexWebmasterSourceRows(bytes: Buffer): ValidatedWebmasterSource {
  if (bytes.length > SEO_ANALYTICS_MAX_XLSX_BYTES) {
    throw new SeoAnalyticsImportError("file_too_large", "Файл больше 8 МБ.");
  }
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new SeoAnalyticsImportError("not_xlsx", "Нужен файл .xlsx Яндекс.Вебмастера.");
  }

  let files: Map<string, Buffer>;
  try {
    files = unzipArchive(bytes);
  } catch {
    throw new SeoAnalyticsImportError("not_xlsx", "Файл не читается как XLSX.");
  }

  const sheetPath = resolveWorksheetPath(files);
  const sheet = files.get(sheetPath)?.toString("utf8");
  if (!sheet) {
    throw new SeoAnalyticsImportError("not_xlsx", "В книге нет листа с запросами.");
  }
  const strings = sharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"));
  const table = worksheetRows(sheet, strings);
  const headerRow = table.find((row) => row.some((cell) => cell.trim() !== ""));
  if (!headerRow) {
    throw new SeoAnalyticsImportError("missing_columns", "В файле нет строки заголовков.");
  }

  const columns = {
    query: headerIndex(headerRow, REQUIRED_HEADERS.query),
    dates: headerIndex(headerRow, REQUIRED_HEADERS.dates),
    impressions: headerIndex(headerRow, REQUIRED_HEADERS.impressions),
    clicks: headerIndex(headerRow, REQUIRED_HEADERS.clicks),
    ctr: headerIndex(headerRow, REQUIRED_HEADERS.ctr),
    avgPosition: headerIndex(headerRow, REQUIRED_HEADERS.avgPosition),
    avgClickPosition: headerIndex(headerRow, CLICK_POSITION_HEADERS),
  };
  const missing = [
    columns.query < 0 ? "Query" : null,
    columns.dates < 0 ? "Dates range" : null,
    columns.impressions < 0 ? "Impressions" : null,
    columns.clicks < 0 ? "Clicks" : null,
    columns.ctr < 0 ? "CTR %" : null,
    columns.avgPosition < 0 ? "Avg. position" : null,
  ].filter((item): item is string => Boolean(item));
  if (missing.length > 0) {
    throw new SeoAnalyticsImportError(
      "missing_columns",
      `В файле нет обязательных колонок: ${missing.join(", ")}.`,
    );
  }

  const consumed = new Set(
    [columns.query, columns.dates, columns.impressions, columns.clicks, columns.ctr, columns.avgPosition, columns.avgClickPosition]
      .filter((index) => index >= 0),
  );
  const extraColumns = headerRow
    .map((header, index) => ({ header: header.trim(), index }))
    .filter((item) => item.header !== "" && !consumed.has(item.index));

  const headerExcelRow = table.indexOf(headerRow);
  const rows: ParsedWebmasterMetric[] = [];
  let periodStart = "";
  let periodEnd = "";

  for (let index = headerExcelRow + 1; index < table.length; index += 1) {
    const row = table[index];
    const excelRow = index + 1;
    const queryText = (row[columns.query] ?? "").trim();
    const dates = (row[columns.dates] ?? "").trim();
    const impressionsText = (row[columns.impressions] ?? "").trim();
    const clicksText = (row[columns.clicks] ?? "").trim();
    const positionText = (row[columns.avgPosition] ?? "").trim();
    if (!queryText && !dates && !impressionsText && !clicksText && !positionText) continue;
    if (!queryText) {
      throw new SeoAnalyticsImportError("empty_query", `Строка ${excelRow}: пустой запрос.`);
    }
    if (queryText.length > 500) {
      throw new SeoAnalyticsImportError("invalid_metrics", `Строка ${excelRow}: слишком длинный запрос.`);
    }
    const normalizedQuery = normalizeSeoQueryText(queryText);
    if (!normalizedQuery) {
      throw new SeoAnalyticsImportError("empty_query", `Строка ${excelRow}: пустой запрос после нормализации.`);
    }

    const period = parseDatesRange(dates);
    if (!periodStart) {
      periodStart = period.periodStart;
      periodEnd = period.periodEnd;
    } else if (period.periodStart !== periodStart || period.periodEnd !== periodEnd) {
      throw new SeoAnalyticsImportError(
        "period_conflict",
        "В файле разные периоды. Импорт отменён, данные не записаны.",
      );
    }

    const impressions = parseInteger(impressionsText, "Показы", excelRow);
    const clicks = parseInteger(clicksText, "Клики", excelRow);
    const avgPosition = parseDecimal(positionText, "Avg. position", excelRow);
    const ctrPercent = parseDecimal((row[columns.ctr] ?? "").trim() || "0", "CTR %", excelRow);
    if (impressions < 0 || clicks < 0 || clicks > impressions || avgPosition < 0) {
      throw new SeoAnalyticsImportError(
        "invalid_metrics",
        `Строка ${excelRow}: показы, клики или позиция вне допустимого диапазона.`,
      );
    }
    let avgClickPosition: number | null = null;
    if (columns.avgClickPosition >= 0) {
      const clickPositionText = (row[columns.avgClickPosition] ?? "").trim();
      if (clickPositionText) {
        avgClickPosition = parseDecimal(clickPositionText, "Avg. click position", excelRow);
        if (avgClickPosition < 0) {
          throw new SeoAnalyticsImportError(
            "invalid_metrics",
            `Строка ${excelRow}: средняя позиция клика меньше нуля.`,
          );
        }
      }
    }

    const rawEntries: [string, string | number][] = [];
    for (const extra of extraColumns) {
      const text = (row[extra.index] ?? "").trim();
      if (!text) continue;
      const numeric = text.replace(/[\s\u00a0]/g, "").replace(",", ".");
      rawEntries.push([
        extra.header,
        /^-?\d+(?:\.\d+)?$/.test(numeric) ? Number(numeric) : text,
      ]);
    }

    rows.push({
      queryText,
      normalizedQuery,
      impressions,
      clicks,
      ctr: ctrRatio(ctrPercent, impressions, clicks, excelRow),
      avgPosition,
      avgClickPosition,
      rawMetrics: rawEntries.length > 0 ? Object.fromEntries(rawEntries) : null,
    });
    if (rows.length > SEO_ANALYTICS_MAX_ROWS) {
      throw new SeoAnalyticsImportError("invalid_metrics", "В файле больше 50 000 запросов.");
    }
  }

  if (!periodStart || rows.length === 0) {
    throw new SeoAnalyticsImportError("empty_export", "В файле нет строк с запросами.");
  }

  return { periodStart, periodEnd, rows };
}

export function buildYandexWebmasterXlsx(
  rows: readonly YandexWebmasterSheetRow[],
  options?: { compression?: "store" | "deflate" },
): Buffer {
  const extraHeaders: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row.extra ?? {})) {
      if (!extraHeaders.includes(key)) extraHeaders.push(key);
    }
  }
  const headers = [
    "Query",
    "Dates range",
    "Impressions",
    "Clicks",
    "CTR %",
    "Avg. position",
    "Avg. click position",
    ...extraHeaders,
  ];
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const remember = (value: string) => {
    const existing = stringIndex.get(value);
    if (existing != null) return existing;
    const index = strings.length;
    strings.push(value);
    stringIndex.set(value, index);
    return index;
  };
  for (const header of headers) remember(header);
  for (const row of rows) {
    remember(row.query);
    remember(row.datesRange);
  }

  const sheetRows: string[] = [];
  const headerCells = headers
    .map((header, index) => `<c r="${columnName(index)}1" t="s"><v>${remember(header)}</v></c>`)
    .join("");
  sheetRows.push(`<row r="1">${headerCells}</row>`);
  rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const cells = [
      `<c r="A${excelRow}" t="s"><v>${remember(row.query)}</v></c>`,
      `<c r="B${excelRow}" t="s"><v>${remember(row.datesRange)}</v></c>`,
      `<c r="C${excelRow}"><v>${formatXmlNumber(row.impressions)}</v></c>`,
      `<c r="D${excelRow}"><v>${formatXmlNumber(row.clicks)}</v></c>`,
      `<c r="E${excelRow}"><v>${formatXmlNumber(row.ctrPercent)}</v></c>`,
      `<c r="F${excelRow}"><v>${formatXmlNumber(row.avgPosition)}</v></c>`,
    ];
    if (row.avgClickPosition != null) {
      cells.push(`<c r="G${excelRow}"><v>${formatXmlNumber(row.avgClickPosition)}</v></c>`);
    }
    extraHeaders.forEach((header, extraIndex) => {
      const value = row.extra?.[header];
      if (value == null || value === "") return;
      const column = columnName(7 + extraIndex);
      if (typeof value === "number") {
        cells.push(`<c r="${column}${excelRow}"><v>${formatXmlNumber(value)}</v></c>`);
      } else {
        cells.push(`<c r="${column}${excelRow}" t="s"><v>${remember(value)}</v></c>`);
      }
    });
    sheetRows.push(`<row r="${excelRow}">${cells.join("")}</row>`);
  });

  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map((value) => `<si><t xml:space="preserve">${xmlEscape(value)}</t></si>`).join("")}
</sst>`;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows.join("")}</sheetData>
</worksheet>`;
  const method = options?.compression === "store" ? 0 : 8;
  return zipArchive([
    {
      name: "[Content_Types].xml",
      method,
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      method,
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      method,
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Queries" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      method,
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`),
    },
    { name: "xl/worksheets/sheet1.xml", method, data: Buffer.from(sheetXml) },
    { name: "xl/sharedStrings.xml", method, data: Buffer.from(sharedXml) },
  ]);
}
