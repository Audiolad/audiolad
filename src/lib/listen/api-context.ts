import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveListenAccess } from "@/lib/listen/access";
import type { ListenAccess } from "@/lib/listen/types";
import { resolveProductAccess } from "@/lib/products/access";
import {
  getPracticeByAuthorAndSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type PracticeAccessRow = {
  id: string;
  author_id: string;
  is_free: boolean | null;
  status: string | null;
};

export type ListenApiContext = {
  supabase: SupabaseClient;
  storageClient: SupabaseClient;
  userId: string | null;
  practice: PracticeAccessRow;
  access: ListenAccess;
};

export type ListenApiLoadResult =
  | { ok: true; context: ListenApiContext }
  | { ok: false; response: NextResponse };

export async function loadListenApiContext(
  request: Request,
  authorSlug: string,
  productSlug: string,
): Promise<ListenApiLoadResult> {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const isMissingSessionError =
    authError?.message?.toLowerCase().includes("auth session missing") ??
    false;

  if (authError && !isMissingSessionError) {
    return {
      ok: false,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  const { practice: practiceRow, error: practiceError } =
    await getPracticeByAuthorAndSlug(supabase, authorSlug, productSlug);

  if (practiceError) {
    return {
      ok: false,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!practiceRow?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }

  const practice = practiceRow as PublicPracticeRow & PracticeAccessRow;

  let productAccess;

  try {
    productAccess = await resolveProductAccess(
      supabase,
      practice,
      user?.id ?? null,
    );
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!productAccess.canListen) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  let access: ListenAccess | null;

  try {
    access = await resolveListenAccess(supabase, user?.id ?? null, practice);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  let storageClient = supabase;

  if (!user && productAccess.reason === "free") {
    try {
      storageClient = createServiceRoleClient();
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
      };
    }
  }

  return {
    ok: true,
    context: {
      supabase,
      storageClient,
      userId: user?.id ?? null,
      practice,
      access,
    },
  };
}
