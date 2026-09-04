import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/course-content/validators";
import { resolveListenAccess } from "@/lib/listen/access";
import type { ListenAccess } from "@/lib/listen/types";
import {
  isCatalogStorefrontPreviewEligible,
  resolveListenApiDecision,
  shouldUseServiceRoleStorageForReason,
  type ListenApiPurpose,
} from "@/lib/listen/preview-access";
import {
  canAccessCourseContent,
  resolveProductAccess,
  type ProductAccessReason,
} from "@/lib/products/access";
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
  is_catalog_listed?: boolean | null;
  guest_access_enabled?: boolean | null;
  product_kind?: string | null;
  publication_class?: string | null;
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

export type LoadListenApiContextOptions = {
  purpose?: ListenApiPurpose;
};

/** @deprecated Use shouldUseServiceRoleStorageForReason. */
export function shouldUseServiceRoleStorageForProductAccess(
  reason: ProductAccessReason,
): boolean {
  return shouldUseServiceRoleStorageForReason(reason);
}

export async function loadListenApiContext(
  request: Request,
  authorSlug: string,
  productSlug: string,
  options?: LoadListenApiContextOptions,
): Promise<ListenApiLoadResult> {
  const purpose = options?.purpose ?? "full_audio";
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

  const isCourse = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  );
  let courseAllowed = false;

  if (isCourse) {
    try {
      courseAllowed = await canAccessCourseContent(
        supabase,
        practice,
        user?.id ?? null,
        { access: productAccess },
      );
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
      };
    }
  }

  const needsListenAccess =
    (isCourse && courseAllowed) || (!isCourse && productAccess.canListen);
  let listenAccess: ListenAccess | null = null;

  if (needsListenAccess) {
    try {
      listenAccess = await resolveListenAccess(
        supabase,
        user?.id ?? null,
        practice,
      );
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
      };
    }
  }

  const decision = resolveListenApiDecision({
    purpose,
    isCourse,
    courseAllowed,
    canListen: productAccess.canListen,
    accessReason: productAccess.reason,
    catalogPreviewEligible: isCatalogStorefrontPreviewEligible(practice),
    listenAccess,
  });

  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  let storageClient = supabase;

  if (decision.useServiceRoleStorage) {
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
      access: decision.access,
    },
  };
}
