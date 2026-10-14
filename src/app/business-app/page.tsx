import BusinessHomePage from "@/components/business-app/BusinessHomePage";

/**
 * Owner Home. Domain + player-health signals load in layout (P0-01 / P1-05).
 * No URL-driven status override in production (c02fe282 P0-1): statuses come
 * only from real signals; design scenarios live in /spa/design-preview.
 */
export default function BusinessAppHomePage() {
  return <BusinessHomePage />;
}
