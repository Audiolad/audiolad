import MyPracticesLibrary from "@/components/my-practices/MyPracticesLibrary";
import type { LibraryCardItem } from "@/components/my-practices/LibraryCard";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AccessSource =
  | "starter"
  | "free_claim"
  | "purchase"
  | "gift"
  | "subscription"
  | "program"
  | "admin";

type AuthorRow = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
};

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  audio_url: string | null;
  status: string | null;
  authors: AuthorRow | AuthorRow[] | null;
};

type LibraryRow = {
  id: string;
  access_source: AccessSource | string;
  granted_at: string;
  expires_at: string | null;
  practices: PracticeRow | PracticeRow[] | null;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function isAccessActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  return new Date(expiresAt) > new Date();
}

function getAuthorName(practice: PracticeRow | null): string | null {
  if (!practice) {
    return null;
  }

  const author = normalizeOne(practice.authors);
  const name = author?.name?.trim();

  return name ? name : null;
}

function getAuthorSlug(practice: PracticeRow | null): string | null {
  const author = normalizeOne(practice?.authors ?? null);
  const slug = author?.slug?.trim();

  return slug || null;
}

function mapLibraryItems(rows: LibraryRow[] | null): LibraryCardItem[] {
  if (!rows) {
    return [];
  }

  return rows
    .filter((row) => isAccessActive(row.expires_at))
    .map((row) => {
      const practice = normalizeOne(row.practices);

      return {
        id: row.id,
        accessSource: row.access_source,
        practice: practice
          ? {
              id: practice.id,
              title: practice.title,
              slug: practice.slug,
              format: practice.format,
              durationMinutes: practice.duration_minutes,
              coverUrl: practice.cover_url,
              coverImage: practice.cover_image ?? null,
              updatedAt: practice.updated_at,
              audioUrl: practice.audio_url,
              isFree: practice.is_free,
              price: practice.price,
              authorName: getAuthorName(practice),
              authorSlug: getAuthorSlug(practice),
            }
          : null,
      };
    });
}

export default async function MyPracticesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: libraryRows, error } = await supabase
    .from("user_practices")
    .select(
      `
      id,
      access_source,
      granted_at,
      expires_at,
      practices (
        id,
        title,
        slug,
        description,
        format,
        duration_minutes,
        price,
        is_free,
        cover_url,
        cover_image,
        updated_at,
        audio_url,
        status,
        authors!practices_author_id_fkey (
          id,
          name,
          slug,
          avatar_url
        )
      )
    `,
    )
    .order("granted_at", { ascending: false });

  const libraryItems = mapLibraryItems(
    (libraryRows as LibraryRow[] | null) ?? null,
  );

  return (
    <>
      <div className="hidden xl:block">
        <h1 className="text-[28px] font-semibold">Аудиотека</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Ваши подарки и купленные материалы
        </p>
      </div>

      <MyPracticesLibrary items={libraryItems} error={Boolean(error)} />
    </>
  );
}
