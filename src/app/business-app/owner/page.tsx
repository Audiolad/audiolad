import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BusinessOwnerUnlockForm from "@/components/business-app/BusinessOwnerUnlockForm";
import { BUSINESS_OWNER_UNLOCK_SECONDS, safeBusinessNextPath } from "@/lib/business-app/cabinet-mode";
import { loadBusinessCabinetEmail, loadBusinessCabinetMode } from "@/lib/business-app/cabinet-mode.server";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildNamedBusinessPageMetadata } from "@/lib/business-app/seo";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildNamedBusinessPageMetadata(getHostnameFromHeaders(await headers()), "Кабинет владельца");
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Owner unlock on the hall device (cabinet-mode.ts). The owner types the password again; the
 * fresh password sign-in (JWT `amr`) opens the owner cabinet on this browser for 15 minutes.
 * Anywhere else this page has nothing to do and goes on to `next`.
 */
export default async function BusinessOwnerUnlockPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const next = safeBusinessNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const cabinet = await loadBusinessCabinetMode();
  if (!cabinet.pointAlive || cabinet.ownerUnlockUntil) redirect(next);
  const email = await loadBusinessCabinetEmail();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <section className="business-app-card" data-testid="biz-owner-unlock">
        <h1 className="text-[1.45rem] font-bold tracking-tight text-[var(--biz-text)]">Кабинет владельца</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">
          Это устройство в зале. Чтобы открыть оплату, профиль и управление кофейней, введите пароль владельца.
          Кабинет откроется на {Math.round(BUSINESS_OWNER_UNLOCK_SECONDS / 60)} минут, потом устройство вернётся в режим
          точки. Музыка в зале не остановится.
        </p>
        <BusinessOwnerUnlockForm defaultEmail={email} next={next} />
      </section>
    </div>
  );
}
