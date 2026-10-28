import BusinessMemberOnly from "@/components/business-app/BusinessMemberOnly";
import BusinessSoundStudio from "@/components/business-app/sound/BusinessSoundStudio";
import { loadGuestCoffeeShelf } from "@/lib/business-app/guest-coffee/load.server";
import { guestCoffeeLimitState } from "@/lib/business-app/guest-coffee/limit";
import { GUEST_COFFEE_COPY } from "@/lib/business-app/guest-coffee/copy";
import { loadGuestCoffeeRecommendationPlan } from "@/lib/business-app/guest-coffee/passport.server";
import { peekGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/usage.server";

/**
 * a8240527 – the Music section of the AudioLad Business cabinet. The SAME section is the
 * owner's /music and the guest's permanent entry https://business.audiolad.ru/guest/coffee;
 * both render inside the shared BusinessAppShell. The recommendation plan is built on
 * the server from the verified music passports (passport.server.ts); only ids, track positions
 * and yes / no matches reach the browser.
 */
export default async function BusinessMusicSection() {
  const [{ playlists, plan }, used] = await Promise.all([
    loadGuestCoffeeShelf().then(async (shelf) => ({ playlists: shelf, plan: await loadGuestCoffeeRecommendationPlan(shelf) })),
    peekGuestCoffeeUsage(),
  ]);
  return (
    <div className="business-app-span-full business-music-stage mx-auto max-w-6xl space-y-4" data-testid="biz-music-section">
      <header>
        <p className="business-app-eyebrow">Музыка</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">{GUEST_COFFEE_COPY.title}</h1>
        <p className="mt-1.5 max-w-3xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">{GUEST_COFFEE_COPY.lead}<BusinessMemberOnly guest={` ${GUEST_COFFEE_COPY.leadGuest}`} /></p>
      </header>
      <BusinessSoundStudio playlists={playlists} plan={plan} initialLimit={guestCoffeeLimitState(used)} />
    </div>
  );
}
