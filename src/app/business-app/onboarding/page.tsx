import BusinessOnboardingWizardPage from "@/components/business-app/BusinessOnboardingWizardPage";
import { safeBusinessWorkspaceReturn } from "@/lib/access-grants/paths";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BusinessAppOnboardingPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const type = query.type;
  const next = query.next;
  // a8240527: «Подключить» from the coffee guest entry preselects «Кафе / кофейня» (validated in the wizard).
  return (
    <BusinessOnboardingWizardPage
      initialTypeId={typeof type === "string" ? type : null}
      returnHref={safeBusinessWorkspaceReturn(typeof next === "string" ? next : null)}
    />
  );
}
