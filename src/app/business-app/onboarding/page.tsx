import BusinessOnboardingWizardPage from "@/components/business-app/BusinessOnboardingWizardPage";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BusinessAppOnboardingPage({ searchParams }: PageProps) {
  const type = (await searchParams).type;
  // a8240527: «Подключить» from the coffee guest entry preselects «Кафе / кофейня» (validated in the wizard).
  return <BusinessOnboardingWizardPage initialTypeId={typeof type === "string" ? type : null} />;
}
