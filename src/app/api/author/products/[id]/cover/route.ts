import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation-actor";
import { MAX_COVER_BYTES } from "@/lib/author-products/media";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import {
  cleanupCoverManifestWithinPrefix,
  createPracticeImageWriteClient,
  PRACTICE_COVERS_BUCKET,
  writePracticeCoverColumns,
  productCoverVariantPrefix,
} from "@/lib/author-products/cover-storage";
import { removePracticeCoverFiles } from "@/lib/author-products/utils";
import {
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
import { parseImageManifest } from "@/lib/images/image-manifest";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";
import {
  loadAuthorSlug,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  removeBusinessPrivateCoverVersions,
  storeBusinessPrivateCover,
} from "@/lib/business-covers/private-cover.server";
import { isBusinessOnlyPractice } from "@/lib/products/business-only";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function schedulePublishedCoverIndexNow(
  supabase: SupabaseClient,
  practice: { author_id: string; status: string; slug: string },
) {
  if (practice.status !== "published" || !practice.slug) {
    return;
  }

  const authorSlug = await loadAuthorSlug(supabase, practice.author_id);

  if (!authorSlug) {
    return;
  }

  scheduleIndexNowNotification(
    [buildPracticeCanonicalUrl(authorSlug, practice.slug)],
    INDEXNOW_REASONS.practice_updated,
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    const { data: existing } = await supabase
      .from("practices")
      .select("cover_image")
      .eq("id", id)
      .maybeSingle();

    // Cover objects and cover columns are server-only (1:1 is enforced
    // here; migrations 20270117120000 and 20270118120000).
    const coverWriter = createPracticeImageWriteClient();
    await removePracticeCoverFiles(coverWriter, id);
    if (isBusinessOnlyPractice(practice)) {
      await removeBusinessPrivateCoverVersions({ writer: coverWriter, practiceId: id });
    }

    if (existing?.cover_image) {
      await cleanupCoverManifestWithinPrefix(
        coverWriter,
        parseImageManifest(existing.cover_image),
        productCoverVariantPrefix(id),
      );
    }

    const cleared = await writePracticeCoverColumns(coverWriter, id, {
      cover_url: null,
      cover_image: null,
      updated_at: new Date().toISOString(),
    });

    if (!cleared.ok) {
      console.error("author_cover_delete_error", cleared.error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const product = await getAuthorProductDetail(supabase, id);
    if (!isBusinessOnlyPractice(practice)) {
      await schedulePublishedCoverIndexNow(supabase, practice);
    }

    return NextResponse.json({ product, cover_url: null });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user } = await requirePracticeMutationAccess(id);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (isBusinessOnlyPractice(practice)) {
      // 39a7ef48 PR-D: private bucket only, the column keeps a reference (no URL).
      // No public variants, no IndexNow ping.
      const privateWriter = createPracticeImageWriteClient();
      const stored = await storeBusinessPrivateCover({
        writer: privateWriter,
        practiceId: id,
        buffer,
        declaredMime: file.type,
      });
      if (!stored.ok) {
        return NextResponse.json(
          {
            error: stored.code,
            message: imageProcessErrorMessage(stored.code as "corrupt_image", "product-cover"),
          },
          { status: stored.code === "upload_failed" ? 500 : 400 },
        );
      }
      const privateWritten = await writePracticeCoverColumns(privateWriter, id, {
        cover_url: stored.ref,
        cover_image: null,
        updated_at: new Date().toISOString(),
      });
      if (!privateWritten.ok) {
        console.error("author_private_cover_update_error", privateWritten.error);
        await removeBusinessPrivateCoverVersions({ writer: privateWriter, practiceId: id, keep: [] });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      await removeBusinessPrivateCoverVersions({ writer: privateWriter, practiceId: id, keep: stored.paths });
      const privateProduct = await getAuthorProductDetail(supabase, id);
      return NextResponse.json({ product: privateProduct, cover_url: stored.ref, cover_image: null });
    }

    const { data: previousRow } = await supabase
      .from("practices")
      .select("cover_image")
      .eq("id", id)
      .maybeSingle();

    const previousManifest = parseImageManifest(previousRow?.cover_image);
    // Cover objects and cover columns are server-only (1:1 is enforced
    // here; migrations 20270117120000 and 20270118120000).
    const coverWriter = createPracticeImageWriteClient();

    const uploaded = await uploadOptimizedImageSet({
      profile: "product-cover",
      bucket: PRACTICE_COVERS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: coverWriter.storage,
      context: { practiceId: id },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "product-cover",
          ),
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const now = new Date().toISOString();
    const coverUrl = primaryPublicUrl(
      PRACTICE_COVERS_BUCKET,
      uploaded.data,
      now,
    );

    const written = await writePracticeCoverColumns(coverWriter, id, {
      cover_url: coverUrl,
      cover_image: uploaded.data.manifest,
      updated_at: now,
    });

    if (!written.ok) {
      console.error("author_cover_update_error", written.error);
      await cleanupCoverManifestWithinPrefix(
        coverWriter,
        uploaded.data.manifest,
        productCoverVariantPrefix(id),
      );
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (previousManifest) {
      await cleanupCoverManifestWithinPrefix(
        coverWriter,
        previousManifest,
        productCoverVariantPrefix(id),
      );
    }

    await removePracticeCoverFiles(coverWriter, id);

    const product = await getAuthorProductDetail(supabase, id);
    await schedulePublishedCoverIndexNow(supabase, practice);

    return NextResponse.json({
      product,
      cover_url: coverUrl,
      cover_image: uploaded.data.manifest,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
