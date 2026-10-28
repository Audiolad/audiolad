"use client";

import { useEffect, useState } from "react";

import {
  AUTHOR_PUBLIC_NAME_CHECK_DEBOUNCE_MS,
  AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE,
  authorPublicNamesMatch,
  normalizeAuthorPublicName,
} from "@/lib/author-names/public-name";

export type AuthorPublicNameCheckScope =
  | "application"
  | "project"
  | "profile"
  | "studio";

type AvailabilityResponse = {
  available?: unknown;
};

/**
 * Debounced live check. A failed or rate-limited response does not mark the
 * name free or taken: submit still runs the server check.
 */
export function useAuthorPublicNameAvailability(input: {
  name: string;
  enabled: boolean;
  scope: AuthorPublicNameCheckScope;
  authorId?: string | null;
  owner?: string | null;
  /** When set, the caller's unchanged workspace name is not treated as taken. */
  ownName?: string | null;
}): { taken: boolean; message: string | null } {
  const [result, setResult] = useState<{ normalized: string; taken: boolean } | null>(
    null,
  );
  const normalized = normalizeAuthorPublicName(input.name);
  const unchangedOwnName =
    typeof input.ownName === "string" &&
    input.ownName.trim().length > 0 &&
    authorPublicNamesMatch(input.name, input.ownName);
  const shouldCheck =
    input.enabled && normalized.length >= 2 && !unchangedOwnName;
  const taken = Boolean(shouldCheck && result?.normalized === normalized && result.taken);

  useEffect(() => {
    if (!shouldCheck) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const payload: {
        name: string;
        scope: AuthorPublicNameCheckScope;
        authorId?: string;
        owner?: string;
      } = {
        name: input.name,
        scope: input.scope,
      };

      if (input.authorId) {
        payload.authorId = input.authorId;
      }

      if (input.scope === "studio" && input.owner?.trim()) {
        payload.owner = input.owner.trim();
      }

      void fetch("/api/author/name-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (controller.signal.aborted || !response.ok) {
            return;
          }
          const body = (await response.json()) as AvailabilityResponse;
          if (controller.signal.aborted || typeof body.available !== "boolean") {
            return;
          }
          setResult({ normalized, taken: body.available === false });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        });
    }, AUTHOR_PUBLIC_NAME_CHECK_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    input.authorId,
    input.enabled,
    input.name,
    input.owner,
    input.ownName,
    input.scope,
    normalized,
    shouldCheck,
  ]);

  return {
    taken,
    message: taken ? AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE : null,
  };
}
