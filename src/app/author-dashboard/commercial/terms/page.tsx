import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorTermsAcceptPanel from "@/components/author-dashboard/AuthorTermsAcceptPanel";
import { requireCommercialOnboardingAuthor } from "@/lib/author-dashboard/commercial-onboarding-routes";
import {
  authorHasAnyTermsAcceptance,
  loadAuthorTermsStatus,
} from "@/lib/author-terms/service";
import { requireAuthorMembership } from "@/lib/author-products/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const { role } = await requireAuthorMembership(author.id);
  const status = await loadAuthorTermsStatus({ authorId: author.id, role });
  const hadPrior = await authorHasAnyTermsAcceptance(author.id);
  const backHref = `/author-dashboard?author=${encodeURIComponent(author.slug)}`;

  return (
    <AuthorShell
      title="Авторские условия сотрудничества"
      subtitle="Условия регулируют размещение продуктов, предоставление доступа слушателям и выплату авторского вознаграждения"
      internalBackHref={backHref}
    >
      {status.acceptedCurrent ? (
        <section className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-6">
          <h2 className="text-[22px] font-semibold text-[#25135c]">
            Условия приняты
          </h2>
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            Вы приняли актуальную редакцию Авторских условий сотрудничества.
          </p>
          {status.acceptance ? (
            <p className="mt-3 text-sm text-[#8c7dab]">
              Версия: {status.acceptance.version}
              <br />
              Дата принятия:{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Moscow",
              }).format(new Date(status.acceptance.acceptedAt))}
            </p>
          ) : null}
          <a
            href="/author-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#7042c5] px-5 text-sm font-semibold text-[#7042c5]"
          >
            Открыть документ
          </a>
        </section>
      ) : (
        <AuthorTermsAcceptPanel
          authorId={author.id}
          authorSlug={author.slug}
          status={status}
          mode={hadPrior ? "updated" : "first"}
        />
      )}
    </AuthorShell>
  );
}
