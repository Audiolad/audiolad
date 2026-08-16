export const LISTEN_PREVIEW_LIMIT = 7;
export const LISTEN_PREVIEW_MOBILE_INITIAL = 5;

export function getListenPreviewItems<T>(items: readonly T[]): T[] {
  return items.slice(0, LISTEN_PREVIEW_LIMIT);
}

export function getListenPreviewExpandCount(previewCount: number): number {
  return Math.max(0, previewCount - LISTEN_PREVIEW_MOBILE_INITIAL);
}

export function formatListenPreviewExpandLabel(remaining: number): string {
  return `Показать ещё ${remaining}`;
}

export function buildListenPreviewSsrFields(item: {
  title: string;
  authorName: string | null;
  durationLabel: string | null;
  productHref: string | null;
  position: number;
}) {
  return {
    title: item.title,
    authorName: item.authorName,
    durationLabel: item.durationLabel,
    productHref: item.productHref,
    position: item.position,
  };
}
