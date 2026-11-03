/**
 * Cabinet entry point of the venue QR sticker (task 90d24628).
 * Owners and managers download their own venue's sticker; anyone else gets 404.
 * The block lives only in «Документы» (moved out of «Управление кофейней», 03.11.2026), only with the licence flag on.
 * Each file has «Скачать …» and «Посмотреть» (an in-page preview of the same SVG).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import VenueControlPanel from "../src/components/business-app/VenueControlPanel";
import VenueLicenceStickerCard, { VENUE_QR_PHONE_TEXT, VENUE_QR_PRINT_TEXT, VENUE_STICKER_CARD_TITLE } from "../src/components/business-app/venue-licence/VenueLicenceStickerCard";
import { VENUE_QR_SHOW_LABEL, VenueQrSvg } from "../src/components/business-app/venue-licence/VenueQrFullscreen";
import { venueLicencePublicUrl } from "../src/lib/business-app/host";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { VENUE_LICENCE_PUBLIC_KEY } from "../src/lib/business-app/venue-licence/flag";
import { loadOwnVenueSticker } from "../src/lib/business-app/venue-licence/sticker-access.server";
import { STICKER_CAPTION } from "../src/lib/business-app/venue-licence/sticker";
import {
  authorizeVenueSticker,
  handleVenueStickerDownload,
  type VenueStickerReader,
} from "../src/lib/business-app/venue-licence/sticker-access";
import { venueStickerHref, VENUE_STICKER_API_PATH } from "../src/lib/business-app/venue-licence/sticker-links";
import { VENUE_STICKER_ITEMS, VENUE_STICKER_PREVIEW_LABEL } from "../src/components/business-app/venue-licence/VenueStickerItem";
import { closeModal, openModal, type ModalDocument, type ModalEntry } from "../src/components/business-app/venue-licence/useModalDialog";

// Fictional ids only.
const OWNER = "11111111-1111-4111-8111-111111111111";
const MANAGER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const VIEWER = "44444444-4444-4444-8444-444444444444";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOC_A = "a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0";
const LOC_B = "b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0";
const PUBLIC_A = "0123456789abcdef0123456789abcdef";
const PUBLIC_B = "fedcba9876543210fedcba9876543210";

const locations: Record<string, { organizationId: string; publicId: string }> = {
  [LOC_A]: { organizationId: ORG_A, publicId: PUBLIC_A },
  [LOC_B]: { organizationId: ORG_B, publicId: PUBLIC_B },
};
const members: Array<{ org: string; user: string; role: string }> = [
  { org: ORG_A, user: OWNER, role: "owner" },
  { org: ORG_A, user: MANAGER, role: "manager" },
  { org: ORG_A, user: VIEWER, role: "viewer" },
  { org: ORG_B, user: STRANGER, role: "owner" },
];
let reads = 0;
// Unlike RLS, this reader returns every row: the membership check alone must refuse a stranger.
const reader: VenueStickerReader = {
  async location(id) {
    reads += 1;
    return locations[id] ?? null;
  },
  async memberRole(org, user) {
    return members.find((m) => m.org === org && m.user === user)?.role ?? null;
  },
};

async function download(userId: string | null, query: Record<string, string>, enabled = true) {
  return handleVenueStickerDownload({ enabled, userId, searchParams: new URLSearchParams(query), reader });
}

async function main() {
  // Owner downloads both formats; the QR carries this venue's public page.
  for (const format of ["square80", "a6"] as const) {
    const res = await download(OWNER, { locationId: LOC_A, format });
    assert.equal(res.status, 200, format);
    if (res.status !== 200) throw new Error("unreachable");
    assert.match(res.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(res.svg, format === "a6" ? /width="111mm" height="154mm"/ : /width="86mm" height="86mm"/);
    assert.match(res.svg, /Страница лицензии кофейни/);
    assert.match(res.filename, format === "a6" ? /^audiolad-tent-a6\.svg$/ : /^audiolad-sticker-80x80\.svg$/);
}
  const withLogo = await handleVenueStickerDownload({
    enabled: true,
    userId: OWNER,
    searchParams: new URLSearchParams({ locationId: LOC_A, format: "a6" }),
    reader,
    logoHref: "data:image/webp;base64,AAAA",
  });
  assert.ok(withLogo.status === 200 && withLogo.svg.includes('<image href="data:image/webp;base64,AAAA"'), "the brand mark is inlined");
  assert.equal(STICKER_CAPTION.includes("точк"), false, "the sticker says «кофейня», never «точка»");
  assert.equal(await authorizeVenueSticker(reader, OWNER, LOC_A), PUBLIC_A);
  assert.equal(await authorizeVenueSticker(reader, MANAGER, LOC_A), PUBLIC_A, "a manager of the venue may print it");

  // Other users: the same 404 as for a missing venue, with no id in the answer.
  for (const [who, userId, locationId] of [
    ["stranger on venue A", STRANGER, LOC_A],
    ["owner on venue B", OWNER, LOC_B],
    ["viewer role", VIEWER, LOC_A],
    ["missing venue", OWNER, "c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0"],
  ] as const) {
    const res = await download(userId, { locationId, format: "square80" });
    assert.equal(res.status, 404, who);
    const raw = JSON.stringify(res);
    assert.equal(raw.includes(PUBLIC_A) || raw.includes(PUBLIC_B), false, `${who}: no public id leaks`);
}
  assert.equal(await authorizeVenueSticker(reader, STRANGER, LOC_A), null);

  // Bad input never reaches the database.
  reads = 0;
  assert.equal((await download(OWNER, { locationId: "not-a-uuid", format: "a6" })).status, 404);
  assert.equal((await download(OWNER, { locationId: `${LOC_A}' or 1=1`, format: "a6" })).status, 404);
  assert.equal(reads, 0, "a malformed location id is refused before any read");
  assert.equal((await download(OWNER, { locationId: LOC_A, format: "png" })).status, 400);
  assert.equal((await download(OWNER, { locationId: LOC_A })).status, 400);
  assert.equal((await download(null, { locationId: LOC_A, format: "a6" })).status, 401);

  // Flag off: 404 for everyone, the owner included, without reading.
  reads = 0;
  assert.equal((await download(OWNER, { locationId: LOC_A, format: "a6" }, false)).status, 404);
  assert.equal(reads, 0);

  // The block itself.
  function checkCopy(html: string, label: string) {
    assert.equal(html.includes("\u2014"), false, `${label}: em dash`);
    assert.equal(/точк/i.test(html), false, `${label}: «точка»`);
    assert.equal(html.includes(STRANGER) || html.includes(PUBLIC_B), false, `${label}: another venue`);
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      assert.ok(href.startsWith("/api/") || href.startsWith("https://business.audiolad.ru/v/"), `${label}: unexpected link ${href}`);
    }
}

  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const card = renderToStaticMarkup(<VenueLicenceStickerCard locationId={LOC_A} publicId={PUBLIC_A} />);
  checkCopy(card, "card");
  assert.ok(card.includes(`>${VENUE_STICKER_CARD_TITLE}</h2>`));
  assert.equal(VENUE_STICKER_CARD_TITLE, "QR-наклейка с подтверждением прав на музыку");
  // Phone first (Sergey 03.11 13:32): show the QR on the phone, printing is optional.
  assert.ok(card.includes(`>${VENUE_QR_PHONE_TEXT}</p>`));
  assert.equal(VENUE_QR_PHONE_TEXT, "Пришёл проверяющий – откройте QR-код на телефоне и дайте отсканировать: по нему откроется подтверждение прав на музыку.");
  assert.ok(card.includes(`>${VENUE_QR_PRINT_TEXT}</p>`));
  assert.equal(VENUE_QR_PRINT_TEXT, "Можно один раз распечатать и держать в папке с документами или у кассы.");
  assert.match(card, new RegExp(`<button type="button" class="business-app-btn business-app-btn-cta business-venue-qr-show[^"]*" aria-haspopup="dialog" data-testid="biz-venue-qr-show">${VENUE_QR_SHOW_LABEL}</button>`));
  assert.ok(card.indexOf('data-testid="biz-venue-qr-show"') < card.indexOf('data-testid="biz-venue-print-text"'), "«Показать QR-код» comes before the print options");
  assert.equal(card.includes("target=\"_blank\""), false, "no new tab from the block");
  const qrMarkup = renderToStaticMarkup(<VenueQrSvg url={venueLicencePublicUrl(PUBLIC_A)} label="qr" />);
  assert.match(qrMarkup, /fill="black"/);
  assert.ok(qrMarkup.length > 2000, "the fullscreen QR encodes the licence page");
  const full = read("src/components/business-app/venue-licence/VenueQrFullscreen.tsx");
  assert.match(full, /qrMatrix\(url\)/, "the fullscreen QR uses the same encoder as the sticker");
  assert.match(full, /useModalDialog\(/);
  assert.doesNotMatch(full, /window\.open|target="_blank"|router\.push|location\.href/);
  assert.match(card, />Скачать наклейку 80×80 мм</);
  assert.match(card, />Скачать настольную табличку А6</);
  assert.equal(/тент/i.test(card), false, "«тент» is gone from the visible copy");
  assert.equal(VENUE_STICKER_ITEMS.a6.download, "Скачать настольную табличку А6");
  assert.equal(VENUE_STICKER_ITEMS.square80.download, "Скачать наклейку 80×80 мм");
  // «Посмотреть» next to each download: a button (no navigation, no new tab), the download stays the main green action.
  for (const format of ["square80", "a6"] as const) {
    const row = card.slice(card.indexOf(`data-testid="biz-venue-sticker-row-${format}"`));
    const rowHtml = row.slice(0, row.indexOf("</button>") + 9);
    assert.match(rowHtml, new RegExp(`<a href="[^"]+" download="[^"]+" class="business-app-btn business-app-btn-cta[^"]*" data-testid="biz-venue-sticker-${format}"`));
    assert.match(rowHtml, new RegExp(`<button type="button" class="business-app-btn business-app-btn-secondary[^"]*" aria-haspopup="dialog"[^>]*data-testid="biz-venue-sticker-preview-${format}"[^>]*>${VENUE_STICKER_PREVIEW_LABEL}</button>`));
  }
  assert.equal(card.match(new RegExp(`>${VENUE_STICKER_PREVIEW_LABEL}<`, "g"))?.length, 2);
  assert.equal(card.includes('role="dialog"'), false, "the preview opens only after a tap");
  const item = read("src/components/business-app/venue-licence/VenueStickerItem.tsx");
  assert.match(item, /<img\s+src=\{href\}/, "the preview shows the same SVG the download returns");
  assert.match(item, /createPortal\(/);
  assert.match(item, /useModalDialog\(overlayRef, cardRef, closeRef, onClose\)/);
  modalStackBehaviour();
  assert.doesNotMatch(item, /window\.open|target="_blank"|router\.push|location\.href/, "no new tab and no navigation: the player keeps playing");
  assert.ok(card.includes(`href="${venueStickerHref(LOC_A, "square80").replaceAll("&", "&amp;")}"`));
  assert.ok(card.includes(`href="${venueStickerHref(LOC_A, "a6").replaceAll("&", "&amp;")}"`));

  const router = {
    back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {},
  } as unknown as React.ContextType<typeof AppRouterContext>;
  function panel() {
    return renderToStaticMarkup(
      <AppRouterContext.Provider value={router}>
        <VenueControlPanel locationId={LOC_A} pointCanEdit />
      </AppRouterContext.Provider>,
    );
}
  const panelHtml = panel();
  assert.match(panelHtml, /Музыка в зале/);
  assert.equal(panelHtml.includes(VENUE_STICKER_CARD_TITLE), false, "no QR block in «Управление кофейней»");
  assert.equal(panelHtml.includes(VENUE_STICKER_API_PATH), false);
  assert.equal(panelHtml.includes('data-testid="biz-venue-sticker"'), false);

  // Pages: only «Документы» renders the block, with data from loadOwnVenueSticker,
  // and that loader checks the flag before it opens a session.
  const loader = read("src/lib/business-app/venue-licence/sticker-access.server.ts");
  assert.match(loader, /if \(!locationId \|\| !isVenueLicencePublicEnabled\(\)\) return null;/);
  assert.ok(loader.indexOf("isVenueLicencePublicEnabled()") < loader.indexOf("createClient()"));
  assert.doesNotMatch(loader, /createServiceRoleClient/, "the cabinet reads with the caller's session, not the service role");
  const settings = read("src/app/business-app/settings/page.tsx");
  assert.doesNotMatch(settings, /loadOwnVenueSticker|VenueLicenceStickerCard|licenceSticker/, "settings no longer loads or shows the sticker");
  assert.doesNotMatch(read("src/components/business-app/VenueControlPanel.tsx"), /VenueLicenceStickerCard|licenceSticker/);
  const documents = read("src/app/business-app/documents/page.tsx");
  assert.match(documents, /loadOwnVenueSticker\(locationId\)/);
  assert.match(documents, /\{sticker \? \(\s*<VenueLicenceStickerCard locationId=\{sticker\.locationId\} publicId=\{sticker\.publicId\} \/>/);
  const route = read("src/app/api/business/venue-licence/sticker/route.ts");
  assert.match(route, /if \(!enabled\) return new NextResponse\(null, \{ status: 404/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /createVenueStickerReader\(supabase\)/);
  assert.match(route, /"public", "business", "brand", "mark-leather\.webp"/);

  // Flag off really hides the block: the loader answers null without a session.
  delete process.env[VENUE_LICENCE_PUBLIC_KEY];
  assert.equal(await loadOwnVenueSticker(LOC_A), null);
  process.env[VENUE_LICENCE_PUBLIC_KEY] = "0";
  assert.equal(await loadOwnVenueSticker(LOC_A), null);
  delete process.env[VENUE_LICENCE_PUBLIC_KEY];

  // The download path reaches its handler on the business host.
  assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", VENUE_STICKER_API_PATH, {}), { action: "pass_through" });

  console.log("business-venue-licence-cabinet-unit: ok");
}


main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Shared modal stack behaviour on a minimal fake DOM: Tab / Shift+Tab wrap,
// Escape only closes the top dialog, inert + scroll lock + focus restore,
// overlapping dialogs closed in any order, StrictMode open/close/open.
function modalStackBehaviour() {
  type Key = { key: string; shiftKey: boolean; preventDefault(): void };
  const listeners = new Set<(e: Key) => void>();
  const doc = {
    activeElement: null as unknown,
    body: { style: { overflow: "auto" } },
    addEventListener: (_t: "keydown", l: (e: Key) => void) => void listeners.add(l),
    removeEventListener: (_t: "keydown", l: (e: Key) => void) => void listeners.delete(l),
  } satisfies ModalDocument;
  // Fake focusable: focusing a removed (disconnected) node does nothing, as in a real DOM.
  const focusable = (name: string) => ({ name, isConnected: true, focus() { if (this.isConnected) doc.activeElement = this; } });
  const host = { children: [] as Array<{ name: string; inert: boolean }> };
  const node = (name: string) => {
    const el = { name, inert: false, parentElement: host };
    host.children.push(el);
    return el;
  };
  const app = node("app");
  const press = (key: string, shiftKey = false) => {
    let prevented = false;
    for (const l of [...listeners]) l({ key, shiftKey, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  const dialog = (name: string, closed: string[]) => {
    const a = focusable(`${name}-a`);
    const b = focusable(`${name}-b`);
    const overlay = { ...node(name), contains: (n: unknown) => n === a || n === b };
    host.children[host.children.length - 1] = overlay;
    const card = { contains: (n: unknown) => n === a || n === b, querySelectorAll: () => [a, b] };
    const entry: ModalEntry = { overlay, card, close: () => closed.push(name), previous: doc.activeElement as { focus(): void } | null };
    return { overlay, a, b, entry };
  };
  const opener = focusable("opener");
  opener.focus();
  const closed: string[] = [];
  const A = dialog("A", closed);
  openModal(doc, A.entry);
  A.a.focus();
  assert.equal(doc.body.style.overflow, "hidden");
  assert.equal(app.inert, true, "background inert while open");
  assert.equal(A.overlay.inert, false);
  assert.equal(press("Tab", true), true);
  assert.equal(doc.activeElement, A.b, "Shift+Tab from first wraps to last");
  assert.equal(press("Tab"), true);
  assert.equal(doc.activeElement, A.a, "Tab from last wraps to first");
  // Overlapping: B opened from inside A (A's button has focus).
  const B = dialog("B", closed);
  openModal(doc, B.entry);
  B.a.focus();
  assert.equal(A.overlay.inert, true, "lower dialog inert under the top one");
  assert.equal(listeners.size, 1, "one shared key listener");
  press("Escape");
  assert.deepEqual(closed, ["B"], "Escape closes only the top dialog");
  // Close the lower one first: state must stay locked while B is open.
  // As in React: A's nodes are removed (and its refs cleared) before the effect cleanup runs.
  A.a.isConnected = false;
  A.b.isConnected = false;
  closeModal(doc, A.entry);
  assert.equal(doc.body.style.overflow, "hidden");
  assert.equal(app.inert, true);
  assert.equal(doc.activeElement, B.a, "closing a lower dialog does not steal focus");
  closeModal(doc, B.entry);
  assert.equal(doc.body.style.overflow, "auto", "scroll restored after the last dialog");
  assert.equal(app.inert, false, "background restored after the last dialog");
  assert.equal(listeners.size, 0);
  assert.equal(doc.activeElement, opener, "A is gone, so focus returns to the original page opener");
  // StrictMode: open, cleanup, open again, close.
  opener.focus();
  const C = dialog("C", closed);
  openModal(doc, C.entry);
  closeModal(doc, C.entry);
  openModal(doc, C.entry);
  assert.equal(doc.body.style.overflow, "hidden");
  closeModal(doc, C.entry);
  assert.equal(doc.body.style.overflow, "auto");
  assert.equal(app.inert, false);
  assert.equal(doc.activeElement, opener, "focus restored to the opener");
  // A pre-existing inert sibling is left alone.
  const pre = node("pre");
  pre.inert = true;
  const D = dialog("D", closed);
  openModal(doc, D.entry);
  closeModal(doc, D.entry);
  assert.equal(pre.inert, true, "foreign inert untouched");
}
