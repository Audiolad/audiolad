import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorPayoutProfileForm from "@/components/author-dashboard/AuthorPayoutProfileForm";
import { requireCommercialOnboardingAuthor } from "@/lib/author-dashboard/commercial-onboarding-routes";

export const dynamic = "force-dynamic";

export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ author?: string }>;
};

export default async function AuthorCommercialPayoutDetailsPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const author = await requireCommercialOnboardingAuthor({
    nextPath: "/author-dashboard/commercial/payout-details",
    authorSlug: params.author,
  });

  const backHref = `/author-dashboard?author=${encodeURIComponent(author.slug)}`;

  return (
    <AuthorShell
      title="Данные для выплат"
      subtitle="Сведения для начисления и перечисления авторского вознаграждения"
      internalBackHref={backHref}
    >
      <AuthorPayoutProfileForm
        authorId={author.id}
        backHref={backHref}
      />
    </AuthorShell>
  );
}
