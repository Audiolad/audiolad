import {
  COVER_EXTENSIONS,
  type CoverExtension,
} from "@/lib/author-products/utils";

import { AUTHOR_ASSETS_BUCKET } from "./constants";

export type AuthorAssetKind = "avatar" | "banner";

export function buildAuthorAssetStoragePath(
  authorId: string,
  kind: AuthorAssetKind,
  extension: CoverExtension,
): string {
  return `authors/${authorId}/${kind}.${extension}`;
}

export function getAuthorAssetPublicUrl(storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return storagePath;
  }

  return `${baseUrl}/storage/v1/object/public/${AUTHOR_ASSETS_BUCKET}/${storagePath}`;
}

export async function removeAuthorAssetFiles(
  supabase: {
    storage: {
      from: (bucket: string) => {
        remove: (paths: string[]) => Promise<unknown>;
      };
    };
  },
  authorId: string,
  kind: AuthorAssetKind,
): Promise<void> {
  const paths = COVER_EXTENSIONS.map((extension) =>
    buildAuthorAssetStoragePath(authorId, kind, extension),
  );

  await supabase.storage.from(AUTHOR_ASSETS_BUCKET).remove(paths).catch(() => undefined);
}
