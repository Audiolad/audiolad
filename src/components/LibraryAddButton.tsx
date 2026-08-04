"use client";

import {
  useLibraryMembership,
  type UseLibraryMembershipInput,
  type UseLibraryMembershipResult,
} from "@/lib/library/use-library-membership";

type LibraryButtonVisualState = Pick<
  UseLibraryMembershipResult,
  "action" | "isPending" | "inLibrary"
>;

export type LibraryAddButtonProps = UseLibraryMembershipInput & {
  /**
   * String className is safe from Server Components.
   * Function form is only for Client Component callers.
   */
  className?: string | ((state: LibraryButtonVisualState) => string);
  /** Visual variant for product page / dark full-player / custom surfaces. */
  variant?: "default" | "practice" | "onDark";
};

function resolvePracticeClassName(inLibrary: boolean): string {
  return `w-full rounded-[22px] border px-5 py-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-80 ${
    inLibrary
      ? "border-[#c9b6ea] bg-[#f3ebff] text-[#7042c5]"
      : "border-[#7042c5] bg-white text-[#7042c5] hover:bg-[#faf6ff]"
  } disabled:cursor-not-allowed disabled:opacity-60`;
}

export default function LibraryAddButton({
  practiceSlug,
  signInReturnPath,
  action: initialAction,
  className,
  practiceId,
  promoSignup = false,
  onClaimSuccess,
  variant = "default",
}: LibraryAddButtonProps) {
  const {
    action,
    isPending,
    errorMessage,
    buttonLabel,
    inLibrary,
    handleClick,
  } = useLibraryMembership({
    practiceSlug,
    signInReturnPath,
    action: initialAction,
    practiceId,
    promoSignup,
    onClaimSuccess,
  });

  const ariaLabel = inLibrary
    ? "Практика уже в Аудиотеке. Перейти в Аудиотеку"
    : buttonLabel;

  let resolvedClassName: string | undefined;

  if (variant === "practice") {
    resolvedClassName = resolvePracticeClassName(inLibrary);
  } else if (typeof className === "function") {
    resolvedClassName = className({ action, isPending, inLibrary });
  } else {
    resolvedClassName = className;
  }

  const errorClassName =
    variant === "onDark"
      ? "mt-3 rounded-[16px] border border-white/20 bg-white/10 px-4 py-3 text-center text-sm leading-5 text-white/90"
      : "mt-3 rounded-[16px] border border-[#f2d4d8] bg-[#fff7f8] px-4 py-3 text-center text-sm leading-5 text-[#8d4d57]";

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-disabled={isPending}
        aria-busy={isPending}
        aria-label={ariaLabel}
        className={resolvedClassName}
      >
        {inLibrary ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span
              aria-hidden
              className={variant === "onDark" ? "text-white" : "text-[#7042c5]"}
            >
              ✓
            </span>
            {buttonLabel}
          </span>
        ) : (
          buttonLabel
        )}
      </button>

      {errorMessage ? (
        <p role="status" aria-live="polite" className={errorClassName}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
