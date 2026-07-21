import type { SupabaseClient } from "@supabase/supabase-js";

import { isPracticePromoPageEligible } from "@/lib/promo-pages/validation";

export type PromoEligibleProductOption = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  duration_minutes: number | null;
  cover_url: string | null;
  cover_image: unknown;
  audio_count: number;
  access_label: string;
  eligible: boolean;
  ineligible_reason: string | null;
};

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  duration_minutes: number | null;
  cover_url: string | null;
  cover_image?: unknown;
  status: string | null;
  is_free: boolean | null;
  is_catalog_listed?: boolean | null;
  guest_access_enabled?: boolean | null;
};

function getAccessLabel(practice: PracticeRow): string {
  if (practice.guest_access_enabled === true) {
    return "Гостевой promo-доступ";
  }

  if (practice.is_free === true) {
    return "Бесплатно в каталоге";
  }

  return "Недоступно для промо";
}

function getIneligibleReason(practice: PracticeRow): string | null {
  if (isPracticePromoPageEligible(practice)) {
    return null;
  }

  if (practice.status !== "published") {
    return "Продукт не опубликован";
  }

  if (practice.guest_access_enabled !== true && practice.is_free !== true) {
    return "Платный продукт без гостевого доступа";
  }

  return "Продукт недоступен для промостраницы";
}

export async function listPromoEligibleProducts(
  supabase: SupabaseClient,
  authorId: string,
): Promise<PromoEligibleProductOption[]> {
  const { data: practices, error } = await supabase
    .from("practices")
    .select(
      "id, title, slug, format, duration_minutes, cover_url, cover_image, status, is_free, is_catalog_listed, guest_access_enabled",
    )
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("eligible_products_failed");
  }

  const rows = (practices ?? []) as PracticeRow[];

  if (rows.length === 0) {
    return [];
  }

  const practiceIds = rows.map((row) => row.id);
  const { data: audioCounts, error: audioError } = await supabase
    .from("audio_items")
    .select("practice_id")
    .in("practice_id", practiceIds);

  if (audioError) {
    throw new Error("eligible_products_audio_failed");
  }

  const countMap = new Map<string, number>();

  for (const row of audioCounts ?? []) {
    const practiceId = row.practice_id as string;
    countMap.set(practiceId, (countMap.get(practiceId) ?? 0) + 1);
  }

  return rows
    .map((row) => {
      const eligible = isPracticePromoPageEligible(row);

      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        format: row.format,
        duration_minutes: row.duration_minutes,
        cover_url: row.cover_url,
        cover_image: row.cover_image ?? null,
        audio_count: countMap.get(row.id) ?? 0,
        access_label: getAccessLabel(row),
        eligible,
        ineligible_reason: getIneligibleReason(row),
      };
    })
    .sort((left, right) => {
      if (left.eligible !== right.eligible) {
        return left.eligible ? -1 : 1;
      }

      return left.title.localeCompare(right.title, "ru");
    });
}
