import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorPayoutProfileForm from "@/components/author-dashboard/AuthorPayoutProfileForm";
import CommercialOnboardingStubPanel from "@/components/author-dashboard/CommercialOnboardingStubPanel";
import { requireCommercialOnboardingAuthor } from "@/lib/author-dashboard/commercial-onboarding-routes";
import { isPayoutProfilesEnabled } from "@/lib/author-payout-profiles/feature";

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

  return (
    <AuthorShell
      title="Данные для выплат"
      subtitle="Сведения для начисления и перечисления авторского вознаграждения"
      internalBackHref={backHref}
    >
      {collectionEnabled ? (
        <AuthorPayoutProfileForm authorId={author.id} backHref={backHref} />
      ) : (
        <CommercialOnboardingStubPanel
          title="Заполните данные для выплат"
          lead="Форма сбора банковских и налоговых данных пока не открыта для заполнения."
          bullets={[
            "Мы готовим защищённый сбор реквизитов и юридические основания обработки.",
            "Пока реальные банковские данные на этом экране не принимаются.",
            "После включения формы вы сможете сохранить черновик и отправить данные на проверку.",
          ]}
          note="Этот шаг коммерческого подключения ещё не принимает реквизиты. Вернитесь в чеклист и продолжайте, когда форма будет открыта."
          backHref={backHref}
        />
      )}
    </AuthorShell>
  );
}
