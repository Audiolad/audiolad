import BusinessHomePage from "@/components/business-app/BusinessHomePage";
import {
  BUSINESS_MOCK_STATE_QUERY,
  isBusinessPointState,
  type BusinessPointState,
} from "@/lib/business-app/point-state";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Owner Home. Domain + player-health signals load in layout (P0-01 / P1-05).
 * `mockState` is an optional reviewer override only when explicitly set.
 */
export default async function BusinessAppHomePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const raw = params[BUSINESS_MOCK_STATE_QUERY];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const mockOverride: BusinessPointState | null = isBusinessPointState(value)
    ? value
    : null;

  return <BusinessHomePage mockStateOverride={mockOverride} />;
}
