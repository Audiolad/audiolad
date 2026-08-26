export type PlaylistItemsDraft<T> = {
  orderKey: string;
  items: T[];
};

export function visiblePlaylistItems<T>(
  serverItems: T[],
  serverOrderKey: string,
  draft: PlaylistItemsDraft<T> | null,
): T[] {
  return draft && draft.orderKey === serverOrderKey ? draft.items : serverItems;
}

export type PlaylistReorderIdentity = {
  practiceId: string;
  audioItemId?: string | null;
  position: number;
};

export type PlaylistItemReorderRequest<T extends PlaylistReorderIdentity> = {
  direction: "up" | "down";
  targetPosition: number;
  item: T;
};

export function movePlaylistItems<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = items.slice();
  const [moved] = next.splice(fromIndex, 1);

  if (moved === undefined) {
    return items;
  }

  next.splice(toIndex, 0, moved);
  return next;
}

export function playlistItemReorderRequest<T extends PlaylistReorderIdentity>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): PlaylistItemReorderRequest<T> | null {
  const item = items[fromIndex];
  const target = items[toIndex];

  if (!item || !target || fromIndex === toIndex) {
    return null;
  }

  return {
    direction: toIndex < fromIndex ? "up" : "down",
    targetPosition: target.position,
    item,
  };
}
