/**
 * Cabinet entry point of the venue QR sticker (task 90d24628).
 * Owners and managers download their own venue's sticker; anyone else gets 404.
 * The block is in «Управление кофейней» and in «Документы», only with the licence flag on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import VenueControlPanel from "../src/components/business-app/VenueControlPanel";
import VenueLicenceStickerCard, { VENUE_STICKER_CARD_TITLE } from "../src/components/business-app/venue-licence/VenueLicenceStickerCard";
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

  const card = renderToStaticMarkup(<VenueLicenceStickerCard locationId={LOC_A} publicId={PUBLIC_A} placement="documents" />);
  checkCopy(card, "card");
  assert.ok(card.includes(`>${VENUE_STICKER_CARD_TITLE}</h2>`));
  assert.equal(VENUE_STICKER_CARD_TITLE, "QR-наклейка с подтверждением прав на музыку");
  assert.match(card, /Гость наводит камеру телефона и видит, что у кофейни\s+есть лицензия на музыку и до какого числа она действует/);
  assert.ok(card.includes(`href="${venueLicencePublicUrl(PUBLIC_A)}" target="_blank" rel="noopener noreferrer"`));
  assert.match(card, />Открыть страницу проверки</);
  assert.match(card, />Скачать наклейку 80×80 мм</);
  assert.match(card, />Скачать тент А6</);
  assert.ok(card.includes(`href="${venueStickerHref(LOC_A, "square80").replaceAll("&", "&amp;")}"`));
  assert.ok(card.includes(`href="${venueStickerHref(LOC_A, "a6").replaceAll("&", "&amp;")}"`));
  assert.match(card, /data-placement="documents"/);

  const router = {
    back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {},
  } as unknown as React.ContextType<typeof AppRouterContext>;
  function panel(licenceSticker: { publicId: string } | null) {
    return renderToStaticMarkup(
      <AppRouterContext.Provider value={router}>
        <VenueControlPanel locationId={LOC_A} locationName="Образец кофейни" pointCanEdit licenceSticker={licenceSticker} />
      </AppRouterContext.Provider>,
    );
}
  const withSticker = panel({ publicId: PUBLIC_A });
  const stickerInPanel = withSticker.slice(withSticker.lastIndexOf("<section", withSticker.indexOf('data-testid="biz-venue-sticker"')));
  assert.match(stickerInPanel.slice(0, 120), /^<section class="business-app-card[^"]*" data-testid="biz-venue-sticker"/);
  checkCopy(stickerInPanel.slice(0, stickerInPanel.indexOf("</section>")), "panel");
  assert.match(withSticker, /Управление кофейней/);
  assert.ok(withSticker.includes(VENUE_STICKER_CARD_TITLE));
  assert.match(withSticker, /data-placement="venue"/);
  assert.ok(
    withSticker.indexOf('data-testid="biz-venue-control"') < withSticker.indexOf('data-testid="biz-venue-sticker"'),
    "the sticker sits inside «Управление кофейней»",
  );
  const withoutSticker = panel(null);
  assert.equal(withoutSticker.includes(VENUE_STICKER_CARD_TITLE), false, "flag off: no block in «Управление кофейней»");
  assert.equal(withoutSticker.includes(VENUE_STICKER_API_PATH), false);

  // Pages: both places render the same component only with data from loadOwnVenueSticker,
  // and that loader checks the flag before it opens a session.
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const loader = read("src/lib/business-app/venue-licence/sticker-access.server.ts");
  assert.match(loader, /if \(!locationId \|\| !isVenueLicencePublicEnabled\(\)\) return null;/);
  assert.ok(loader.indexOf("isVenueLicencePublicEnabled()") < loader.indexOf("createClient()"));
  assert.doesNotMatch(loader, /createServiceRoleClient/, "the cabinet reads with the caller's session, not the service role");
  const settings = read("src/app/business-app/settings/page.tsx");
  assert.match(settings, /loadOwnVenueSticker\(locationId\)/);
  assert.match(settings, /licenceSticker=\{sticker \? \{ publicId: sticker\.publicId \} : null\}/);
  const documents = read("src/app/business-app/documents/page.tsx");
  assert.match(documents, /loadOwnVenueSticker\(locationId\)/);
  assert.match(documents, /\{sticker \? \(\s*<VenueLicenceStickerCard locationId=\{sticker\.locationId\} publicId=\{sticker\.publicId\} placement="documents" \/>/);
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
