"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthorProjectCapacityOfferDialog from "@/components/author-dashboard/AuthorProjectCapacityOfferDialog";
import { trackAuthorProjectCapacityEvent } from "@/lib/author-projects/capacity-analytics";

type ProjectsApiResponse = {
  can_create?: boolean;
  show_capacity_offer?: boolean;
  show_premium_upsell?: boolean;
  unlimited?: boolean;
  error?: string;
};

export default function AuthorCreateProjectCta() {
  const router = useRouter();
  const [canCreate, setCanCreate] = useState(true);
  const [showOffer, setShowOffer] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/author/projects", { cache: "no-store" });
        const payload = (await response.json()) as ProjectsApiResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }
        if (!cancelled) {
          setCanCreate(payload.can_create !== false);
          setShowOffer(
            payload.show_capacity_offer === true ||
              payload.show_premium_upsell === true,
          );
        }
      } catch {
        if (!cancelled) {
          setCanCreate(true);
          setShowOffer(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleClick() {
    void trackAuthorProjectCapacityEvent("author_project_create_clicked", {
      surface: "author_dashboard_cta",
      can_create: canCreate,
    });

    if (canCreate) {
      router.push("/author-dashboard/projects/new");
      return;
    }

    if (showOffer) {
      setOfferOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={handleClick}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(112,66,197,0.28)] transition hover:bg-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60 sm:w-auto"
      >
        <span aria-hidden="true">＋</span>
        Создать новый проект
      </button>
      <AuthorProjectCapacityOfferDialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        surface="author_dashboard_cta"
      />
    </>
  );
}
