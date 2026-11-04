/**
 * Owner phone, «Управление кофейней» (bug 2026-10-28 22:57 MSK).
 * «Создать атмосферу» looked dead: the #1044 «Да / Отмена» card was rendered inline above the
 * sound block, off-screen at 390px. «Изменить звучание» linked to the same page.
 * Now the picker opens under the button and the confirm is a fixed overlay.
 * 04.11.2026: the button is the green «Пересобрать атмосферу» and one confirmed step rebuilds
 * the venue playlist (it replaced «Создать атмосферу» + «Отправить в кофейню»).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import BusinessPlayerSettings from "../src/components/business-app/BusinessPlayerSettings";
import VenueConfirmDialog from "../src/components/business-app/VenueConfirmDialog";
import VenueControlPanel from "../src/components/business-app/VenueControlPanel";
import {
  ATMOSPHERE_REBUILD_DONE_NOTE,
  ATMOSPHERE_REBUILD_HINT,
  atmosphereChoiceLabel,
  atmosphereRebuildConfirmText,
} from "../src/lib/business-app/atmosphere-rebuild";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const noop = () => {};
const fakeRouter = { push: noop, replace: noop, refresh: noop, back: noop, forward: noop, prefetch: noop } as never;
const inRouter = (node: React.ReactNode) =>
  renderToStaticMarkup(<AppRouterContext.Provider value={fakeRouter}>{node}</AppRouterContext.Provider>);
const at = (html: string, testid: string) => {
  const i = html.indexOf(`data-testid="${testid}"`);
  assert.ok(i >= 0, `missing ${testid}`);
  return i;
};

// 1. Confirm is a modal overlay, not an inline card somewhere up the page.
{
  const html = renderToStaticMarkup(<VenueConfirmDialog text="Отправить?" onYes={noop} onNo={noop} />);
  assert.match(html, /class="business-venue-confirm"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /data-testid="biz-venue-confirm-yes"[^>]*>Да</);
  assert.match(html, /data-testid="biz-venue-confirm-no"[^>]*>Отмена</);
  const dialog = read("src/components/business-app/VenueConfirmDialog.tsx");
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /Escape/);
  const css = read("src/components/business-app/business-app.css");
  const rule = css.slice(css.indexOf(".business-venue-confirm {"), css.indexOf("}", css.indexOf(".business-venue-confirm {")));
  assert.match(rule, /position: fixed/);
  const z = Number(/z-index: (\d+)/.exec(rule)?.[1]);
  const nav = css.slice(css.indexOf(".business-app-bottom-nav {"));
  const navZ = Number(/z-index: (\d+)/.exec(nav)?.[1] ?? 40);
  assert.ok(z > navZ, `confirm overlay z-index ${z} must be above the bottom nav ${navZ}`);
  assert.match(css, /\.business-venue-sound \{[^}]*scroll-margin-top/);
}

// 2. Panel: renamed copy, no cafe name field (edited in «Профиль»), builder right under «Пересобрать атмосферу».
{
  const closed = inRouter(
    <VenueControlPanel locationId="loc-1" pointCanEdit soundSlot={<p data-testid="slot">picker</p>} />,
  );
  assert.match(closed, /Музыка в зале/);
  assert.doesNotMatch(closed, /Название кофейни/, "the cafe name is edited in «Профиль»");
  assert.doesNotMatch(closed, /biz-venue-name|biz-venue-rename/);
  assert.doesNotMatch(closed, /точк/i);
  assert.match(closed, /Пауза, продолжение, следующий трек и новое звучание уходят в зал после подтверждения\. Вкладка «Музыка» играет только у вас\./);
  assert.equal((closed.match(/подтвержд/g) ?? []).length, 1, "the confirmation is said once in the panel");
  assert.doesNotMatch(closed, /Каждое действие/);
  assert.doesNotMatch(closed, /—/);
  assert.doesNotMatch(closed, /data-testid="slot"/, "picker stays closed until the owner asks");
  assert.match(closed, /data-testid="biz-venue-atmosphere-toggle"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-testid="biz-venue-atmosphere-toggle"/);
  assert.ok(at(closed, "biz-venue-atmosphere-toggle") > 0);
  assert.match(closed, /business-app-btn-cta[^"]*"[^>]*aria-expanded="false"[^>]*data-testid="biz-venue-atmosphere-toggle"[^>]*>Пересобрать атмосферу</, "green main action");
  assert.doesNotMatch(closed, /Изменить звучание/);
  assert.ok(at(closed, "biz-atmosphere-rebuild") < closed.indexOf("Пауза в зале"), "the rebuild block opens the card");
  assert.doesNotMatch(closed, /biz-atmosphere-current/, "no summary without a saved atmosphere");
  const known = inRouter(
    <VenueControlPanel locationId="loc-1" pointCanEdit atmosphereSummary="Уютная, Джаз" soundSlot={<p data-testid="slot">picker</p>} />,
  );
  assert.match(known, /data-testid="biz-atmosphere-current"[^>]*>Сейчас: Уютная, Джаз\.</);

  const open = inRouter(
    <VenueControlPanel locationId="loc-1" pointCanEdit soundInitiallyOpen soundSlot={<p data-testid="slot">picker</p>} />,
  );
  const openToggle = at(open, "biz-venue-atmosphere-toggle");
  const panel = at(open, "biz-venue-sound-panel");
  const slot = at(open, "slot");
  const pairing = open.indexOf("Получить код для устройства");
  assert.ok(openToggle < panel && panel < slot, "builder renders right under «Пересобрать атмосферу»");
  assert.doesNotMatch(open.slice(openToggle, panel), /<p[ >]/, "nothing between the button and the picker");
  assert.ok(pairing < 0 || slot < pairing, "picker comes before the device pairing card");

  const home = inRouter(<VenueControlPanel locationId="loc-1" pointCanEdit />);
  assert.match(home, /href="\/preferences\?sound=open"[^>]*data-testid="biz-venue-atmosphere-link"[^>]*>Пересобрать атмосферу</);

  const source = read("src/components/business-app/VenueControlPanel.tsx");
  assert.match(source, /scrollIntoView\(/);
}

// 3. Owner flow: «Пересобрать атмосферу» – confirm, owner-only save, then the same queue rebuild.
{
  const source = read("src/components/business-app/BusinessPlayerSettings.tsx");
  assert.doesNotMatch(source, /Отправить в кофейню|biz-atmosphere-send-venue|VENUE_SEND_CONFIRM/);
  assert.match(source, /text: atmosphereRebuildConfirmText\(next, venue\.known \? venue\.profile : null\)/);
  assert.match(source, /rebuildLocationAtmosphere\(locationId, draft\)/);
  // The venue row first: a refused save never touches the owner's queue.
  assert.match(source, /persisted\.then\(async \(error\) => \{\s*if \(error\) return "failed" as const;/);
  // The layout player rebuilds even if the owner already left the page (no mounted gate here).
  // Left the page: the open music page owns the queue request (no second rebuild path).
  assert.match(source, /if \(!mounted\.current\) \{\s*announceAtmosphereSaved\(\);\s*return "deferred" as const;\s*\}\s*const result = await \(player\?\.rebuildFromProfile\(rebuildInput\)/);
  assert.match(source, /const rowProfile = saved \? locationSoundProfile\(saved\) : venueProfile\.current;/);
  assert.match(source, /latestVenueProfile\(locationId, rowProfile, saved\?\.settingsVersion \?\? 0\)/);
  {
    const prefs = read("src/components/business-app/workspace/useCafeQueuePreferences.ts");
    assert.match(prefs, /window\.addEventListener\(ATMOSPHERE_SAVED_EVENT, onAtmosphereSaved\)/);
    assert.match(prefs, /window\.removeEventListener\(ATMOSPHERE_SAVED_EVENT, onAtmosphereSaved\)/);
    // The music page cancels its request for the old profile when the profile changes.
    const workspace = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
    assert.match(workspace, /cancelled = true;\s*ac\.abort\(\);/);
    assert.match(workspace, /queue\.profile\.character/);
  }
  assert.match(source, /serialVenueWrite\(locationId, run\)/);
  assert.match(source, /recordVenueSound\(locationId, nextProfile, result\.settingsVersion\)/);
  // Review fixes: a newer action wins, the profile/marker are published only after the save,
  // a failed local rebuild is not reported as success, and venue writes are serialized.
  assert.match(source, /if \(error\) return "failed" as const;\s*\/\/[^\n]*\n\s*if \(generation\.current !== gen\) return "stale" as const;\s*storeBuilt\(\);\s*markAtmosphereRestart\(playingNow\);/);
  assert.match(source, /if \(!pointDevice && !ownerRebuild\) markAtmosphereRestart\(playingNow\);/);
  assert.match(source, /if \(!ownerRebuild\) storeBuilt\(\);/);
  assert.match(source, /if \(ownerRebuild\) return;\s*try \{\s*coffeeStorage\.setItem/);
  assert.match(source, /return "player-failed" as const;/);
  assert.match(source, /if \(result === "player-failed"\) \{\s*setSaveError\(REBUILD_PLAYER_ERROR\);\s*setPhase\("idle"\);/);
  assert.match(source, /if \(!result\.ok\) return result\.error;\s*\/\/[^\n]*\n\s*venueProfile\.current = nextProfile;/);
  assert.match(source, /const persistRebuild = \(nextProfile: GuestCoffeeProfile\): Promise<string \| null> => serialWrite\(/);
  assert.match(source, /persist\(venueOwner \? \(\) => currentVenue\(\)\.profile : profile, mode, queue\.hours\)/);
  assert.match(source, /const ownerRebuild = venueOwner && !venueSide;/);
  // Point device waits for the server: a 403 must not look like success, and it says where to change it.
  assert.match(source, /persisted\.then\(\(error\) => \(error \? \("failed" as const\)/);
  assert.match(source, /saveError === POINT_MUSIC_FORBIDDEN \? <PointSoundLockedHow \/>/);
  assert.doesNotMatch(source, /—/);

  const owner = inRouter(<BusinessPlayerSettings locationId="loc-1" />);
  assert.match(owner, /business-app-btn-cta[^"]*"[^>]*data-testid="biz-atmosphere-rebuild-apply"[^>]*>Пересобрать атмосферу</);
  assert.match(owner, />Новая атмосфера</);
  assert.doesNotMatch(owner, /biz-create-atmosphere/);
  assert.doesNotMatch(owner, /biz-venue-confirm/, "no confirm before the owner asks");
  // Preview («как видит точка») and the hall device: no rebuild.
  const preview = inRouter(<BusinessPlayerSettings locationId="loc-1" venueSide />);
  assert.match(preview, /data-testid="biz-create-atmosphere"/);
  assert.doesNotMatch(preview, /Пересобрать атмосферу|biz-atmosphere-rebuild/);
  const hall = inRouter(<BusinessPlayerSettings locationId="loc-1" pointDevice pointCanEdit venueSide />);
  assert.doesNotMatch(hall, /Пересобрать атмосферу|biz-atmosphere-rebuild/);
  const guest = inRouter(<BusinessPlayerSettings />);
  assert.match(guest, /data-testid="biz-create-atmosphere"/);
  assert.doesNotMatch(guest, /Пересобрать атмосферу/);

  const locked = inRouter(<BusinessPlayerSettings locationId="loc-1" pointDevice pointCanEdit={false} />);
  assert.match(locked, /data-testid="biz-point-sound-locked"/);
  // The venue device cannot open the owner controls: no link to the locked /preferences page here.
  assert.doesNotMatch(locked, /<a [^>]*href=/);
  assert.match(locked, /на телефоне владельца, не на этом устройстве/);
  assert.match(locked, /«Настройка» – «Управление кофейней»/);
  assert.match(locked, /Разрешить менять музыку с устройства в заведении/);
  assert.doesNotMatch(locked, /—/);
}

// 4. Settings page wires the picker into the owner panel.
{
  const page = read("src/app/business-app/settings/page.tsx");
  assert.match(page, /soundSlot=\{<BusinessPlayerSettings/);
  assert.match(page, /soundInitiallyOpen=\{query\.sound === "open"\}/);
  assert.match(page, /businessCabinetCan\(\{ mode: cabinet\.mode \}, "atmosphereRebuild"\)/);
  assert.match(page, /\{canRebuild && locationId \? \(/);
  assert.match(page, /atmosphereSummary=\{saved \? atmosphereChoiceLabel\(saved\) : null\}/);
  assert.match(page, /Управление кофейней/);
}

// 5. Rebuild copy: names the current and the new atmosphere, en dash only.
{
  assert.equal(atmosphereChoiceLabel({ character: "cozy", direction: "jazz" }), "Уютная, Джаз");
  const text = atmosphereRebuildConfirmText({ character: "city", direction: "rhythm" }, { character: "cozy", direction: "jazz" });
  assert.match(text, /^Пересобрать атмосферу\? Текущая подборка \(сейчас: Уютная, Джаз\) заменится новой: /);
  assert.match(text, /музыка не прервётся\.$/);
  assert.doesNotMatch(atmosphereRebuildConfirmText({ character: "city", direction: "rhythm" }, null), /сейчас/);
  for (const copy of [text, ATMOSPHERE_REBUILD_HINT, ATMOSPHERE_REBUILD_DONE_NOTE, read("src/lib/business-app/atmosphere-rebuild.ts")]) {
    assert.doesNotMatch(copy, /—/);
  }
}

console.log("business venue sound flow: ok");
