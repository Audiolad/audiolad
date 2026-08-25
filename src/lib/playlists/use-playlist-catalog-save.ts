"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import { PLAYLIST_CATALOG_SAVES_PATH } from "@/lib/playlists/catalog-save";

export {
  PLAYLIST_CATALOG_SAVES_PATH,
  PLAYLIST_CATALOG_SIGN_IN_RETURN_PATH,
} from "@/lib/playlists/catalog-save";

export type PlaylistCatalogSaveClickIntent = "sign_in" | "toggle";

export type PersistPlaylistCatalogSaveResult =
  | { ok: true; isSaved: boolean }
  | { ok: false; errorMessage: string };

type PlaylistCatalogSaveRequest = {
  method: "POST" | "DELETE";
  url: string;
  body: { playlistId: string };
};

export function resolvePlaylistCatalogSaveClick(
  isAuthenticated: boolean,
): PlaylistCatalogSaveClickIntent {
  return isAuthenticated ? "toggle" : "sign_in";
}

export function buildPlaylistCatalogSaveRequest(
  playlistId: string,
  nextSaved: boolean,
): PlaylistCatalogSaveRequest {
  return {
    method: nextSaved ? "POST" : "DELETE",
    url: PLAYLIST_CATALOG_SAVES_PATH,
    body: { playlistId },
  };
}

export function playlistCatalogSaveErrorMessage(nextSaved: boolean): string {
  return nextSaved ? "Не удалось сохранить" : "Не удалось убрать";
}

export function isPlaylistCatalogSaveSuccessBody(
  body: unknown,
  nextSaved: boolean,
): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as { saved?: unknown; playlistId?: unknown };

  return record.saved === nextSaved && typeof record.playlistId === "string";
}

export type PlaylistCatalogSaveFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

export async function persistPlaylistCatalogSave(input: {
  playlistId: string;
  nextSaved: boolean;
  fetchImpl?: PlaylistCatalogSaveFetch;
}): Promise<PersistPlaylistCatalogSaveResult> {
  const request = buildPlaylistCatalogSaveRequest(input.playlistId, input.nextSaved);
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
    });

    const body: unknown = await response.json().catch(() => null);

    if (response.status === 200 && isPlaylistCatalogSaveSuccessBody(body, input.nextSaved)) {
      return { ok: true, isSaved: input.nextSaved };
    }

    return {
      ok: false,
      errorMessage: playlistCatalogSaveErrorMessage(input.nextSaved),
    };
  } catch {
    return {
      ok: false,
      errorMessage: playlistCatalogSaveErrorMessage(input.nextSaved),
    };
  }
}

export function startPlaylistCatalogSaveSignIn(input: {
  signInReturnPath: string;
}): { href: string } {
  return {
    href: buildAuthRouteHref("/auth/sign-in", input.signInReturnPath),
  };
}

export type UsePlaylistCatalogSaveInput = {
  playlistId: string;
  saved: boolean;
  isAuthenticated: boolean;
  signInReturnPath: string;
  fetchImpl?: PlaylistCatalogSaveFetch;
  onViewerSavedChange?: (saved: boolean) => void;
};

export type UsePlaylistCatalogSaveResult = {
  isSaved: boolean;
  isPending: boolean;
  errorMessage: string | null;
  handleClick: () => void;
};

export function usePlaylistCatalogSave({
  playlistId,
  saved: initialSaved,
  isAuthenticated,
  signInReturnPath,
  fetchImpl,
  onViewerSavedChange,
}: UsePlaylistCatalogSaveInput): UsePlaylistCatalogSaveResult {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);
  const [resetPlaylistId, setResetPlaylistId] = useState(playlistId);
  const inFlightPlaylistIdRef = useRef<string | null>(null);

  if (resetPlaylistId !== playlistId) {
    setResetPlaylistId(playlistId);
    setOptimisticSaved(null);
    setErrorMessage(null);
    setIsPending(false);
  }

  const isSaved = optimisticSaved ?? initialSaved;

  function handleClick() {
    if (resolvePlaylistCatalogSaveClick(isAuthenticated) === "sign_in") {
      const { href } = startPlaylistCatalogSaveSignIn({
        signInReturnPath,
      });
      router.push(href);
      return;
    }

    if (inFlightPlaylistIdRef.current === playlistId || isPending || !playlistId) {
      return;
    }

    const nextSaved = !isSaved;
    const previousSaved = isSaved;

    inFlightPlaylistIdRef.current = playlistId;
    setIsPending(true);
    setErrorMessage(null);
    setOptimisticSaved(nextSaved);

    void persistPlaylistCatalogSave({
      playlistId,
      nextSaved,
      fetchImpl,
    }).then((result) => {
      if (!result.ok) {
        setOptimisticSaved(previousSaved);
        setErrorMessage(result.errorMessage);
      } else {
        setOptimisticSaved(result.isSaved);
        onViewerSavedChange?.(result.isSaved);
      }

      if (inFlightPlaylistIdRef.current === playlistId) {
        inFlightPlaylistIdRef.current = null;
      }
      setIsPending(false);
    });
  }

  return {
    isSaved,
    isPending,
    errorMessage,
    handleClick,
  };
}
