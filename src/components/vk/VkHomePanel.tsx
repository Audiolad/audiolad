"use client";

import { useEffect, useState } from "react";

import { MaxHomeScreen } from "@/components/max/MaxHome";
import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import type { MaxCatalogProduct } from "@/lib/max/catalog-product";
import { readMaxHomeShelves, type MaxHomeShelfId, type MaxHomeShelves } from "@/lib/max/home";

type VkHomePanelProps = {
  onListenFree: () => void;
  onSlideAction: (slideId: string) => void;
  onOpenSection: (section: PublicCatalogSection) => void;
  onOpenShelf: (shelfId: MaxHomeShelfId) => void;
  onSelectProduct: (product: MaxCatalogProduct) => void;
};

export default function VkHomePanel({
  onListenFree,
  onSlideAction,
  onOpenSection,
  onOpenShelf,
  onSelectProduct,
}: VkHomePanelProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [shelves, setShelves] = useState<MaxHomeShelves | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/vk/home", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        const nextShelves = response.ok ? readMaxHomeShelves(payload) : null;
        if (!nextShelves) {
          setStatus("error");
          setShelves(null);
          return;
        }
        setShelves(nextShelves);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
          setShelves(null);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <MaxHomeScreen
      guestMode
      status={status}
      shelves={shelves}
      onListenFree={onListenFree}
      onSlideAction={onSlideAction}
      onOpenSection={onOpenSection}
      onOpenShelf={onOpenShelf}
      onSelectProduct={onSelectProduct}
    />
  );
}
