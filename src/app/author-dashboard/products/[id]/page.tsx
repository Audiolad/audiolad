import { notFound, redirect } from "next/navigation";

import AuthorProductForm from "@/components/author-dashboard/AuthorProductForm";
import AuthorShell from "@/components/author-dashboard/AuthorShell";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { loadAuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function loadEditableProduct(userId: string, practiceId: string) {
  const supabase = await createClient();

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id, author_id")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError || !practice?.id || !practice.author_id) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", practice.author_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    (membership.role !== "owner" && membership.role !== "editor")
  ) {
    return null;
  }

  return getAuthorProductDetail(supabase, practiceId);
}

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

  const product = await loadEditableProduct(user.id, id);

  if (!product) {
    notFound();
  }

  const topicFormData = await loadAuthorProductTopicFormData(
    supabase,
    product.practice.author_id,
    id,
  );

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
