import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { collectionBoundToUser, collectionHasRoom, loadCollectionPermission } from "@/lib/business-collections/load.server";
import { COLLECTION_ENTRY_COPY as copy } from "@/lib/business-collections/entry";
import { COFFEE_HOSTNAME, coffeeHostEnabled } from "@/lib/business-app/host";
import { businessGuestCoffeeHallRedirect } from "@/lib/business-app/point-device";
import { businessHallDeviceCookie } from "@/lib/business-app/point-session.server";
import { createClient } from "@/lib/supabase/server";
import { publicHostnameFromHeaders } from "@/lib/supabase/cookie-domain";
import CollectionEntry from "./CollectionEntry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Подборка – АудиоЛад Кофейня",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

function Unavailable() {
  return <section className="business-app-span-full business-app-card mx-auto max-w-xl space-y-3" data-testid="collection-unavailable">
    <h1 className="text-2xl font-bold">{copy.unavailableTitle}</h1>
    <p className="text-[var(--biz-text-muted)]">{copy.unavailableText}</p>
  </section>;
}

/**
 * Calm entry screen of a personal link (t1616u–t1618u). The collection is not a separate player:
 * after «Открыть приложение» the visitor is in the ordinary coffee app, whose music holds only
 * this collection. An account already on the link goes straight to the music.
 */
export default async function PersonalCollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // After the rewrite /collection → /business-app/collection, Host is localhost (hotfix 1309).
  if (!(coffeeHostEnabled() && publicHostnameFromHeaders(await headers()) === COFFEE_HOSTNAME)) notFound();
  // A hall device never starts a new account here; it keeps its venue player.
  const hall = businessGuestCoffeeHallRedirect(await businessHallDeviceCookie());
  if (hall) redirect(hall);
  // A revoked or unknown link (open route) never falls through to another collection.
  if ((await searchParams).state === "unavailable") return <Unavailable />;
  const permission = await loadCollectionPermission();
  if (!permission) return <Unavailable />;
  const { data: { user } } = await (await createClient()).auth.getUser();
  let bound = false;
  let room = true;
  try {
    bound = user ? await collectionBoundToUser(permission.id, user.id) : false;
    room = bound || await collectionHasRoom(permission.id, user?.id ?? null);
  } catch { return <Unavailable />; }
  if (bound) redirect("/music");
  return <section className="business-app-span-full business-app-card mx-auto max-w-xl space-y-4" data-testid="collection-welcome">
    <header className="space-y-1">
      <p className="text-sm text-[var(--biz-text-muted)]">{copy.eyebrow}</p>
      <h1 className="text-2xl font-bold" data-testid="collection-title">{permission.title}</h1>
    </header>
    {room ? <>
      <p className="text-[var(--biz-text-muted)]">{copy.lead}</p>
      <CollectionEntry />
    </> : <p data-testid="collection-full">{copy.full}</p>}
  </section>;
}
