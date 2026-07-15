import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveProductAccess,
  type ProductAccessResult,
} from "@/lib/products/access";
import type { ListenAccess } from "./types";

type PracticeAccessRow = {
  id: string;
  author_id: string;
  is_free: boolean | null;
  status: string | null;
};

export async function resolveListenAccess(
  supabase: SupabaseClient,
  userId: string | null,
  practice: PracticeAccessRow,
): Promise<ListenAccess | null> {
  const access = await resolveProductAccess(supabase, practice, userId);

  if (!access.canListen) {
    return null;
  }

  if (access.reason === "author_owner") {
    return { mode: "author_preview" };
  }

  return { mode: "entitled" };
}

export type { ProductAccessResult };
