import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { MAX_COVER_BYTES } from "@/lib/author-products/limits";
import { AUTHOR_ASSETS_BUCKET } from "@/lib/authors/constants";
import {
  cleanupImageManifest,
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
import { QUICK_OFFER_DETAIL_SELECT, requireQuickOfferMutationAccess } from "@/lib/quick-offers/access";
import { mapQuickOfferAdminDto } from "@/lib/quick-offers/mappers";

type JsonRecord = Record<string, unknown>;

async function fetchOffer(
  supabase: Awaited<ReturnType<typeof requireQuickOfferMutationAccess>>["supabase"],
  offerId: string,
) {
  const { data, error } = await supabase
    .from("quick_offers")
    .select(QUICK_OFFER_DETAIL_SELECT)
    .eq("id", offerId)
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error("not_found");
  }

  return mapQuickOfferAdminDto(data as JsonRecord);
}

export async function POSTHero(offerId: string, request: Request) {
  try {
    const { supabase, offer } = await requireQuickOfferMutationAccess(offerId);
    const current = mapQuickOfferAdminDto(offer as JsonRecord);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadOptimizedImageSet({
      profile: "quick-offer-hero",
      bucket: AUTHOR_ASSETS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: supabase.storage,
      context: {
        authorId: current.author_id,
        offerId,
        offerAssetKind: "hero",
      },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "quick-offer-hero",
          ),
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const heroPath = uploaded.data.primaryDisplayPath;
    const previousPath = current.hero_image_path;

    const { error } = await supabase
      .from("quick_offers")
      .update({ hero_image_path: heroPath })
      .eq("id", offerId);

    if (error) {
      await cleanupImageManifest(
        supabase.storage,
        AUTHOR_ASSETS_BUCKET,
        uploaded.data.manifest,
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (previousPath) {
      await supabase.storage.from(AUTHOR_ASSETS_BUCKET).remove([previousPath]);
    }

    return NextResponse.json({
      offer: await fetchOffer(supabase, offerId),
      hero_image_url: primaryPublicUrl(
        AUTHOR_ASSETS_BUCKET,
        uploaded.data,
        Date.now(),
      ),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETEHero(offerId: string) {
  try {
    const { supabase, offer } = await requireQuickOfferMutationAccess(offerId);
    const current = mapQuickOfferAdminDto(offer as JsonRecord);

    if (current.hero_image_path) {
      await supabase.storage
        .from(AUTHOR_ASSETS_BUCKET)
        .remove([current.hero_image_path]);
    }

    const { error } = await supabase
      .from("quick_offers")
      .update({ hero_image_path: null })
      .eq("id", offerId);

    if (error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ offer: await fetchOffer(supabase, offerId) });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTMaterialImage(
  offerId: string,
  materialId: string,
  request: Request,
) {
  try {
    const { supabase, offer } = await requireQuickOfferMutationAccess(offerId);
    const current = mapQuickOfferAdminDto(offer as JsonRecord);
    const material = current.materials.find((item) => item.id === materialId);

    if (!material) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadOptimizedImageSet({
      profile: "quick-offer-card",
      bucket: AUTHOR_ASSETS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: supabase.storage,
      context: {
        authorId: current.author_id,
        offerId,
        offerAssetKind: "material",
        materialId,
      },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "quick-offer-card",
          ),
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const { error } = await supabase
      .from("quick_offer_materials")
      .update({ image_path: uploaded.data.primaryDisplayPath })
      .eq("id", materialId)
      .eq("offer_id", offerId);

    if (error) {
      await cleanupImageManifest(
        supabase.storage,
        AUTHOR_ASSETS_BUCKET,
        uploaded.data.manifest,
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (material.image_path) {
      await supabase.storage
        .from(AUTHOR_ASSETS_BUCKET)
        .remove([material.image_path]);
    }

    return NextResponse.json({ offer: await fetchOffer(supabase, offerId) });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
