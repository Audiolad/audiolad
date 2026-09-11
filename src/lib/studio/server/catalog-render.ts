import "server-only";

import { requireAuthenticatedUser } from "@/lib/author-products/auth";

import { CATALOG_MUSIC_UNAVAILABLE } from "../catalog-asset";
import {
  authorizeCatalogAssetsForStudioRender as authorizeCatalogAssetsForStudioRenderCore,
  StudioCatalogMusicUnavailableError,
  type StudioCatalogQueueAsset,
} from "../render/catalog-source";
import { StudioApiError } from "./validation";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function tryGetAuthenticatedUserId(): Promise<string | null> {
  try {
    return (await requireAuthenticatedUser()).user.id;
  } catch {
    return null;
  }
}

export async function authorizeCatalogAssetsForStudioRender(input: {
  service: SupabaseClient;
  projectId: string;
  currentUserId: string | null;
  hasProjectAccess: boolean;
  tracks: readonly { assetId?: string | null; clips?: readonly unknown[] }[];
  assets: readonly StudioCatalogQueueAsset[];
}): Promise<void> {
  try {
    await authorizeCatalogAssetsForStudioRenderCore(input);
  } catch (error) {
    if (
      error instanceof StudioCatalogMusicUnavailableError
      || (error instanceof Error && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE)
    ) {
      throw new StudioApiError(CATALOG_MUSIC_UNAVAILABLE, 403);
    }
    if (error instanceof StudioApiError) {
      throw error;
    }
    throw new StudioApiError("internal_error", 500);
  }
}
