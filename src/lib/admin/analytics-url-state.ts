import {
  parseAdminAnalyticsPeriod,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import { parseAdminIncludeTestParam } from "@/lib/admin/analytics-test-traffic";

export type AdminAnalyticsTab = "practices" | "authors" | "utm";
export type AdminAnalyticsTopN = "10" | "25" | "all";
export type AdminAnalyticsUtmGroup = "source" | "campaign" | "medium";
export type AdminAnalyticsDrillMetric =
  | "visitors"
  | "registrations"
  | "playStarts"
  | "completions"
  | "saves"
  | null;

export type AdminAnalyticsUrlState = {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  authorId: string | null;
  practiceId: string | null;
  utmSource: string | null;
  deviceType: string | null;
  tab: AdminAnalyticsTab;
  q: string;
  top: AdminAnalyticsTopN;
  utmGroup: AdminAnalyticsUtmGroup;
  practicesSort: string;
  practicesSortDir: "asc" | "desc";
  authorsSort: string;
  authorsSortDir: "asc" | "desc";
  drill: AdminAnalyticsDrillMetric;
};

function parseTab(value: string | null): AdminAnalyticsTab {
  if (value === "authors" || value === "utm" || value === "practices") {
    return value;
  }
  return "practices";
}

function parseTop(value: string | null): AdminAnalyticsTopN {
  if (value === "10" || value === "25" || value === "all") {
    return value;
  }
  return "25";
}

function parseUtmGroup(value: string | null): AdminAnalyticsUtmGroup {
  if (value === "campaign" || value === "medium" || value === "source") {
    return value;
  }
  return "source";
}

function parseDir(value: string | null): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parseDrill(value: string | null): AdminAnalyticsDrillMetric {
  if (
    value === "visitors" ||
    value === "registrations" ||
    value === "playStarts" ||
    value === "completions" ||
    value === "saves"
  ) {
    return value;
  }
  return null;
}

export function parseAdminAnalyticsUrlState(
  params: URLSearchParams | Record<string, string | undefined>,
): AdminAnalyticsUrlState {
  const get = (key: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key);
    }
    return params[key] ?? null;
  };

  return {
    period: parseAdminAnalyticsPeriod(get("period")),
    includeTest: parseAdminIncludeTestParam(get("includeTest")),
    authorId: get("authorId"),
    practiceId: get("practiceId"),
    utmSource: get("utmSource"),
    deviceType: get("deviceType"),
    tab: parseTab(get("tab")),
    q: (get("q") ?? "").trim(),
    top: parseTop(get("top")),
    utmGroup: parseUtmGroup(get("utmGroup")),
    practicesSort: get("practicesSort")?.trim() || "play_starts",
    practicesSortDir: parseDir(get("practicesSortDir")),
    authorsSort: get("authorsSort")?.trim() || "play_starts",
    authorsSortDir: parseDir(get("authorsSortDir")),
    drill: parseDrill(get("drill")),
  };
}

export function buildAdminAnalyticsSearchParams(
  state: AdminAnalyticsUrlState,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? "");
  params.set("period", state.period);
  params.set("includeTest", state.includeTest ? "1" : "0");

  const optional: Array<[string, string | null | undefined]> = [
    ["authorId", state.authorId],
    ["practiceId", state.practiceId],
    ["utmSource", state.utmSource],
    ["deviceType", state.deviceType],
    ["tab", state.tab === "practices" ? null : state.tab],
    ["q", state.q || null],
    ["top", state.top === "25" ? null : state.top],
    ["utmGroup", state.utmGroup === "source" ? null : state.utmGroup],
    ["practicesSort", state.practicesSort === "play_starts" ? null : state.practicesSort],
    ["practicesSortDir", state.practicesSortDir === "desc" ? null : state.practicesSortDir],
    ["authorsSort", state.authorsSort === "play_starts" ? null : state.authorsSort],
    ["authorsSortDir", state.authorsSortDir === "desc" ? null : state.authorsSortDir],
    ["drill", state.drill],
  ];

  for (const [key, value] of optional) {
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return params;
}

export function topNToLimit(top: AdminAnalyticsTopN): number {
  if (top === "10") return 10;
  if (top === "25") return 25;
  return 100;
}
