import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/course-content/validators";
import {
  canAccessCourseContent,
  resolveProductAccess,
  type ProductAccessResult,
} from "@/lib/products/access";
import type { ListenAccess } from "./types";

type PracticeAccessRow = {
  id: string;
  author_id: string;
  is_free: boolean | null;
  status: string | null;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
  guest_access_enabled?: boolean | null;
  product_kind?: string | null;
  publication_class?: string | null;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
};

export async function resolveListenAccess(
  supabase: SupabaseClient,
  userId: string | null,
  practice: PracticeAccessRow,
  options?: { now?: Date },
): Promise<ListenAccess | null> {
  const access = await resolveProductAccess(
    supabase,
    practice,
    userId,
    options,
  );

  if (isCoursePublication(practice.publication_class, practice.product_kind)) {
    const allowed = await canAccessCourseContent(
      supabase,
      practice,
      userId,
      { access },
    );

    if (!allowed) {
      return null;
    }

    if (access.reason === "author_owner") {
      return { mode: "author_preview" };
    }

    return { mode: "entitled" };
  }

  if (!access.canListen) {
    return null;
  }

  if (access.reason === "author_owner") {
    return { mode: "author_preview" };
  }

  return { mode: "entitled" };
}

export type { ProductAccessResult };
