"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useFirstSaveRetention } from "@/components/retention/FirstSaveRetentionProvider";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { isClaimLibrarySuccessBody } from "@/lib/library/claim-api";
import {
  publishLibraryMembership,
  resolveLibraryMembershipKey,
  subscribeLibraryMembership,
  type LibraryMembershipAction,
} from "@/lib/library/membership-sync";
import {
  isRemoveLibrarySuccessBody,
  mapLibraryRemoveButtonError,
} from "@/lib/library/remove-api";
import {
  buildPromoSignUpHref,
  buildPromoSignupContext,
  storePromoSignupContext,
} from "@/lib/promo/signup-context";
import {
  mapLibraryClaimButtonError,
  resolveLibraryActionAfterClaimSuccess,
} from "@/lib/products/practice-access-ui";

type ApiErrorBody = {
  error?: string;
};

export type UseLibraryMembershipInput = {
  practiceSlug: string;
  signInReturnPath: string;
  action: LibraryMembershipAction;
  practiceId?: string;
  promoSignup?: boolean;
  onClaimSuccess?: () => void;
  onRemoveSuccess?: () => void;
};

export type UseLibraryMembershipResult = {
  action: LibraryMembershipAction;
  isPending: boolean;
  errorMessage: string | null;
  buttonLabel: string;
  inLibrary: boolean;
  handleClick: () => void;
  removeFromLibrary: () => Promise<boolean>;
};

function getLibraryButtonLabel(
  action: LibraryMembershipAction,
  isPending: boolean,
  promoSignup: boolean,
): string {
  if (isPending) {
    return "Добавляем…";
  }

  switch (action) {
    case "sign_in":
      return promoSignup
        ? "Сохранить в Аудиотеку"
        : "Войти, чтобы добавить";
    case "add":
      return "Добавить в Аудиотеку";
    case "in_library":
      return "В Аудиотеке";
    default:
      return "Добавить в Аудиотеку";
  }
}

export function useLibraryMembership({
  practiceSlug,
  signInReturnPath,
  action: initialAction,
  practiceId,
  promoSignup = false,
  onClaimSuccess,
  onRemoveSuccess,
}: UseLibraryMembershipInput): UseLibraryMembershipResult {
  const router = useRouter();
  const { showFirstSaveRetention } = useFirstSaveRetention();
  const membershipKey = resolveLibraryMembershipKey({
    practiceId,
    practiceSlug,
  });
  const [action, setAction] = useState<LibraryMembershipAction>(initialAction);
  const [actionKey, setActionKey] = useState(membershipKey);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // Reset local action when the product identity changes (not after local claim).
  if (membershipKey !== actionKey) {
    setActionKey(membershipKey);
    setAction(initialAction);
  } else if (initialAction === "in_library" && action !== "in_library") {
    setAction("in_library");
  }

  useEffect(() => {
    if (!membershipKey) {
      return;
    }

    return subscribeLibraryMembership(membershipKey, (nextAction) => {
      setAction(nextAction);
      setErrorMessage(null);
      setIsPending(false);
      inFlightRef.current = false;
    });
  }, [membershipKey]);

  async function handleAdd() {
    if (inFlightRef.current || isPending || action !== "add") {
      return;
    }

    inFlightRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/library/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice_slug: practiceSlug,
          practice_id: practiceId ?? null,
        }),
      });

      if (response.status === 401) {
        router.push(buildAuthRouteHref("/auth/sign-in", signInReturnPath));
        return;
      }

      const body: unknown = await response.json().catch(() => null);

      if (
        (response.status === 200 || response.status === 201) &&
        isClaimLibrarySuccessBody(body)
      ) {
        const nextAction = resolveLibraryActionAfterClaimSuccess();
        setAction(nextAction);

        if (membershipKey) {
          publishLibraryMembership(membershipKey, nextAction);
        }

        onClaimSuccess?.();

        if (body.retention.show_first_save_prompt) {
          showFirstSaveRetention({
            practiceId: body.library.practice_id,
          });
        }

        return;
      }

      const errorCode =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as ApiErrorBody).error === "string"
          ? (body as ApiErrorBody).error
          : undefined;

      if (response.status >= 500) {
        console.error("library_claim_client_error", response.status, errorCode);
      }

      setErrorMessage(mapLibraryClaimButtonError(response.status, errorCode));
    } catch {
      setErrorMessage("Не удалось добавить. Попробуйте ещё раз.");
    } finally {
      inFlightRef.current = false;
      setIsPending(false);
    }
  }

  async function removeFromLibrary(): Promise<boolean> {
    if (inFlightRef.current || isPending) {
      return false;
    }

    if (!practiceId) {
      setErrorMessage("Не удалось удалить. Проверьте данные и попробуйте ещё раз.");
      return false;
    }

    inFlightRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/library/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice_id: practiceId,
        }),
      });

      if (response.status === 401) {
        router.push(buildAuthRouteHref("/auth/sign-in", signInReturnPath));
        return false;
      }

      const body: unknown = await response.json().catch(() => null);

      if (response.status === 200 && isRemoveLibrarySuccessBody(body)) {
        setAction("add");

        if (membershipKey) {
          publishLibraryMembership(membershipKey, "add");
        }

        onRemoveSuccess?.();
        return true;
      }

      const errorCode =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as ApiErrorBody).error === "string"
          ? (body as ApiErrorBody).error
          : undefined;

      if (response.status >= 500) {
        console.error("library_remove_client_error", response.status, errorCode);
      }

      setErrorMessage(mapLibraryRemoveButtonError(response.status, errorCode));
      return false;
    } catch {
      setErrorMessage("Не удалось удалить. Попробуйте ещё раз.");
      return false;
    } finally {
      inFlightRef.current = false;
      setIsPending(false);
    }
  }

  function handleSignIn() {
    if (promoSignup && practiceId) {
      const context = buildPromoSignupContext({
        returnTo: signInReturnPath,
        practiceSlug,
        practiceId,
        intent: "save_practice",
      });

      if (context) {
        storePromoSignupContext(context);
        router.push(buildPromoSignUpHref(context));
        return;
      }
    }

    router.push(buildAuthRouteHref("/auth/sign-in", signInReturnPath));
  }

  function handleClick() {
    if (action === "sign_in") {
      handleSignIn();
      return;
    }

    if (action === "in_library") {
      // Product/listen buttons stay non-destructive in v1.
      router.push("/my-practices");
      return;
    }

    if (action === "add") {
      void handleAdd();
    }
  }

  return {
    action,
    isPending,
    errorMessage,
    buttonLabel: getLibraryButtonLabel(action, isPending, promoSignup),
    inLibrary: action === "in_library",
    handleClick,
    removeFromLibrary,
  };
}
