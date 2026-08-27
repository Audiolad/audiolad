import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import { MAX_COVER_BYTES } from "@/lib/author-products/limits";
import { AUTHOR_ASSETS_BUCKET } from "@/lib/authors/constants";
import { isAuthorContactId } from "@/lib/authors/contacts";
import { getAuthorProfileDetail } from "@/lib/authors/profile";
import { parseImageManifest } from "@/lib/images/image-manifest";
import {
  cleanupImageManifest,
  primaryPublicUrl,
  uploadOptimizedImageSet,
} from "@/lib/images/image-upload-service";
import { imageProcessErrorMessage } from "@/lib/images/process-image";
import {
  buildAuthorCanonicalUrl,
  countAuthorPublishedPractices,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import type { SupabaseClient } from "@supabase/supabase-js";

async function scheduleAuthorContactIndexNow(
  supabase: SupabaseClient,
  authorId: string,
  slug: string | null | undefined,
) {
  if (!slug) {
    return;
  }

  if ((await countAuthorPublishedPractices(supabase, authorId)) <= 0) {
    return;
  }

  scheduleIndexNowNotification(
    [buildAuthorCanonicalUrl(slug)],
    INDEXNOW_REASONS.author_profile_updated,
  );
}

function readContactId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return isAuthorContactId(trimmed) ? trimmed : null;
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const authorId = url.searchParams.get("author_id")?.trim() ?? "";
    const contactId = readContactId(url.searchParams.get("contact_id"));

    if (!authorId || !contactId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMutationMembership(authorId);

    const { data: existing } = await supabase
      .from("author_contacts")
      .select("icon_image")
      .eq("id", contactId)
      .eq("author_id", authorId)
      .maybeSingle();

    const manifest = parseImageManifest(existing?.icon_image);

    if (manifest) {
      await cleanupImageManifest(supabase.storage, AUTHOR_ASSETS_BUCKET, manifest);
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("author_contacts")
        .update({
          icon_url: null,
          icon_path: null,
          icon_image: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactId)
        .eq("author_id", authorId);

      if (updateError) {
        console.error("author_contact_icon_delete_error", updateError.message);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);
    await scheduleAuthorContactIndexNow(supabase, authorId, profile?.slug);

    return NextResponse.json({
      profile,
      url: null,
      path: null,
      image: null,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const authorId =
      typeof formData.get("author_id") === "string"
        ? String(formData.get("author_id")).trim()
        : "";
    const contactId = readContactId(formData.get("contact_id"));
    const file = formData.get("file");

    if (!authorId || !contactId || !(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMutationMembership(authorId);

    const { data: existing } = await supabase
      .from("author_contacts")
      .select("icon_image")
      .eq("id", contactId)
      .eq("author_id", authorId)
      .maybeSingle();

    const previousManifest = parseImageManifest(existing?.icon_image);
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploaded = await uploadOptimizedImageSet({
      profile: "author-contact-icon",
      bucket: AUTHOR_ASSETS_BUCKET,
      buffer,
      declaredMime: file.type,
      storage: supabase.storage,
      context: { authorId, contactId },
    });

    if (!uploaded.ok) {
      return NextResponse.json(
        {
          error: uploaded.code,
          message: imageProcessErrorMessage(
            uploaded.code as "corrupt_image",
            "author-contact-icon",
          ),
        },
        { status: uploaded.code === "upload_failed" ? 500 : 400 },
      );
    }

    const cacheBuster = Date.now();
    const assetUrl = primaryPublicUrl(
      AUTHOR_ASSETS_BUCKET,
      uploaded.data,
      cacheBuster,
    );
    const storagePath = uploaded.data.primaryDisplayPath;

    if (existing) {
      const { error: updateError } = await supabase
        .from("author_contacts")
        .update({
          icon_url: assetUrl,
          icon_path: storagePath,
          icon_image: uploaded.data.manifest,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactId)
        .eq("author_id", authorId);

      if (updateError) {
        console.error("author_contact_icon_update_error", updateError.message);
        await cleanupImageManifest(
          supabase.storage,
          AUTHOR_ASSETS_BUCKET,
          uploaded.data.manifest,
        );
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    if (previousManifest) {
      await cleanupImageManifest(
        supabase.storage,
        AUTHOR_ASSETS_BUCKET,
        previousManifest,
      );
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);
    await scheduleAuthorContactIndexNow(supabase, authorId, profile?.slug);

    return NextResponse.json({
      profile,
      url: assetUrl,
      path: storagePath,
      image: uploaded.data.manifest,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
