import BusinessHomePage from "@/components/business-app/BusinessHomePage";
import {
  BUSINESS_MOCK_STATE_QUERY,
  parseBusinessPointState,
} from "@/lib/business-app/point-state";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Owner Home. Domain (Organization/Location) is loaded in layout from A1 tables.
 * `mockState` remains a reviewer-only switch for status chrome until Player health
 * is wired (P0-03); it no longer invents owner/location identity.
 */
export default async function BusinessAppHomePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const raw = params[BUSINESS_MOCK_STATE_QUERY];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const initialState = parseBusinessPointState(value, "stopped");

  return <BusinessHomePage initialState={initialState} />;
}
