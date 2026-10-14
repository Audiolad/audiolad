import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SpaDesignPreview from "@/components/business-app/design-preview/SpaDesignPreview";
import { loadSpaPilotContext } from "@/lib/business-app/spa-pilot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Макет кабинета SPA · Аудиолад Бизнес",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function BusinessSpaDesignPreviewPage() {
  const ctx = await loadSpaPilotContext();
  if (!ctx) notFound();

  return <SpaDesignPreview />;
}
