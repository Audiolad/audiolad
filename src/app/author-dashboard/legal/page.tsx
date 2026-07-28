import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorShell from "@/components/author-dashboard/AuthorShell";
import AuthorTermsAcceptPanel from "@/components/author-dashboard/AuthorTermsAcceptPanel";
import {
  listAuthorWorkspacesForUser,
  requireAuthenticatedUser,
  requireAuthorMembership,
} from "@/lib/author-products/auth";
import {
  authorHasAnyTermsAcceptance,
  loadAuthorTermsStatus,
} from "@/lib/author-terms/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{ author?: string }>;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export default async function AuthorLegalDocumentsPage({
  searchParams,
}: PageProps) {
  const params = (await searchParams) ?? {};
  const { user } = await requireAuthenticatedUser();
  const workspaces = await listAuthorWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/become-author");
  }

  const requestedSlug = params.author?.trim() ?? "";
  const workspace =
    workspaces.find((item) => item.slug === requestedSlug) ?? workspaces[0];

  const { role } = await requireAuthorMembership(workspace.id);
  const status = await loadAuthorTermsStatus({
    authorId: workspace.id,
    role,
  });
  const hadPrior = await authorHasAnyTermsAcceptance(workspace.id);
  const backHref = `/author-dashboard?author=${encodeURIComponent(workspace.slug)}`;

  return (
    <AuthorShell
      title="Юридические документы"
      subtitle="Документы коммерческого сотрудничества"
      internalBackHref={backHref}
    >
      <section className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-6">
        <h2 className="text-[20px] font-semibold text-[#25135c]">
          Авторские условия сотрудничества платформы «АудиоЛад»
        </h2>
        <p className="mt-2 text-[15px] leading-6 text-[#4c3d78]">
          Условия регулируют размещение продуктов, предоставление доступа
          слушателям и выплату авторского вознаграждения.
        </p>

        {status.currentVersion ? (
          <dl className="mt-4 space-y-2 text-sm text-[#4c3d78]">
            <div>
              <dt className="font-medium text-[#7d70a2]">Текущая редакция</dt>
              <dd>{status.currentVersion.version}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#7d70a2]">Дата публикации</dt>
              <dd>{formatDate(status.currentVersion.publishedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#7d70a2]">Статус</dt>
              <dd>
                {status.acceptedCurrent ? "Принято" : "Требуется принятие"}
              </dd>
            </div>
            {status.acceptance ? (
              <div>
                <dt className="font-medium text-[#7d70a2]">Дата принятия</dt>
                <dd>{formatDate(status.acceptance.acceptedAt)}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-[#8c7dab]">
            Актуальная редакция пока не опубликована.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/author-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-full border border-[#7042c5] px-5 text-sm font-semibold text-[#7042c5]"
          >
            Открыть документ
          </Link>
        </div>
      </section>

      {!status.acceptedCurrent && status.currentVersion ? (
        <div className="mt-6">
          <AuthorTermsAcceptPanel
            authorId={workspace.id}
            authorSlug={workspace.slug}
            status={status}
            mode={hadPrior ? "updated" : "first"}
          />
        </div>
      ) : null}
    </AuthorShell>
  );
}
