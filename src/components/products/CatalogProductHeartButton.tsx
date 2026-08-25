"use client";

import type { MouseEvent } from "react";

import type { CatalogCardActionTarget } from "@/lib/catalog/dto";
import { useCatalogLibrarySave } from "@/lib/library/use-catalog-library-save";

type CatalogProductHeartButtonProps = {
  product: CatalogCardActionTarget;
  isAuthenticated: boolean;
  signInReturnPath: string;
};

export default function CatalogProductHeartButton({
  product,
  isAuthenticated,
  signInReturnPath,
}: CatalogProductHeartButtonProps) {
  const { isSaved, isPending, errorMessage, handleClick } = useCatalogLibrarySave({
    practiceId: product.id,
    isSaved: product.isSaved,
    isAuthenticated,
    signInReturnPath,
  });

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    handleClick();
  }

  return (
    <>
      <button
        type="button"
        data-catalog-heart-button
        data-catalog-heart-saved={isSaved ? "true" : "false"}
        aria-label={isSaved ? "Убрать из Аудиотеки" : "Сохранить в Аудиотеку"}
        aria-pressed={isSaved}
        aria-busy={isPending}
        onClick={onClick}
        className={`absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[18px] leading-none shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
          isSaved ? "text-[#7042c5]" : "text-[#4b2f86]"
        }`}
      >
        <span aria-hidden="true">{isSaved ? "♥" : "♡"}</span>
      </button>
      {errorMessage ? (
        <span className="sr-only" role="status" aria-live="polite">
          {errorMessage}
        </span>
      ) : null}
    </>
  );
}
