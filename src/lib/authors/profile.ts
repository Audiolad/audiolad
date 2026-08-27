import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthorType } from "./constants";
import {
  isAuthorContactPlatform,
  mapAuthorContactRow,
  type AuthorContactRow,
  type AuthorProfileContact,
} from "./contacts";
import type { NormalizedAuthorContact } from "./contacts-validation";

export type AuthorProfileRow = {
  id: string;
  name: string;
  slug: string;
  author_type: AuthorType;
  short_bio: string | null;
  short_positioning: string | null;
  full_bio: string | null;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  avatar_image?: unknown;
  banner_image?: unknown;
  banner_position_x?: number | string | null;
  banner_position_y?: number | string | null;
  updated_at: string | null;
};

export type AuthorProfileTopic = {
  key: string;
  title: string;
  position: number;
};

export type AuthorFeaturedProductSummary = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  product_kind?: string | null;
  subtitle: string | null;
  description: string | null;
  cover_url: string | null;
  price: number | null;
  is_free: boolean | null;
  status: string;
  position: number;
};

export type AuthorProfileDetail = AuthorProfileRow & {
  topicKeys: string[];
  topics: AuthorProfileTopic[];
  featuredProducts: AuthorFeaturedProductSummary[];
  contacts: AuthorProfileContact[];
};

export async function getAuthorProfileDetail(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorProfileDetail | null> {
  const { data: author, error } = await supabase
    .from("authors")
    .select(
      "id, name, slug, author_type, short_bio, short_positioning, full_bio, description, avatar_url, banner_url, avatar_path, banner_path, avatar_image, banner_image, banner_position_x, banner_position_y, updated_at",
    )
    .eq("id", authorId)
    .maybeSingle();

  if (error || !author?.id) {
    return null;
  }

  const { data: topicRows } = await supabase
    .from("author_topics")
    .select(
      `
      position,
      topics!inner (
        key,
        title,
        is_active
      )
    `,
    )
    .eq("author_id", authorId)
    .order("position", { ascending: true });

  const topics: AuthorProfileTopic[] = [];

  for (const row of topicRows ?? []) {
    const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;

    if (!topic?.key || !topic?.title || topic.is_active === false) {
      continue;
    }

    topics.push({
      key: topic.key as string,
      title: topic.title as string,
      position: row.position as number,
    });
  }

  const { data: featuredRows } = await supabase
    .from("author_featured_products")
    .select(
      `
      position,
      practices!inner (
        id,
        title,
        slug,
        format,
        product_kind,
        subtitle,
        description,
        cover_url,
        price,
        is_free,
        status,
        author_id
      )
    `,
    )
    .eq("author_id", authorId)
    .order("position", { ascending: true });

  const featuredProducts: AuthorFeaturedProductSummary[] = [];

  for (const row of featuredRows ?? []) {
    const practice = Array.isArray(row.practices)
      ? row.practices[0]
      : row.practices;

    if (
      !practice?.id ||
      practice.author_id !== authorId ||
      practice.status !== "published"
    ) {
      continue;
    }

    featuredProducts.push({
      id: practice.id as string,
      title: practice.title as string,
      slug: practice.slug as string,
      format: (practice.format as string | null) ?? null,
      product_kind: (practice.product_kind as string | null) ?? null,
      subtitle: (practice.subtitle as string | null) ?? null,
      description: (practice.description as string | null) ?? null,
      cover_url: (practice.cover_url as string | null) ?? null,
      price: (practice.price as number | null) ?? null,
      is_free: (practice.is_free as boolean | null) ?? null,
      status: practice.status as string,
      position: row.position as number,
    });
  }

  const { data: contactRows } = await supabase
    .from("author_contacts")
    .select(
      "id, author_id, platform, title, description, url, icon_url, icon_path, icon_image, sort_order, is_visible",
    )
    .eq("author_id", authorId)
    .order("sort_order", { ascending: true });

  const contacts: AuthorProfileContact[] = [];

  for (const row of contactRows ?? []) {
    if (!isAuthorContactPlatform(row.platform) || !row.id || !row.title || !row.url) {
      continue;
    }

    contacts.push(
      mapAuthorContactRow({
        ...(row as AuthorContactRow),
        platform: row.platform,
      }),
    );
  }

  return {
    ...(author as AuthorProfileRow),
    topicKeys: topics.map((topic) => topic.key),
    topics,
    featuredProducts,
    contacts,
  };
}

export async function replaceAuthorTopics(
  supabase: SupabaseClient,
  authorId: string,
  topicKeys: string[],
): Promise<{ ok: true } | { ok: false; code: string }> {
  const normalizedKeys = [...new Set(topicKeys.map((key) => key.trim().toLowerCase()))];

  let topicRows: Array<{ id: string; key: string }> = [];

  if (normalizedKeys.length > 0) {
    const { data, error } = await supabase
      .from("topics")
      .select("id, key")
      .eq("is_active", true)
      .in("key", normalizedKeys);

    if (error) {
      return { ok: false, code: "topics_lookup_failed" };
    }

    topicRows = (data ?? []) as Array<{ id: string; key: string }>;

    if (topicRows.length !== normalizedKeys.length) {
      return { ok: false, code: "invalid_topic_keys" };
    }
  }

  const { error: deleteError } = await supabase
    .from("author_topics")
    .delete()
    .eq("author_id", authorId);

  if (deleteError) {
    return { ok: false, code: "topics_replace_failed" };
  }

  if (topicRows.length === 0) {
    return { ok: true };
  }

  const keyOrder = new Map(normalizedKeys.map((key, index) => [key, index]));
  const inserts = topicRows
    .map((topic) => ({
      author_id: authorId,
      topic_id: topic.id,
      position: keyOrder.get(topic.key) ?? 0,
    }))
    .sort((left, right) => left.position - right.position);

  const { error: insertError } = await supabase
    .from("author_topics")
    .insert(inserts);

  if (insertError) {
    return { ok: false, code: "topics_replace_failed" };
  }

  return { ok: true };
}

export async function replaceAuthorFeaturedProducts(
  supabase: SupabaseClient,
  authorId: string,
  productIds: string[],
): Promise<{ ok: true } | { ok: false; code: string }> {
  if (productIds.length === 0) {
    const { error: deleteError } = await supabase
      .from("author_featured_products")
      .delete()
      .eq("author_id", authorId);

    if (deleteError) {
      return { ok: false, code: "featured_replace_failed" };
    }

    return { ok: true };
  }

  const { data: products, error: productsError } = await supabase
    .from("practices")
    .select("id, author_id, status")
    .in("id", productIds);

  if (productsError) {
    return { ok: false, code: "featured_lookup_failed" };
  }

  const productMap = new Map(
    (products ?? []).map((row) => [row.id as string, row]),
  );

  for (const productId of productIds) {
    const product = productMap.get(productId);

    if (!product) {
      return { ok: false, code: "featured_product_not_found" };
    }

    if (product.author_id !== authorId) {
      return { ok: false, code: "featured_product_forbidden" };
    }

    if (product.status !== "published") {
      return { ok: false, code: "featured_product_not_published" };
    }
  }

  const { error: deleteError } = await supabase
    .from("author_featured_products")
    .delete()
    .eq("author_id", authorId);

  if (deleteError) {
    return { ok: false, code: "featured_replace_failed" };
  }

  const inserts = productIds.map((productId, index) => ({
    author_id: authorId,
    product_id: productId,
    position: index,
  }));

  const { error: insertError } = await supabase
    .from("author_featured_products")
    .insert(inserts);

  if (insertError) {
    return { ok: false, code: "featured_replace_failed" };
  }

  return { ok: true };
}

export async function replaceAuthorContacts(
  supabase: SupabaseClient,
  authorId: string,
  contacts: NormalizedAuthorContact[],
): Promise<
  | { ok: true; removedIconImages: unknown[] }
  | { ok: false; code: string }
> {
  const { data: existingRows, error: existingError } = await supabase
    .from("author_contacts")
    .select("id, icon_image")
    .eq("author_id", authorId);

  if (existingError) {
    return { ok: false, code: "contacts_replace_failed" };
  }

  const nextIds = new Set(contacts.map((contact) => contact.id));
  const removedIconImages = (existingRows ?? [])
    .filter((row) => typeof row.id === "string" && !nextIds.has(row.id))
    .map((row) => row.icon_image);

  const { error: deleteError } = await supabase
    .from("author_contacts")
    .delete()
    .eq("author_id", authorId);

  if (deleteError) {
    return { ok: false, code: "contacts_replace_failed" };
  }

  if (contacts.length === 0) {
    return { ok: true, removedIconImages };
  }

  const inserts = contacts.map((contact, index) => ({
    id: contact.id,
    author_id: authorId,
    platform: contact.platform,
    title: contact.title,
    description: contact.description,
    url: contact.url,
    icon_url: contact.iconUrl,
    icon_path: contact.iconPath,
    icon_image: contact.iconImage ?? null,
    sort_order: index,
    is_visible: contact.isVisible,
    updated_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("author_contacts")
    .insert(inserts);

  if (insertError) {
    return { ok: false, code: "contacts_replace_failed" };
  }

  return { ok: true, removedIconImages };
}

export async function listAuthorPublishedProductsForPicker(
  supabase: SupabaseClient,
  authorId: string,
): Promise<
  Array<{
    id: string;
    title: string;
    slug: string;
    format: string | null;
    cover_url: string | null;
    price: number | null;
    is_free: boolean | null;
  }>
> {
  const { data, error } = await supabase
    .from("practices")
    .select("id, title, slug, format, cover_url, price, is_free")
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []) as Array<{
    id: string;
    title: string;
    slug: string;
    format: string | null;
    cover_url: string | null;
    price: number | null;
    is_free: boolean | null;
  }>;
}
