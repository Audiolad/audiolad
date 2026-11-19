import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import BusinessGuestStartCta from "@/components/business-app/BusinessGuestStartCta";
import { loadPersonalCollection } from "@/lib/business-collections/load.server";
import { businessAuthHref } from "@/lib/access-grants/paths";
import { COFFEE_HOSTNAME, coffeeHostEnabled } from "@/lib/business-app/host";
import { publicHostnameFromHeaders } from "@/lib/supabase/cookie-domain";
import { BUSINESS_GIFT_DAYS, BUSINESS_PLAN_PERIOD_LABEL, formatBusinessMonthlyPrice } from "@/lib/business/plan";
import CollectionPlayer from "./CollectionPlayer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Личная подборка – АудиоЛад Кофейня",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export default async function PersonalCollectionPage() {
  // After Next rewrite /collection → /business-app/collection, Host is localhost:
  // use the public host (X-Forwarded-Host), not hostnameFromHeaders().
  if (!(coffeeHostEnabled() && publicHostnameFromHeaders(await headers()) === COFFEE_HOSTNAME)) notFound();
  const collection = await loadPersonalCollection();
  if (!collection) return <section className="business-app-card space-y-3">
    <h1>Подборка недоступна</h1>
    <p>Ссылка отозвана или доступ не выдан. Попросите администратора прислать новую ссылку.</p>
  </section>;
  return <section className="business-app-span-full business-app-card space-y-5">
    <header><p className="business-app-eyebrow">Ваша музыкальная подборка</p><h1 className="text-3xl font-bold">{collection.title}</h1></header>
    <p>Слушайте без регистрации и оплаты. Прослушивание не запускает подарочный период для заведения.</p>
    <BusinessGuestStartCta href={businessAuthHref(COFFEE_HOSTNAME, "sign-up", true)}
      className="business-app-btn business-app-btn-cta" testId="collection-gift">
      Подключить заведение – {BUSINESS_GIFT_DAYS} дней в подарок
    </BusinessGuestStartCta>
    <p>Примите оферту, укажите ИНН и адрес в кабинете, затем переходите к оплате {formatBusinessMonthlyPrice()} {BUSINESS_PLAN_PERIOD_LABEL} по текущему тарифу.</p>
    <CollectionPlayer collection={collection} />
  </section>;
}
