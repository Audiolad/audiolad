import Link from "next/link";
import { redirect } from "next/navigation";

import AuthorCreateWizard from "@/components/author-dashboard/AuthorCreateWizard";
import AuthorProductForm from "@/components/author-dashboard/AuthorProductForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import {
  CABINET_BRANCH_LABELS,
  parsePublicationClass,
  publicationClassToCabinetBranch,
} from "@/lib/author-products/publication-class";
import { parseProductWizardStep } from "@/lib/author-products/product-wizard-steps";
import { loadAuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import { SEO_RESERVATION_ID_PARAM } from "@/lib/seo-queries/reservation-product-create-href";
import { loadSeoReservationProductCreateContext } from "@/lib/seo-queries/load-seo-reservation-product-create-context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    author?: string;
    class?: string;
    step?: string;
    seo_reservation_id?: string;
  }>;
};

export default async function NewAuthorProductPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const params = await searchParams;
  const initialWizardStep = parseProductWizardStep(params.step);
  const seoReservationId =
    typeof params.seo_reservation_id === "string"
      ? params.seo_reservation_id.trim()
      : typeof params[SEO_RESERVATION_ID_PARAM] === "string"
        ? String(params[SEO_RESERVATION_ID_PARAM]).trim()
        : "";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/author-dashboard/products/new");
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  const initialAuthor =
    authors.find((item) => item.slug === params.author) ?? authors[0];
  const publicationClass = parsePublicationClass(params.class);

  const reservationLoad = seoReservationId
    ? await loadSeoReservationProductCreateContext(supabase, {
        reservationId: seoReservationId,
        authorId: initialAuthor.id,
      })
    : null;

  if (!publicationClass) {
    if (reservationLoad && !reservationLoad.ok) {
      return (
        <AuthorShell
          title="Создать"
          subtitle="Поисковый запрос"
          internalBackHref="/author-dashboard/seo-opportunities"
        >
          <div className="rounded-[22px] border border-[#eadff8] bg-white p-6">
            <p className="text-sm leading-6 text-[#5f5484]">
              {reservationLoad.message}
            </p>
            <Link
              href="/author-dashboard/seo-opportunities"
              className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
            >
              К поисковым запросам
            </Link>
          </div>
        </AuthorShell>
      );
    }

    return (
      <AuthorShell
        title="Создать"
        subtitle="Продукт, музыка или аудиопост"
        internalBackHref="/author-dashboard"
      >
        <AuthorCreateWizard
          authorSlug={initialAuthor.slug}
          seoReservationId={
            reservationLoad?.ok ? reservationLoad.context.reservationId : seoReservationId || undefined
          }
        />
      </AuthorShell>
    );
  }

  if (reservationLoad && !reservationLoad.ok) {
    return (
      <AuthorShell
        title="Создать"
        subtitle="Поисковый запрос"
        internalBackHref="/author-dashboard/seo-opportunities"
      >
        <div className="rounded-[22px] border border-[#eadff8] bg-white p-6">
          <p className="text-sm leading-6 text-[#5f5484]">
            {reservationLoad.message}
          </p>
          <Link
            href="/author-dashboard/seo-opportunities"
            className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
          >
            К поисковым запросам
          </Link>
        </div>
      </AuthorShell>
    );
  }

  const topicFormData = await loadAuthorProductTopicFormData(
    supabase,
    initialAuthor.id,
  );
  const cabinetBranch = publicationClassToCabinetBranch(publicationClass);
  const { data: relatedProducts } = await supabase
    .from("practices")
    .select("id, title")
    .eq("author_id", initialAuthor.id)
    .eq("status", "published")
    .is("deleted_at", null)
    .eq("catalog_visibility", "listed")
    .eq("is_catalog_listed", true)
    .order("title")
    .limit(8);

  return (
    <AuthorShell
      title={`Создать: ${CABINET_BRANCH_LABELS[cabinetBranch]}`}
      subtitle="Единая форма для одиночного и составного продукта"
      internalBackHref="/author-dashboard/products/new"
    >
      <AuthorProductForm
        authors={authors}
        relatedProductOptions={(relatedProducts ?? []).map((item) => ({
          value: item.id,
          label: item.title,
        }))}
        initialAuthorSlug={params.author}
        initialPublicationClass={publicationClass}
        initialWizardStep={initialWizardStep}
        initialSeoReservationContext={
          reservationLoad?.ok ? reservationLoad.context : null
        }
        topicFormData={topicFormData}
        mode="create"
      />
    </AuthorShell>
  );
}
