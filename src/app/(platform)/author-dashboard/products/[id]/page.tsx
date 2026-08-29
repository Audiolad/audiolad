import { notFound, redirect } from "next/navigation";

import AuthorProductForm from "@/components/author-dashboard/AuthorProductForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { AuthorAccessError, listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import {
  loadAuthorDashboardProductEditData,
  mapAuthorDashboardProductEditError,
} from "@/lib/author-products/dashboard-edit-page";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAuthorProductPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?next=/author-dashboard/products/${id}`);
  }

  const authors = await listAuthorWorkspacesForUser(user.id);

  if (authors.length === 0) {
    redirect("/author-dashboard");
  }

  let product;
  let topicFormData;
  try {
    const loaded = await loadAuthorDashboardProductEditData(id);
    product = loaded.product;
    topicFormData = loaded.topicFormData;
  } catch (error) {
    const mapped = mapAuthorDashboardProductEditError(error);
    if (mapped === "unauthorized") {
      redirect(`/auth/sign-in?next=/author-dashboard/products/${id}`);
    }
    if (mapped === "not_found" || error instanceof AuthorAccessError) {
      notFound();
    }
    throw error;
  }
  const { data: relatedProducts } = await supabase
    .from("practices")
    .select("id, title")
    .eq("author_id", product.practice.author_id)
    .eq("status", "published")
    .is("deleted_at", null)
    .eq("catalog_visibility", "listed")
    .eq("is_catalog_listed", true)
    .neq("id", product.practice.id)
    .order("title")
    .limit(8);

  return (
    <AuthorShell
      title="Редактировать аудиопродукт"
      subtitle={product.practice.title}
      internalBackHref="/author-dashboard"
    >
      <AuthorProductForm
        authors={authors}
        relatedProductOptions={(relatedProducts ?? []).map((item) => ({
          value: item.id,
          label: item.title,
        }))}
        initialProduct={product}
        topicFormData={topicFormData}
        mode="edit"
      />
    </AuthorShell>
  );
}
