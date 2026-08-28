import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requireAuthorMembership,
  requireAuthorMutationMembership,
} from "@/lib/author-products/auth";
import {
  getAuthorProfileDetail,
  listAuthorPublishedProductsForPicker,
  replaceAuthorContacts,
  replaceAuthorFeaturedProducts,
  replaceAuthorTopics,
} from "@/lib/authors/profile";
import { normalizeAuthorContacts } from "@/lib/authors/contacts-validation";
import {
  normalizeAuthorType,
  normalizeFeaturedProductIds,
  normalizeFullBio,
  normalizePublicName,
  normalizeShortBio,
  normalizeShortPositioning,
  normalizeTopicKeys,
} from "@/lib/authors/validation";
import {
  AUTHOR_ASSETS_BUCKET,
  MAX_AUTHOR_PROFILE_TOPICS,
} from "@/lib/authors/constants";
import { cleanupImageManifest } from "@/lib/images/image-upload-service";
import { parseImageManifest } from "@/lib/images/image-manifest";
import {
  buildAuthorCanonicalUrl,
  countAuthorPublishedPractices,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { hasAuthorPublicIndexNowChanges } from "@/lib/seo/indexnow/public-fields";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const authorId = url.searchParams.get("author_id")?.trim();

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMembership(authorId);
    const profile = await getAuthorProfileDetail(supabase, authorId);

    if (!profile) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const publishedProducts = await listAuthorPublishedProductsForPicker(
      supabase,
      authorId,
    );

    return NextResponse.json({ profile, publishedProducts });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const authorId =
      typeof body.author_id === "string" ? body.author_id.trim() : "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorMutationMembership(authorId, {
      action: "author_profile_updated",
    });

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("name" in body) {
      const name = normalizePublicName(body.name);

      if (!name) {
        return NextResponse.json({ error: "invalid_name" }, { status: 400 });
      }

      updates.name = name;
    }

    if ("author_type" in body) {
      const authorType = normalizeAuthorType(body.author_type);

      if (!authorType) {
        return NextResponse.json({ error: "invalid_author_type" }, { status: 400 });
      }

      updates.author_type = authorType;
    }

    if ("short_bio" in body) {
      const shortBio = normalizeShortBio(body.short_bio);

      if (body.short_bio !== null && body.short_bio !== "" && shortBio === null) {
        return NextResponse.json({ error: "invalid_short_bio" }, { status: 400 });
      }

      updates.short_bio = shortBio;
    }

    if ("short_positioning" in body) {
      const shortPositioning = normalizeShortPositioning(body.short_positioning);

      if (
        body.short_positioning !== null &&
        body.short_positioning !== "" &&
        shortPositioning === null
      ) {
        return NextResponse.json(
          { error: "invalid_short_positioning" },
          { status: 400 },
        );
      }

      updates.short_positioning = shortPositioning;
    }

    if ("full_bio" in body) {
      const fullBio = normalizeFullBio(body.full_bio);

      if (body.full_bio !== null && body.full_bio !== "" && fullBio === null) {
        return NextResponse.json({ error: "invalid_full_bio" }, { status: 400 });
      }

      updates.full_bio = fullBio;
    }

    const hasScalarUpdates = Object.keys(updates).length > 1;

    if (hasScalarUpdates) {
      const { error: updateError } = await supabase
        .from("authors")
        .update(updates)
        .eq("id", authorId);

      if (updateError) {
        console.error("author_profile_update_error", updateError.message);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }

    if ("topic_keys" in body) {
      const topicKeys = normalizeTopicKeys(body.topic_keys);

      if (topicKeys === null) {
        return NextResponse.json({ error: "invalid_topic_keys" }, { status: 400 });
      }

      if (topicKeys.length > MAX_AUTHOR_PROFILE_TOPICS) {
        return NextResponse.json({ error: "topic_limit_exceeded" }, { status: 400 });
      }

      const topicResult = await replaceAuthorTopics(supabase, authorId, topicKeys);

      if (!topicResult.ok) {
        return NextResponse.json({ error: topicResult.code }, { status: 400 });
      }
    }

    if ("featured_product_ids" in body) {
      const featuredProductIds = normalizeFeaturedProductIds(
        body.featured_product_ids,
      );

      if (featuredProductIds === null) {
        return NextResponse.json(
          { error: "invalid_featured_products" },
          { status: 400 },
        );
      }

      const featuredResult = await replaceAuthorFeaturedProducts(
        supabase,
        authorId,
        featuredProductIds,
      );

      if (!featuredResult.ok) {
        const status =
          featuredResult.code === "featured_product_forbidden" ? 403 : 400;

        return NextResponse.json({ error: featuredResult.code }, { status });
      }
    }

    if ("contacts" in body) {
      const contacts = normalizeAuthorContacts(body.contacts);

      if (contacts === null) {
        return NextResponse.json({ error: "invalid_contacts" }, { status: 400 });
      }

      const contactsResult = await replaceAuthorContacts(
        supabase,
        authorId,
        contacts,
      );

      if (!contactsResult.ok) {
        return NextResponse.json({ error: contactsResult.code }, { status: 400 });
      }

      for (const iconImage of contactsResult.removedIconImages) {
        const manifest = parseImageManifest(iconImage);
        if (manifest) {
          await cleanupImageManifest(
            supabase.storage,
            AUTHOR_ASSETS_BUCKET,
            manifest,
          );
        }
      }
    }

    const profile = await getAuthorProfileDetail(supabase, authorId);
    const publishedProducts = await listAuthorPublishedProductsForPicker(
      supabase,
      authorId,
    );

    const publicChanged = hasAuthorPublicIndexNowChanges({
      scalarUpdates: updates,
      topicKeysProvided: "topic_keys" in body,
      featuredProductIdsProvided: "featured_product_ids" in body,
      contactsProvided: "contacts" in body,
    });

    if (
      publicChanged &&
      profile?.slug &&
      (await countAuthorPublishedPractices(supabase, authorId)) > 0
    ) {
      scheduleIndexNowNotification(
        [buildAuthorCanonicalUrl(profile.slug)],
        INDEXNOW_REASONS.author_profile_updated,
      );
    }

    return NextResponse.json({ profile, publishedProducts });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
