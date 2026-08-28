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

  return (
    <AuthorShell
      title="Редактировать аудиопродукт"
      subtitle={product.practice.title}
      internalBackHref="/author-dashboard"
    >
      <AuthorProductForm
        authors={authors}
        initialProduct={product}
        topicFormData={topicFormData}
        mode="edit"
      />
    </AuthorShell>
  );
}
