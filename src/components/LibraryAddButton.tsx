"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  buildPromoSignUpHref,
  buildPromoSignupContext,
  storePromoSignupContext,
} from "@/lib/promo/signup-context";
import {
  mapLibraryClaimButtonError,
  resolveLibraryActionAfterClaimSuccess,
  type PracticeLibraryAction,
} from "@/lib/products/practice-access-ui";

type LibraryAddButtonProps = {
  practiceSlug: string;
  signInReturnPath: string;
  action: Exclude<PracticeLibraryAction, "hidden">;
  className?: string;
  practiceId?: string;
  promoSignup?: boolean;
};

type ApiErrorBody = {
  error?: string;
};

type ClaimLibrarySuccessBody = {
  library: {
    in_library: boolean;
  };
};

function isClaimLibrarySuccessBody(body: unknown): body is ClaimLibrarySuccessBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "library" in body &&
    typeof (body as ClaimLibrarySuccessBody).library?.in_library === "boolean" &&
    (body as ClaimLibrarySuccessBody).library.in_library === true
  );
}

function getLibraryButtonLabel(
  action: Exclude<PracticeLibraryAction, "hidden">,
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

export default function LibraryAddButton({
  practiceSlug,
  signInReturnPath,
  action: initialAction,
  className,
  practiceId,
  promoSignup = false,
}: LibraryAddButtonProps) {
  const router = useRouter();
  const [action, setAction] = useState(initialAction);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDisabled = isPending || action === "in_library";
  const buttonLabel = getLibraryButtonLabel(action, isPending, promoSignup);

  async function handleAdd() {
    if (isPending || action !== "add") {
      return;
    }

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
        setAction(resolveLibraryActionAfterClaimSuccess());
        router.refresh();
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

    if (action === "add") {
      void handleAdd();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={isPending}
        className={className}
      >
        {buttonLabel}
      </button>

      {errorMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-[16px] border border-[#f2d4d8] bg-[#fff7f8] px-4 py-3 text-center text-sm leading-5 text-[#8d4d57]"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
