import AuthorShell from "@/components/author-dashboard/AuthorShell";
import CommercialOnboardingStubPanel from "@/components/author-dashboard/CommercialOnboardingStubPanel";
import { requireCommercialOnboardingAuthor } from "@/lib/author-dashboard/commercial-onboarding-routes";
import {
  AUTHOR_COMMERCIAL_SHARE_BPS,
  PLATFORM_COMMERCIAL_SHARE_BPS,
} from "@/lib/author-commercial/economics";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ author?: string }>;
};

export default async function AuthorCommercialTermsPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const author = await requireCommercialOnboardingAuthor({
    nextPath: "/author-dashboard/commercial/terms",
    authorSlug: params.author,
  });

  const backHref = `/author-dashboard?author=${encodeURIComponent(author.slug)}`;
  const authorPercent = AUTHOR_COMMERCIAL_SHARE_BPS / 100;
  const platformPercent = PLATFORM_COMMERCIAL_SHARE_BPS / 100;

  return (
    <AuthorShell
      title="Условия сотрудничества"
      subtitle="Следующий шаг коммерческого подключения"
      internalBackHref={backHref}
    >
      <CommercialOnboardingStubPanel
        title="Условия сотрудничества готовятся"
        lead="Итоговая редакция документа ещё не опубликована. Принять условия сейчас нельзя — это будет доступно после публикации официальной версии."
        bullets={[
          `Базовая модель: автор ${authorPercent}% оплаченных и не возвращённых продаж, АудиоЛад ${platformPercent}%.`,
          "Эквайринг, банковские, организационные, технические расходы и налоги оператора покрываются из доли платформы и не уменьшают долю автора.",
          "Возвраты и оспоренные платежи уменьшают расчётную базу.",
        ]}
        note="Кнопки фиктивного принятия нет. Когда документ будет опубликован, этот экран откроет актуальную редакцию и безопасное подтверждение."
        backHref={backHref}
      />
    </AuthorShell>
  );
}
