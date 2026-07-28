import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorPayoutProfileForm from "@/components/author-dashboard/AuthorPayoutProfileForm";
import { requireCommercialOnboardingAuthor } from "@/lib/author-dashboard/commercial-onboarding-routes";
import { isPayoutProfilesEnabled } from "@/lib/author-payout-profiles/feature";
import { createClient } from "@/lib/supabase/server";

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
  const collectionEnabled = isPayoutProfilesEnabled();

  let initialEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    initialEmail = user?.email?.trim() || null;
  } catch {
    initialEmail = null;
  }

  return (
    <AuthorShell
      title="Данные для выплат"
      subtitle="Укажите, как вам удобно получать авторское вознаграждение. Если перед первой выплатой потребуются дополнительные сведения, мы свяжемся с вами."
      internalBackHref={backHref}
    >
      {collectionEnabled ? (
        <AuthorPayoutProfileForm
          authorId={author.id}
          backHref={backHref}
          initialEmail={initialEmail}
        />
      ) : (
        <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#25135c]">
            Данные для выплат
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#796ba0]">
            Заполнение данных для выплат временно недоступно. Попробуйте
            позднее.
          </p>
          <a
            href={backHref}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
          >
            Вернуться в кабинет
          </a>
        </section>
      )}
    </AuthorShell>
  );
}
