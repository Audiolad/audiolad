import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildCoffeePublicPageMetadata } from "@/lib/business-app/seo";

import PrivacyDocument from "@/components/legal/PrivacyDocument";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Политика обработки персональных данных – АудиоЛад Бизнес";
  return {
    title,
    robots: { index: false, follow: false },
    ...buildCoffeePublicPageMetadata(getHostnameFromHeaders(await headers()), "/documents/privacy", title,
      "Политика обработки и защиты персональных данных пользователей сайта «АудиоЛад»."),
  };
}

/** Public document, like the offer: no account or active subscription required. */
export default function BusinessPrivacyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <article className="business-app-card" data-document-id="privacy">
        <Link href="/documents" className="text-sm text-[var(--biz-accent)]">Все документы</Link>
        <PrivacyDocument />
      </article>
    </div>
  );
}
