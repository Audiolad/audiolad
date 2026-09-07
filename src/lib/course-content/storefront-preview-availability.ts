import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/author-products/publication-class";
import {
  isPracticeCatalogListed,
  isPracticePublished,
} from "@/lib/products/access";

import { listCourseStorefrontPreviewAudioItemIds } from "./learner-assets";
import {
  resolveCourseStorefrontPreviewAvailable,
  type CourseStorefrontPreviewAvailabilityAudio,
} from "./storefront-preview";

const PREVIEW_AVAILABILITY_AUDIO_SELECT =
  "id, audio_path, status, preview_start_ms, preview_end_ms";

export async function loadCourseStorefrontPreviewAvailable(input: {
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  practice: {
    id: string;
    status?: string | null;
    is_catalog_listed?: boolean | null;
    catalog_visibility?: string | null;
    publication_class?: string | null;
    product_kind?: string | null;
  };
}): Promise<boolean | null> {
  if (
    !isCoursePublication(
      input.practice.publication_class,
      input.practice.product_kind,
    )
  ) {
    return null;
  }

  const published = isPracticePublished(input.practice.status);
  const catalogListed = isPracticeCatalogListed({
    status: input.practice.status,
    is_catalog_listed: input.practice.is_catalog_listed,
    catalog_visibility: input.practice.catalog_visibility,
  });

  if (!published || !catalogListed) {
    return false;
  }

  const [{ data, error }, level1AudioItemIds] = await Promise.all([
    input.supabase
      .from("audio_items")
      .select(PREVIEW_AVAILABILITY_AUDIO_SELECT)
      .eq("practice_id", input.practice.id)
      .eq("status", "published"),
    listCourseStorefrontPreviewAudioItemIds({
      serviceRole: input.serviceRole,
      publicationId: input.practice.id,
    }),
  ]);

  if (error) {
    return false;
  }

  return resolveCourseStorefrontPreviewAvailable({
    published,
    catalogListed,
    audioRows: (data ?? []) as CourseStorefrontPreviewAvailabilityAudio[],
    level1AudioItemIds,
  });
}
