import {
  AuthorAccessError,
  requirePracticeAccess,
} from "@/lib/author-products/auth";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { loadAuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import type { AuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
import type { AuthorProductDetail } from "@/lib/author-products/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AuthorDashboardProductEditData = {
  product: AuthorProductDetail;
  topicFormData: AuthorProductTopicFormData;
  dataClient: SupabaseClient;
  user: User;
};

export function mapAuthorDashboardProductEditError(
  error: unknown,
): "unauthorized" | "not_found" | null {
  if (error instanceof AuthorAccessError) {
    if (error.status === 401 || error.code === "unauthorized") {
      return "unauthorized";
    }
    return "not_found";
  }
  return null;
}

export async function loadAuthorDashboardProductEditData(
  practiceId: string,
): Promise<AuthorDashboardProductEditData> {
  const access = await requirePracticeAccess(practiceId);
  const product = await getAuthorProductDetail(access.supabase, practiceId);

  if (!product) {
    throw new AuthorAccessError("not_found", 404);
  }

  const topicFormData = await loadAuthorProductTopicFormData(
    access.supabase,
    product.practice.author_id,
    practiceId,
  );

  return {
    product,
    topicFormData,
    dataClient: access.supabase,
    user: access.user,
  };
}
