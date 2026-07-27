import AuthorShell from "@/components/author-dashboard/AuthorShell";
import CommercialOnboardingStubPanel from "@/components/author-dashboard/CommercialOnboardingStubPanel";
import { requireCommercialOnboardingAuthor } from "@/lib/author-dashboard/commercial-onboarding-routes";

export const dynamic = "force-dynamic";

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
      subtitle="Следующий шаг коммерческого подключения"
      internalBackHref={backHref}
    >
      <CommercialOnboardingStubPanel
        title="Заполните данные для выплат"
        lead="Здесь появится защищённая форма со сведениями, необходимыми для начисления и перечисления авторского вознаграждения."
        bullets={[
          "Форма ещё готовится и пока не принимает платёжные реквизиты.",
          "Сохранение банковских данных станет доступно только после отдельного защищённого этапа.",
          "Пока этот шаг нельзя отметить выполненным.",
        ]}
        note="Мы не собираем реальные реквизиты на этом экране. Вернитесь в чеклист подключения и продолжайте, когда форма будет готова."
        backHref={backHref}
      />
    </AuthorShell>
  );
}
