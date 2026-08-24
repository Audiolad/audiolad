import type {
  FetchListenSessionResult,
} from "@/lib/playlists/fetch-listen-session";
import type {
  GlobalPlayerSession,
  LoadSessionInput,
} from "@/lib/listen/global-player-types";

export type CatalogTilePlayClickAction =
  | { type: "noop" }
  | { type: "toggle_pause_resume" }
  | { type: "load_session" };

export type CatalogTilePlayResultStatus = "ignored" | "toggled" | "loaded" | "error";

export type CatalogTilePlayResult = {
  status: CatalogTilePlayResultStatus;
  errorMessage: string | null;
};

export type CatalogTilePlayLock = {
  current: boolean;
};

export type CatalogTilePlayClickInput = {
  authorSlug: string;
  productSlug: string;
  isLoading: boolean;
  isSameCatalogProduct: boolean;
  canTogglePlayback: boolean;
};

export type CatalogTilePlayClickDeps = {
  fetchSession: (
    authorSlug: string,
    productSlug: string,
  ) => Promise<FetchListenSessionResult>;
  loadSession: (input: LoadSessionInput) => void;
  prepareSharedAudioGesture?: () => void;
  handlePlayPause?: () => void | Promise<void>;
  clearPlaylistQueue?: () => void;
};

export function createCatalogTilePlayLock(): CatalogTilePlayLock {
  return { current: false };
}

export function isSameCatalogTileSession(
  session: GlobalPlayerSession | null | undefined,
  authorSlug: string,
  productSlug: string,
): boolean {
  if (!session || session.sourceType === "private_audio") {
    return false;
  }

  return (
    session.authorSlug === authorSlug && session.productSlug === productSlug
  );
}

/**
 * Product-level click resolver for catalog tiles.
 * The existing `resolveProductPlaybackClickAction` is track-index based
 * (contents list). A tile plays the product's normal listen session.
 */
export function resolveCatalogTilePlayClickAction(
  input: CatalogTilePlayClickInput,
): CatalogTilePlayClickAction {
  if (
    input.isLoading ||
    !input.authorSlug.trim() ||
    !input.productSlug.trim()
  ) {
    return { type: "noop" };
  }

  if (input.isSameCatalogProduct && input.canTogglePlayback) {
    return { type: "toggle_pause_resume" };
  }

  return { type: "load_session" };
}

export function buildCatalogTilePlaybackErrorMessage(reason: string): string {
  if (reason === "unavailable" || reason === "forbidden") {
    return "Для прослушивания нужен доступ к продукту.";
  }

  if (reason === "no_audio") {
    return "Аудиоматериал пока недоступен.";
  }

  return "Не удалось запустить прослушивание. Попробуйте ещё раз.";
}

/**
 * In-place catalog-tile play. Reuses GET listen session + loadSession.
 * Does not pick tracks, build storage URLs, or change the listen route.
 */
export async function runCatalogTilePlayClick(
  input: CatalogTilePlayClickInput,
  deps: CatalogTilePlayClickDeps,
  lock: CatalogTilePlayLock = createCatalogTilePlayLock(),
): Promise<CatalogTilePlayResult> {
  if (lock.current) {
    return { status: "ignored", errorMessage: null };
  }

  const action = resolveCatalogTilePlayClickAction(input);

  if (action.type === "noop") {
    return { status: "ignored", errorMessage: null };
  }

  lock.current = true;

  try {
    if (action.type === "toggle_pause_resume") {
      deps.clearPlaylistQueue?.();
      await deps.handlePlayPause?.();
      return { status: "toggled", errorMessage: null };
    }

    deps.prepareSharedAudioGesture?.();

    const loaded = await deps.fetchSession(
      input.authorSlug,
      input.productSlug,
    );

    if (!loaded.ok) {
      return {
        status: "error",
        errorMessage: buildCatalogTilePlaybackErrorMessage(loaded.reason),
      };
    }

    deps.clearPlaylistQueue?.();
    deps.loadSession({
      ...loaded.session,
      requestAutoplay: true,
      suppressListenUrlSync: true,
    });

    return { status: "loaded", errorMessage: null };
  } finally {
    lock.current = false;
  }
}
