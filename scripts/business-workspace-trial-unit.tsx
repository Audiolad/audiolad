/**
 * Shared business trial for tasks ba344b7f and 1e008ee8.
 * One grant module, one workspace player, guest CTA before and after the 30-minute demo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { signUpAction } from "../src/app/(platform)/auth/sign-up/actions";
import BusinessAppShell from "../src/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import BusinessSoundStudio from "../src/components/business-app/sound/BusinessSoundStudio";
import BusinessWorkspace from "../src/components/business-app/workspace/BusinessWorkspace";
import { activateBusinessTrial, recordAccessActivity, recordPaidRenewal } from "../src/lib/access-grants/apply";
import { businessGiftRulesText } from "../src/lib/access-grants/copy";
import { hashAccessEmail } from "../src/lib/access-grants/email-hash";
import { createMemoryAccessGrantStore } from "../src/lib/access-grants/memory-store";
import {
  addGiftPeriod,
  decideTrialActivation,
  isPeriodActive,
  moscowCalendarDayIndex,
  trialDaysLeft,
} from "../src/lib/access-grants/policy";
import { BUSINESS_PLAN_PERIOD_LABEL, BUSINESS_GIFT_MS, formatBusinessMonthlyPrice } from "../src/lib/business/plan";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import type { GuestCoffeePlaylist } from "../src/lib/business-app/guest-coffee/catalog";
import { GUEST_COFFEE_LIMIT_SECONDS, guestCoffeeLimitState } from "../src/lib/business-app/guest-coffee/limit";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";
import { selectWorkspaceTracks } from "../src/lib/business-workspace/catalog";
import type { WorkspacePageModel } from "../src/lib/business-workspace/model";
import { handleWorkspaceState, handleWorkspaceTrackUrl } from "../src/lib/business-workspace/routes";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DAY = 86_400_000;
const TRACK = "157f8644-4ad1-4bea-9de0-d44f911ae009";
const USER_A = "11111111-2222-4333-8444-555555555555";
const USER_B = "22222222-3333-4444-8555-666666666666";
const EMAIL = "cafe-trial@yandex.ru";

function atMoscow(isoDate: string, hour = 12): Date {
  return new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00+03:00`);
}

const start = atMoscow("2026-03-01", 10);

async function main() {
// ---------------------------------------------------------------- one gift, exact 30*24h
{
  const ends = addGiftPeriod(start);
  assert.equal(ends.getTime() - start.getTime(), BUSINESS_GIFT_MS);
  assert.equal(BUSINESS_GIFT_MS, 30 * DAY);
  assert.equal(isPeriodActive(ends.toISOString(), new Date(ends.getTime() - 1)), true);
  assert.equal(isPeriodActive(ends.toISOString(), ends), false);
  assert.equal(trialDaysLeft(ends, start), 30);
  assert.equal(trialDaysLeft(ends, new Date(ends.getTime() - 1)), 1);
  assert.equal(trialDaysLeft(ends, ends), 0);
  const hash = hashAccessEmail("  Cafe-Trial@Yandex.ru ");
  assert.equal(hash, hashAccessEmail(EMAIL));
  assert.equal(hash?.length, 64);
  assert.doesNotMatch(hash ?? "", /cafe|yandex/i);
}

// ---------------------------------------------------------------- new client, repeat registration, paid, unconfirmed
{
  const store = createMemoryAccessGrantStore();
  assert.equal(
    decideTrialActivation({ now: start, emailConfirmed: false, existing: null, paidUntil: null }).type,
    "unconfirmed",
  );
  assert.equal(store.grants.length, 0, "unconfirmed decision writes nothing");

  const first = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start });
  assert.equal(first.decision, "issued");
  assert.equal(first.access.mode, "trial");
  assert.equal(first.access.player, true);
  assert.equal(first.access.daysLeft, 30);
  assert.equal(store.events.filter((row) => row.name === "trial_started").length, 1);

  const again = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: new Date(start.getTime() + DAY) });
  assert.equal(again.decision, "existing");
  assert.equal(again.grant?.endsAt, first.grant?.endsAt);
  assert.equal(store.grants.length, 1);
  assert.equal(store.events.filter((row) => row.name === "trial_started").length, 1);

  const otherAccount = await activateBusinessTrial(store, { userId: USER_B, email: EMAIL, now: new Date(start.getTime() + 2 * DAY) });
  assert.equal(otherAccount.decision, "existing");
  assert.equal(otherAccount.grant?.endsAt, first.grant?.endsAt);
  assert.equal(store.grants.length, 1, "same address, new registration, no second gift");

  const otherEmail = await activateBusinessTrial(store, { userId: USER_A, email: "other-cafe@yandex.ru", now: start });
  assert.equal(otherEmail.decision, "existing");
  assert.equal(store.grants.length, 1, "same user id cannot open a second gift on another address");
  assert.equal(store.grants[0]?.emailHash, hashAccessEmail(EMAIL));
}

{
  const store = createMemoryAccessGrantStore();
  const paidUntil = new Date(start.getTime() + 60 * DAY).toISOString();
  await store.upsertPaid({
    emailHash: hashAccessEmail(EMAIL)!,
    userId: USER_A,
    kind: "business_new_client",
    paidUntil,
  });
  const kept = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start });
  assert.equal(kept.decision, "paid_kept");
  assert.equal(kept.access.mode, "paid");
  assert.equal(kept.access.player, true);
  assert.equal(store.grants.length, 0, "an existing subscriber does not receive a trial clock");
  assert.equal(store.events.length, 0);
}

{
  const store = createMemoryAccessGrantStore();
  const issued = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start });
  const originalEnd = issued.grant!.endsAt;
  await store.writePlayback({
    userId: USER_A,
    spaceId: "cafe",
    index: 2,
    positionSec: 40,
    volume: 0.4,
    updatedAt: start.toISOString(),
  });
  const paidUntil = new Date(start.getTime() + 40 * DAY);
  const during = await recordPaidRenewal(store, { userId: USER_A, email: EMAIL, paidUntil, now: new Date(start.getTime() + 10 * DAY) });
  assert.equal(during.mode, "paid");
  assert.equal(during.player, true);
  assert.equal(store.grants[0]?.endsAt, originalEnd, "payment during the trial keeps the original gift end");
  assert.equal(store.playback.length, 1);
  const afterGift = await activateBusinessTrial(store, {
    userId: USER_A,
    email: EMAIL,
    now: new Date(Date.parse(originalEnd) + DAY),
  });
  assert.equal(afterGift.access.mode, "paid");
  assert.equal(afterGift.access.player, true, "a paid period keeps the player open after the gift date");
  assert.equal(store.grants.length, 1);
  assert.equal((await store.readPlayback(USER_A, "cafe"))?.index, 2);
}

{
  const store = createMemoryAccessGrantStore();
  const issued = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start });
  const day7 = atMoscow("2026-03-07");
  const day14 = atMoscow("2026-03-14");
  const day30 = atMoscow("2026-03-30");
  assert.equal(moscowCalendarDayIndex(start, day7), 6);
  assert.equal(moscowCalendarDayIndex(start, day14), 13);
  assert.equal(moscowCalendarDayIndex(start, day30), 29);
  const played = await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: start, action: "play" });
  assert.deepEqual(played, ["first_useful_action"]);
  const playedAgain = await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: start, action: "play" });
  assert.deepEqual(playedAgain, []);
  assert.deepEqual(await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: day7, action: "visit" }), ["activity_day_7"]);
  assert.deepEqual(
    await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: day14, action: "visit" }),
    ["activity_day_14"],
  );
  assert.deepEqual(
    await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: day30, action: "visit" }),
    ["activity_day_30"],
  );
  const expiredAt = new Date(Date.parse(issued.grant!.endsAt) + 1000);
  const offer = await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: expiredAt, action: "visit" });
  assert.deepEqual(offer, ["subscription_offer_shown"]);
  const closed = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: expiredAt });
  assert.equal(closed.access.mode, "offer");
  assert.equal(closed.access.player, false);
  assert.equal(store.grants.length, 1, "expiry keeps the grant row");
  const click = await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: expiredAt, action: "offer_click" });
  const clickAgain = await recordAccessActivity(store, { userId: USER_A, email: EMAIL, now: expiredAt, action: "offer_click" });
  assert.deepEqual(click, ["subscription_go_to_payment"]);
  assert.deepEqual(clickAgain, ["subscription_go_to_payment"]);
  assert.equal(store.events.filter((row) => row.name === "subscription_go_to_payment").length, 2);
  const renewed = await recordPaidRenewal(store, {
    userId: USER_A,
    email: EMAIL,
    paidUntil: new Date(expiredAt.getTime() + 30 * DAY),
    now: expiredAt,
  });
  assert.equal(renewed.mode, "paid");
  assert.equal(store.events.filter((row) => row.name === "subscription_renewed").length, 1);
  await recordPaidRenewal(store, {
    userId: USER_A,
    email: EMAIL,
    paidUntil: new Date(expiredAt.getTime() + 60 * DAY),
    now: new Date(expiredAt.getTime() + DAY),
  });
  assert.equal(store.events.filter((row) => row.name === "subscription_renewed").length, 1);
}

// ---------------------------------------------------------------- server catalog and stream gates
{
  const cafe = "11111111-1111-4111-8111-111111111111";
  const unknown = "22222222-2222-4222-8222-222222222222";
  const bad = "33333333-3333-4333-8333-333333333333";
  const other = "44444444-4444-4444-8444-444444444444";
  const conditional = "55555555-5555-4555-8555-555555555555";
  const ids = selectWorkspaceTracks({
    spaceId: "cafe",
    spaceEnabled: true,
    admissions: [
      { spaceId: "cafe", audioItemId: cafe },
      { spaceId: "cafe", audioItemId: unknown },
      { spaceId: "cafe", audioItemId: bad },
      { spaceId: "cafe", audioItemId: conditional },
      { spaceId: "spa", audioItemId: other },
    ],
    eligibility: [
      { audioItemId: cafe, decision: "ELIGIBLE" },
      { audioItemId: unknown, decision: "UNKNOWN" },
      { audioItemId: bad, decision: "INELIGIBLE" },
      { audioItemId: conditional, decision: "CONDITIONAL" },
      { audioItemId: other, decision: "ELIGIBLE" },
    ],
  });
  assert.deepEqual(ids, [cafe]);
  assert.deepEqual(
    selectWorkspaceTracks({
      spaceId: "spa",
      spaceEnabled: false,
      admissions: [{ spaceId: "spa", audioItemId: other }],
      eligibility: [{ audioItemId: other, decision: "ELIGIBLE" }],
    }),
    [],
  );

  let signed = 0;
  const sign = async () => {
    signed += 1;
    return { ok: true as const, url: "https://audiolad.ru/s/track" };
  };
  const closed = await handleWorkspaceTrackUrl(
    { audioItemId: TRACK },
    { access: async () => "closed", allowedIds: async () => [TRACK], sign },
  );
  assert.deepEqual(closed, { ok: false, reason: "no_access" });
  const outside = await handleWorkspaceTrackUrl(
    { audioItemId: TRACK },
    { access: async () => "open", allowedIds: async () => [], sign },
  );
  assert.deepEqual(outside, { ok: false, reason: "not_in_manifest" });
  assert.equal(signed, 0, "signing runs only after both gates");

  let saved = 0;
  let offers = 0;
  const deps = {
    userId: async () => USER_A,
    playerOpen: async () => false,
    savePlayback: async () => {
      saved += 1;
    },
    recordPlay: async () => {},
    recordOfferClick: async () => {
      offers += 1;
    },
  };
  const refused = await handleWorkspaceState(
    { kind: "playback", index: 0, positionSec: 1, volume: 0.5, play: true },
    deps,
  );
  assert.deepEqual(refused, { ok: false, reason: "no_access" });
  assert.equal(saved, 0);
  const clicked = await handleWorkspaceState({ kind: "offer_click" }, deps);
  assert.deepEqual(clicked, { ok: true });
  assert.equal(offers, 1);
}

// ---------------------------------------------------------------- guest 30-minute boundary is unchanged
assert.equal(GUEST_COFFEE_LIMIT_SECONDS, 1800);
assert.equal(guestCoffeeLimitState(1800), "exhausted");
assert.notEqual(guestCoffeeLimitState(1799), "exhausted");
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/workspace"), {
  action: "rewrite_business_app",
  pathname: "/business-app/workspace",
});
for (const api of ["/api/business/workspace/track-url", "/api/business/workspace/state"]) {
  assert.equal(resolveBusinessProxyAction("business.audiolad.ru", api).action, "pass_through", api);
}

// ---------------------------------------------------------------- player: network error, then recovery, then loop
{
  const items: SpaManifestItem[] = [0, 1].map((position) => ({
    position,
    audioItemId: position === 0 ? TRACK : "267f8644-4ad1-4bea-9de0-d44f911ae009",
    trackCode: null,
    title: position === 0 ? "Утро" : "День",
    durationSeconds: 120,
    gainDb: null,
    playableUntil: null,
    offlineAllowed: false,
    offlineCacheUntil: null,
  }));
  let allow = false;
  const audio = {
    src: "",
    currentTime: 0,
    async play() {},
    pause() {},
    removeAttribute() {
      this.src = "";
    },
    load() {},
  };
  const ctl = new SpaOnlinePlayer(
    {
      audio,
      sign: async () => (allow ? { ok: true, data: { url: "https://audiolad.ru/s/ok" } } : { ok: false, reason: "network" }),
      onChange() {},
    },
    items,
  );
  await ctl.playIndex(0);
  assert.equal(ctl.status, "error");
  assert.match(ctl.message ?? "", /Проверьте интернет и нажмите «Играть»/);
  allow = true;
  await ctl.playIndex(0);
  assert.equal(ctl.status, "playing");
  await ctl.playIndex(1);
  assert.equal(ctl.index, 1);
  await ctl.onEnded();
  assert.equal(ctl.index, 0, "the last track continues from the first");
  assert.equal(ctl.status, "playing");
  ctl.dispose();
}

// ---------------------------------------------------------------- registration metadata, not a second signup system
{
  const actions = read("src/app/(platform)/auth/sign-up/actions.ts");
  assert.doesNotMatch(actions, /emailRedirectTo/);
  assert.doesNotMatch(actions, /activateBusinessTrial|createSupabaseAccessGrantStore/);
  const callback = read("src/app/(platform)/auth/callback/route.ts");
  assert.match(callback, /explicitNext/);
  assert.match(callback, /business_trial === "1"/);
  const back = read("src/app/(platform)/auth/business-return/page.tsx");
  const confirmAt = back.indexOf("if (!isEmailConfirmed");
  const activateAt = back.indexOf("await activateBusinessTrial");
  assert.ok(confirmAt >= 0 && activateAt > confirmAt, "unconfirmed email never reaches activation");

  async function submit(next: string | null, authError: string | null = null) {
    const box: { trial?: string } = {};
    const result = await signUpAction(
      {
        firstName: "Анна",
        lastName: "Иванова",
        email: EMAIL,
        password: "password123",
        legalConsent: true,
        marketingConsent: false,
        next,
      },
      {
        createClient: async () => ({
          auth: {
            signUp: async (args: { options?: { data?: Record<string, string> } }) => {
              box.trial = args.options?.data?.business_trial;
              return {
                data: { user: authError ? null : { id: USER_A }, session: null },
                error: authError ? { message: authError } : null,
              };
            },
          },
          rpc: async () => ({ error: null }),
        }),
        onNewListenerCreated: async () => ({ ok: true, status: "sent" }),
      },
    );
    return { result, trial: box.trial };
  }

  const gift = await submit("/auth/business-return");
  assert.equal(gift.result.ok, true);
  assert.equal(gift.trial, "1");
  const listener = await submit("/profile");
  assert.equal(listener.result.ok, true);
  assert.equal(listener.trial, undefined);
  const store = createMemoryAccessGrantStore();
  const duplicate = await submit(null, "User already registered");
  assert.equal(duplicate.result.ok, false);
  assert.equal(store.grants.length, 0, "an already-registered error does not insert a grant");
}

// ---------------------------------------------------------------- screens
const anonymous: BusinessOwnerHomeContext = { status: "anonymous" };
const fakeRouter = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} } as never;
function wrap(pathname: string, node: React.ReactNode) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={fakeRouter}>
      <PathnameContext.Provider value={pathname}>
        <BusinessDomainProvider value={anonymous}>{node}</BusinessDomainProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}
const playlists: GuestCoffeePlaylist[] = [{
  id: "p1",
  authorSlug: "a",
  productSlug: "jazz",
  title: "Джаз для кофеен",
  authorName: "Тёплый такт",
  href: "https://audiolad.ru/practice/a/jazz",
  coverUrl: null,
  coverImage: null,
  updatedAt: null,
  format: null,
  direction: "jazz",
  dayparts: "allday",
  characters: ["cozy"],
  tracks: [{ audioItemId: "t1", title: "Трек", durationSeconds: 180 }],
}];
for (const limit of ["ok", "exhausted"] as const) {
  const html = wrap("/guest/coffee", <BusinessAppShell initialGuestLimit={limit}><main>page</main></BusinessAppShell>);
  assert.match(html, /Получить 30 дней бесплатно/, `${limit}: gift CTA`);
  assert.match(html, /data-testid="biz-connect"/, `${limit}: Подключить stays`);
  assert.match(html, /30 дней в подарок/);
}
{
  const html = wrap("/guest/coffee", <BusinessSoundStudio playlists={playlists} initialLimit="exhausted" />);
  assert.match(html, /data-testid="biz-sound-exhausted"/);
  assert.match(html, /Получить 30 дней бесплатно/);
  assert.match(html, /Подключить/);
}
{
  const workspace = wrap("/workspace", <BusinessAppShell><main>page</main></BusinessAppShell>);
  assert.doesNotMatch(workspace, /biz-guest-status/, "the gift workspace is not the 30-minute guest meter");
}

const workspaceSource = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
assert.doesNotMatch(workspaceSource, /799/);
assert.doesNotMatch(workspaceSource, /autoPlay|autoplay/);
assert.doesNotMatch(workspaceSource, /—/);
assert.doesNotMatch(workspaceSource, /email-hash|supabase-store/);

function model(patch: Partial<WorkspacePageModel>): WorkspacePageModel {
  return {
    spaceId: "cafe",
    spaceTitle: "Кафе, рестораны и отели",
    spaceEnabled: true,
    status: "trial",
    daysLeft: 12,
    endsAtLabel: "12 марта 2026 г., 10:00 МСК",
    priceLabel: formatBusinessMonthlyPrice(),
    periodLabel: BUSINESS_PLAN_PERIOD_LABEL,
    rules: businessGiftRulesText(),
    tracks: [{ audioItemId: TRACK, title: "Утро", durationSeconds: 180 }],
    playback: { index: 0, positionSec: 0, volume: 0.8, updatedAt: start.toISOString() },
    helpHref: "/help/troubleshooting/email-not-received",
    rightsHref: "https://audiolad.ru/b/atlas-kofeen",
    onboardingHref: "/onboarding?type=cafe",
    signUpHref: "https://audiolad.ru/auth/sign-up?next=%2Fauth%2Fbusiness-return",
    signInHref: "https://audiolad.ru/auth/sign-in?next=%2Fauth%2Fbusiness-return",
    cafeHref: "/workspace?space=cafe",
    ...patch,
  };
}
{
  const html = renderToStaticMarkup(<BusinessWorkspace model={model({})} />);
  assert.match(html, /data-testid="biz-workspace-player"/);
  assert.match(html, /Осталось 12 дней/);
  assert.match(html, /biz-workspace-until/);
  assert.match(html, />Играть</);
  assert.match(workspaceSource, /pauseLabel="Стоп"/);
  assert.match(html, /data-testid="biz-workspace-volume"/);
  assert.match(html, /preload="none"/);
  assert.doesNotMatch(html, /autoplay/i);
  assert.match(html, /безлимитн/, "rules say Studio generation is not unlimited");
  assert.match(html, /3 часов/);
}
{
  const html = renderToStaticMarkup(<BusinessWorkspace model={model({ status: "offer", daysLeft: 0, tracks: [] })} />);
  assert.match(html, /data-testid="biz-workspace-offer"/);
  assert.match(html, new RegExp(formatBusinessMonthlyPrice().replace(" ", "\\s")));
  assert.match(html, /в месяц/);
  assert.doesNotMatch(html, /data-testid="biz-workspace-player"/);
  assert.match(html, /Деньги не списываются|ничего не списывает/);
}
{
  const css = read("src/components/business-app/business-app.css");
  const block = css.slice(css.indexOf("a8240527 – one cabinet"));
  assert.match(block, /@media \(max-width: 639px\)[\s\S]*business-app-guest-bar__actions/);
  assert.match(block, /@media \(max-width: 639px\)[\s\S]*business-workspace-volume/);
  const literals = block.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.deepEqual(literals, []);
}

const migration = read("supabase/migrations/20270115120000_access_grants_and_workspace.sql");
const migrationSql = migration.replace(/--[^\n]*/g, "");
assert.doesNotMatch(migrationSql, /\b(DELETE|TRUNCATE|DROP)\b/i);
assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.access_grants/);
assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.business_space_admissions/);
assert.doesNotMatch(migrationSql, /INSERT INTO/i);
assert.doesNotMatch(migrationSql, /REFERENCES\s+auth\.users/i);

const loader = read("src/lib/business-workspace/load.server.ts");
assert.match(loader, /selectWorkspaceTracks/);
assert.match(loader, /resolve_business_track_eligibility/);
assert.doesNotMatch(loader, /guest-coffee\/catalog|GUEST_COFFEE_SHELF/);
const signer = read("src/lib/business-workspace/sign.server.ts");
assert.doesNotMatch(signer, /guest-coffee\/catalog|GUEST_COFFEE_SHELF/);
assert.match(signer, /allowed/);

for (const file of [
  "src/lib/access-grants/copy.ts",
  "src/components/business-app/workspace/BusinessWorkspace.tsx",
  "src/app/(platform)/auth/business-return/page.tsx",
  "src/lib/business/plan.ts",
]) {
  const visible = read(file).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  assert.doesNotMatch(visible, /—/, `${file}: en dash only`);
}

const rules = businessGiftRulesText();
assert.match(rules, /30 дней в подарок/);
assert.match(rules, /не становится безлимитной/);
assert.match(rules, /10800|3 часов|300 МБ|5 дорожек/);
assert.doesNotMatch(rules, /—/);

console.log("business-workspace-trial-unit: ok");
}

void main();
