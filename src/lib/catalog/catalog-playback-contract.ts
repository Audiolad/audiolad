import type {
  CatalogGlobalPlayerSession,
  GlobalPlayerPlaybackMode,
} from "@/lib/listen/global-player-types";

export type CatalogPlaybackModeInput = {
  canListen: boolean;
  accessState?: "free" | "paid";
};

export function resolveCatalogPlaybackMode(
  input: CatalogPlaybackModeInput,
): GlobalPlayerPlaybackMode {
  if (input.accessState === "free" || input.canListen) {
    return "full";
  }

  return "preview";
}

export function applyCatalogPlayContract(
  session: CatalogGlobalPlayerSession,
  extras?: Partial<
    Pick<
      CatalogGlobalPlayerSession,
      "playbackMode" | "previewStartMs" | "previewEndMs" | "previewCta"
    >
  >,
): CatalogGlobalPlayerSession {
  return {
    ...session,
    sourceType: "catalog",
    entrySurface: "catalog",
    playbackMode: extras?.playbackMode ?? "full",
    suppressListenUrlSync: true,
    forceStartAtBeginning: true,
    requestAutoplay: true,
    ...(extras?.previewStartMs != null
      ? { previewStartMs: extras.previewStartMs }
      : {}),
    ...(extras?.previewEndMs != null
      ? { previewEndMs: extras.previewEndMs }
      : {}),
    ...(extras?.previewCta ? { previewCta: extras.previewCta } : {}),
  };
}
