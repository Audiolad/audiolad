import { resolvePracticePriceRpc } from "@/lib/pricing/rpc";
import { PRICE_SURFACES } from "@/lib/pricing/types";
import { readPriceVisitorId } from "@/lib/pricing/visitor";
import { createClient } from "@/lib/supabase/server";

import {
  MEDITATION_SOLUTIONS_PRACTICE_SLUG,
  type MeditationSolutionsPractice,
} from "./content";

export type { MeditationSolutionsPractice };

export type MeditationSolutionsOfferState = {
  practice: MeditationSolutionsPractice | null;
  initialExpiresAt: string | null;
  salePrice: number | null;
  basePrice: number | null;
};

type PracticeRow = {
  id: string;
  slug: string;
  author_id: string | null;
  price: number | null;
};

const EMPTY_OFFER: MeditationSolutionsOfferState = {
  practice: null,
  initialExpiresAt: null,
  salePrice: null,
  basePrice: null,
};

export async function loadMeditationSolutionsOffer(): Promise<MeditationSolutionsOfferState> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("practices")
      .select("id, slug, author_id, price")
      .eq("slug", MEDITATION_SOLUTIONS_PRACTICE_SLUG)
      .maybeSingle();

    const row = data as PracticeRow | null;
    const practice = row
      ? {
          id: row.id,
          slug: row.slug,
          authorId: row.author_id,
          basePrice: typeof row.price === "number" ? row.price : null,
        }
      : null;

    if (!practice) {
      return EMPTY_OFFER;
    }

    const visitorId = await readPriceVisitorId();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const resolved = await resolvePracticePriceRpc({
      supabase,
      practiceId: practice.id,
      surface: PRICE_SURFACES.PRODUCT,
      visitorId,
      userId: user?.id ?? null,
    });

    return {
      practice,
      initialExpiresAt: resolved?.promotion?.expiresAt ?? null,
      salePrice: resolved?.salePrice ?? null,
      basePrice: resolved?.basePrice ?? practice.basePrice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("meditation_solutions_offer_load_error", message);
    return EMPTY_OFFER;
  }
}
