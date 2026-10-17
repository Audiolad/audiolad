import type { Metadata } from "next";

import BusinessAppMusicPage from "@/app/business-app/music/page";
import { BUSINESS_GUEST_COFFEE_URL } from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Звучание кофейни – АудиоЛад Бизнес",
  description: "Настройте звучание кофейни и послушайте подборки в кабинете АудиоЛад Бизнес без регистрации.",
  alternates: { canonical: BUSINESS_GUEST_COFFEE_URL },
};

/**
 * a8240527 — permanent guest entry https://business.audiolad.ru/guest/coffee (printed in the
 * PDF atlas, linked from every atlas CTA). No account required. It is the cabinet's own Music
 * section inside the shared BusinessAppShell (sidebar / bottom nav), not a separate guest app.
 */
export default BusinessAppMusicPage;
