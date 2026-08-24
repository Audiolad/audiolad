"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  peekLibrarySave,
  publishLibrarySave,
  resolveCatalogLibrarySaveState,
  subscribeLibrarySave,
} from "@/lib/library/saves-sync";

export const CATALOG_LIBRARY_SAVES_PATH = "/api/library/saves";

export type CatalogLibrarySaveClickIntent = "sign_in" | "toggle";

export type PersistCatalogLibrarySaveResult =
  | { ok: true; isSaved: boolean }
  | { ok: false; errorMessage: string };

type CatalogLibrarySaveRequest = {
  method: "POST" | "DELETE";
  url: string;
  body: { practiceId: string };
};

export function resolveCatalogLibrarySaveClick(
  isAuthenticated: boolean,
): CatalogLibrarySaveClickIntent {
  return isAuthenticated ? "toggle" : "sign_in";
}

export function buildCatalogLibrarySaveRequest(
  practiceId: string,
  nextSaved: boolean,
): CatalogLibrarySaveRequest {
  return {
    method: nextSaved ? "POST" : "DELETE",
    url: CATALOG_LIBRARY_SAVES_PATH,
    body: { practiceId },
  };
}

export function catalogLibrarySaveErrorMessage(nextSaved: boolean): string {
  return nextSaved ? "Не удалось сохранить" : "Не удалось убрать";
}

export function isCatalogLibrarySaveSuccessBody(
  body: unknown,
  nextSaved: boolean,
): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as { saved?: unknown; practiceId?: unknown };

  return record.saved === nextSaved && typeof record.practiceId === "string";
}

export type CatalogLibrarySaveFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

export async function persistCatalogLibrarySave(input: {
  practiceId: string;
  nextSaved: boolean;
  fetchImpl?: CatalogLibrarySaveFetch;
}): Promise<PersistCatalogLibrarySaveResult> {
  const request = buildCatalogLibrarySaveRequest(input.practiceId, input.nextSaved);
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

    if (
      (response.status === 200 || response.status === 201) &&
      isCatalogLibrarySaveSuccessBody(body, input.nextSaved)
    ) {
      return { ok: true, isSaved: input.nextSaved };
    }

    return {
      ok: false,
      errorMessage: catalogLibrarySaveErrorMessage(input.nextSaved),
    };
  } catch {
    return {
      ok: false,
      errorMessage: catalogLibrarySaveErrorMessage(input.nextSaved),
    };
  }
}

export type UseCatalogLibrarySaveInput = {
  practiceId: string;
  isSaved: boolean;
  isAuthenticated: boolean;
  signInReturnPath: string;
  fetchImpl?: CatalogLibrarySaveFetch;
};

export type UseCatalogLibrarySaveResult = {
  isSaved: boolean;
  isPending: boolean;
  errorMessage: string | null;
  handleClick: () => void;
};

export function useCatalogLibrarySave({
  practiceId,
  isSaved: productIsSaved,
  isAuthenticated,
  signInReturnPath,
  fetchImpl,
}: UseCatalogLibrarySaveInput): UseCatalogLibrarySaveResult {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);
  const inFlightRef = useRef(false);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!practiceId) {
        return () => {};
      }

      return subscribeLibrarySave(practiceId, () => {
        onStoreChange();
      });
    },
    [practiceId],
  );

  const getSnapshot = useCallback(
    () => resolveCatalogLibrarySaveState(peekLibrarySave(practiceId), productIsSaved),
    [practiceId, productIsSaved],
  );

  const storeSaved = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isSaved = optimisticSaved ?? storeSaved;

  useEffect(() => {
    setOptimisticSaved(null);
    setErrorMessage(null);
    setIsPending(false);
    inFlightRef.current = false;
  }, [practiceId]);

  function handleClick() {
    if (resolveCatalogLibrarySaveClick(isAuthenticated) === "sign_in") {
      router.push(buildAuthRouteHref("/auth/sign-in", signInReturnPath));
      return;
    }

    if (inFlightRef.current || isPending || !practiceId) {
      return;
    }

    const nextSaved = !isSaved;

    inFlightRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    setOptimisticSaved(nextSaved);
    publishLibrarySave(practiceId, nextSaved);

    const persist = () =>
      persistCatalogLibrarySave({
        practiceId,
        nextSaved,
        fetchImpl,
      }).then((result) => {
        if (!result.ok) {
          publishLibrarySave(practiceId, !nextSaved);
          setErrorMessage(result.errorMessage);
        }

        setOptimisticSaved(null);
        inFlightRef.current = false;
        setIsPending(false);
      });

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        void persist();
      });
      return;
    }

    void persist();
  }

  return {
    isSaved,
    isPending,
    errorMessage,
    handleClick,
  };
}
