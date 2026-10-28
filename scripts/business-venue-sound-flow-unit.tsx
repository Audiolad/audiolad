/**
 * Owner phone, «Управление кофейней» (bug 2026-10-28 22:57 MSK).
 * «Создать атмосферу» looked dead: the #1044 «Да / Отмена» card was rendered inline above the
 * sound block, off-screen at 390px. «Изменить звучание» linked to the same page.
 * Now the picker opens under the button, the confirm is a fixed overlay, and the owner
 * sends the built atmosphere with «Отправить в кофейню».
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import BusinessPlayerSettings from "../src/components/business-app/BusinessPlayerSettings";
import VenueConfirmDialog from "../src/components/business-app/VenueConfirmDialog";
import VenueControlPanel from "../src/components/business-app/VenueControlPanel";

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

// 2. Panel: renamed copy, «Сохранить название» right under the name, picker right under «Изменить звучание».
{
  const closed = inRouter(
    <VenueControlPanel locationId="loc-1" locationName="Кофе" pointCanEdit soundSlot={<p data-testid="slot">picker</p>} />,
  );
  assert.match(closed, /Управление кофейней/);
  assert.match(closed, /Название кофейни/);
  assert.doesNotMatch(closed, /точк/i);
  assert.match(closed, /Пауза, продолжение, следующий трек и отправка атмосферы спрашивают подтверждение и уходят в кофейню\. Слушать у себя это не включает\./);
  assert.doesNotMatch(closed, /Каждое действие/);
  assert.doesNotMatch(closed, /—/);
  assert.doesNotMatch(closed, /data-testid="slot"/, "picker stays closed until the owner asks");
  assert.match(closed, /data-testid="biz-venue-atmosphere-toggle"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*data-testid="biz-venue-atmosphere-toggle"/);
  const name = at(closed, "biz-venue-name");
  const rename = at(closed, "biz-venue-rename");
  const toggle = at(closed, "biz-venue-atmosphere-toggle");
  assert.ok(name < rename && rename < toggle, "«Сохранить название» sits directly under the name field");
  const between = closed.slice(name, rename);
  assert.equal((between.match(/<button|<a /g) || []).length, 1, "nothing between the name field and its save button");

  const open = inRouter(
    <VenueControlPanel locationId="loc-1" locationName="Кофе" pointCanEdit soundInitiallyOpen soundSlot={<p data-testid="slot">picker</p>} />,
  );
  const openToggle = at(open, "biz-venue-atmosphere-toggle");
  const panel = at(open, "biz-venue-sound-panel");
  const slot = at(open, "slot");
  const pairing = open.indexOf("Получить код для устройства");
  assert.ok(openToggle < panel && panel < slot, "picker renders right under «Изменить звучание»");
  assert.doesNotMatch(open.slice(openToggle, panel), /<p[ >]/, "nothing between the button and the picker");
  assert.ok(pairing < 0 || slot < pairing, "picker comes before the device pairing card");

  const home = inRouter(<VenueControlPanel locationId="loc-1" locationName="Кофе" pointCanEdit />);
  assert.match(home, /href="\/preferences\?sound=open"[^>]*data-testid="biz-venue-atmosphere-link"/);

  const source = read("src/components/business-app/VenueControlPanel.tsx");
  assert.match(source, /scrollIntoView\(/);
}

// 3. Owner flow: build locally, then «Отправить в кофейню» through the confirm.
{
  const source = read("src/components/business-app/BusinessPlayerSettings.tsx");
  assert.match(source, /Отправить в кофейню/);
  assert.match(source, /data-testid="biz-atmosphere-send-venue"/);
  assert.match(source, /text: VENUE_SEND_CONFIRM/);
  assert.match(source, /Отправлено\. В кофейне новое звучание начнётся со следующего трека\./);
  // Point device waits for the server: a 403 must not look like success, and it says where to change it.
  assert.match(source, /persisted\.then\(\(error\) => \(error \? \("failed" as const\)/);
  assert.match(source, /saveError === POINT_MUSIC_FORBIDDEN \? <PointSoundLockedHow \/>/);
  assert.doesNotMatch(source, /—/);

  const owner = inRouter(<BusinessPlayerSettings locationId="loc-1" />);
  assert.match(owner, /data-testid="biz-create-atmosphere"/);
  assert.doesNotMatch(owner, /biz-venue-confirm/, "no confirm before the owner sends anything");

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
  assert.match(page, /Управление кофейней/);
}

console.log("business venue sound flow: ok");
