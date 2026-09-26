import BusinessHomePage from "@/components/business-app/BusinessHomePage";
import {
  BUSINESS_MOCK_STATE_QUERY,
  parseBusinessPointState,
} from "@/lib/business-app/point-state";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BusinessAppHomePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const raw = params[BUSINESS_MOCK_STATE_QUERY];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const initialState = parseBusinessPointState(value, "healthy");

  return <BusinessHomePage initialState={initialState} />;
}
