/**
 * Shared business trial for tasks ba344b7f and 1e008ee8.
 * One grant module, one workspace player, guest CTA before and after the 30-minute demo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { getSafeNextPath } from "../src/lib/auth/routes";
import { BUSINESS_TRIAL_RETURN_PATH, BUSINESS_TRIAL_SIGN_IN_HREF, businessCabinetOnboardingPath, businessOnboardingEntryHref, safeBusinessWorkspaceReturn } from "../src/lib/access-grants/paths";
import { signUpAction } from "../src/app/(platform)/auth/sign-up/actions";
import BusinessAppShell from "../src/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import BusinessSoundStudio from "../src/components/business-app/sound/BusinessSoundStudio";
import BusinessOnboardingWizardPage from "../src/components/business-app/BusinessOnboardingWizardPage";
import BusinessAtmosphereTrackButton from "../src/components/business-app/BusinessAtmosphereTrackButton";
import BusinessPlayerSettings from "../src/components/business-app/BusinessPlayerSettings";
import BusinessWorkspace from "../src/components/business-app/workspace/BusinessWorkspace";
import { musicPlayerMessage } from "../src/components/business-app/workspace/BusinessCabinetPlayer";
import CafeQueueControls from "../src/components/business-app/workspace/CafeQueueControls";
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
import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon";
import { CHILI_NA_VINILE_AUTHOR_ID } from "../src/lib/authors/chili-na-vinile";
import { JAZZ_RELAX_AUTHOR_ID } from "../src/lib/authors/jazz-relax";
import { KOFEYNIK_AUTHOR_ID } from "../src/lib/authors/kofeynik";
import { GUEST_COFFEE_DIRECTIONS } from "../src/lib/business-app/guest-coffee/catalog";
import { acceptWorkspaceCatalogSourceRow, orderWorkspaceCatalogRows, type WorkspaceCatalogSourceRow } from "../src/lib/business-workspace/candidates";
import { LARA_LARINA_AUTHOR_ID, OLGA_NEVSKAYA_AUTHOR_ID, WORKSPACE_ATMOSPHERE_SOUNDS, sourcesForSpace } from "../src/lib/business-workspace/catalog-sources";
import { selectWorkspaceTracks } from "../src/lib/business-workspace/catalog";
import { WORKSPACE_RIGHTS_CACHE_MS, WORKSPACE_RIGHTS_CONCURRENCY, createTtlDecisionCache, mapPool } from "../src/lib/business-workspace/eligibility-cache";
import { displayWorkspaceTrackTitle } from "../src/lib/business-workspace/display-title";
import { cabinetByteaHex, cabinetDeviceClaimOpen, cabinetDeviceSecretHex, parseCabinetReportBody } from "../src/lib/business-app/cabinet-player-report";
import { BUSINESS_MOBILE_NAV_ITEMS } from "../src/lib/business-app/nav";
import { groupWorkspaceTracks, workspaceAtmosphereStartIndex, workspaceShelfTitle, workspaceShelfTrackNumber } from "../src/lib/business-workspace/shelves";
import { workspaceItems, workspaceDeadlineDelay, workspacePlaybackAllowed, type WorkspacePageModel } from "../src/lib/business-workspace/model";
import { handleWorkspaceState, handleWorkspaceTrackUrl } from "../src/lib/business-workspace/routes";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DAY = 86_400_000;
const TRACK = "157f8644-4ad1-4bea-9de0-d44f911ae009";
const USER_A = "11111111-2222-4333-8444-555555555555";
const USER_B = "22222222-3333-4444-8555-666666666666";
const EMAIL = "cafe-trial@example.test";

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
  const hash = hashAccessEmail("  Cafe-Trial@Example.test ");
  assert.equal(hash, hashAccessEmail(EMAIL));
  assert.equal(hash?.length, 64);
  assert.doesNotMatch(hash ?? "", /cafe|example/i);
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

  const otherEmail = await activateBusinessTrial(store, { userId: USER_A, email: "other-cafe@example.test", now: start });
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

// ---------------------------------------------------------------- retained identities and collisions (including expired windows)
{
  const store = createMemoryAccessGrantStore();
  const first = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start });
  const inherited = await activateBusinessTrial(store, { userId: USER_B, email: EMAIL, now: new Date(start.getTime() + DAY) });
  assert.equal(inherited.grant?.endsAt, first.grant?.endsAt);
  const changed = await activateBusinessTrial(store, { userId: USER_B, email: "changed@example.test", now: new Date(start.getTime() + 31 * DAY) });
  assert.equal(changed.grant?.endsAt, first.grant?.endsAt);
  assert.equal(changed.access.mode, "offer", "inheriting then changing email cannot restart an expired gift");
  const registeredAgain = await activateBusinessTrial(store, { userId: "33333333-4444-4555-8666-777777777777", email: "changed@example.test", now: new Date(start.getTime() + 32 * DAY) });
  assert.equal(registeredAgain.access.mode, "offer", "the changed email is also consumed");
  assert.equal(store.grants.length, 1);
}
for (const reverse of [false, true]) {
  const store = createMemoryAccessGrantStore();
  const original = await activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start });
  const other = await activateBusinessTrial(store, { userId: USER_B, email: "second@example.test", now: new Date(start.getTime() + 20 * DAY) });
  const collided = await activateBusinessTrial(store, {
    userId: reverse ? USER_A : USER_B,
    email: reverse ? "second@example.test" : EMAIL,
    now: new Date(start.getTime() + 31 * DAY),
  });
  assert.equal(collided.access.mode, "offer", "an expired original wins over a live later grant");
  assert.equal(collided.grant?.endsAt, original.grant?.endsAt);
  assert.notEqual(other.grant?.endsAt, original.grant?.endsAt);
  for (const [userId, email] of [[USER_A, EMAIL], [USER_B, "second@example.test"]]) {
    const again = await activateBusinessTrial(store, { userId, email, now: new Date(start.getTime() + 32 * DAY) });
    assert.equal(again.grant?.endsAt, original.grant?.endsAt, "both original identities keep the earliest window");
    assert.equal(again.access.player, false);
  }
  assert.equal(store.grants.length, 2, "collision retains both original rows without issuing another");
}
{
  const store = createMemoryAccessGrantStore();
  const results = await Promise.all(Array.from({ length: 5 }, () => activateBusinessTrial(store, { userId: USER_A, email: EMAIL, now: start })));
  assert.equal(store.grants.length, 1);
  assert.ok(results.every((r) => r.grant?.endsAt === addGiftPeriod(start).toISOString()));
  const max = new Date(start.getTime() + 60 * DAY);
  await recordPaidRenewal(store, { userId: USER_A, email: EMAIL, now: start, paidUntil: max });
  const stale = await recordPaidRenewal(store, {
    userId: USER_A, email: EMAIL, now: new Date(start.getTime() + 40 * DAY),
    paidUntil: new Date(start.getTime() + 35 * DAY),
  });
  assert.equal(store.paid[0].paidUntil, max.toISOString());
  assert.equal(stale.mode, "paid", "access uses the stored maximum even if the supplied renewal is expired");
  assert.equal(stale.endsAt, max.toISOString());
}

// ---------------------------------------------------------------- deadline items, capped timer, hard stop and buffered resume
{
  const end = addGiftPeriod(start).toISOString();
  const deadline = Date.parse(end);
  const items = workspaceItems([{ audioItemId: TRACK, title: "Утро", durationSeconds: 180 }], end);
  assert.equal(items[0].playableUntil?.toISOString(), end);
  assert.equal(workspacePlaybackAllowed(end, deadline - 1), true);
  assert.equal(workspacePlaybackAllowed(end, deadline), false);
  assert.equal(workspacePlaybackAllowed(null, deadline), false);
  assert.equal(workspaceDeadlineDelay(end, deadline - 1), 1);
  assert.equal(workspaceDeadlineDelay(end, deadline), 0);
  assert.equal(workspaceDeadlineDelay(end, deadline + 1), 0);
  assert.equal(workspaceDeadlineDelay(end, start.getTime()), 2 ** 31 - 1);
  for (const pauseFirst of [false, true]) {
    let now = deadline - 1000;
    let playCount = 0;
    let paused = true;
    let stopAt: (() => void) | null = null;
    let delay = -1;
    const audio = {
      src: "", currentTime: 0,
      async play() { playCount++; paused = false; },
      pause() { paused = true; },
      removeAttribute() { this.src = ""; },
      load() {},
    };
    const ctl = new SpaOnlinePlayer({
      audio, now: () => now, onChange() {},
      sign: async () => ({ ok: true, data: { url: "https://example.test/track" } }),
      setTimer: (fn, ms) => { stopAt = fn; delay = ms; return 1; },
      clearTimer: () => { stopAt = null; },
    }, items);
    await ctl.playIndex(0);
    assert.equal(delay, 1000);
    if (pauseFirst) await ctl.toggle();
    now = deadline;
    if (pauseFirst) await ctl.toggle();
    else {
      const fire = stopAt as (() => void) | null;
      assert.ok(fire);
      fire();
    }
    assert.equal(paused, true, "no buffered audio plays at the deadline");
    assert.equal(audio.src, "");
    await ctl.toggle();
    assert.equal(playCount, 1, "expired buffered audio never resumes");
    ctl.dispose();
  }
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
for (const api of ["/api/business/workspace/track-url", "/api/business/workspace/state", "/api/business/workspace/queue"]) {
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
  assert.match(callback, /getSafeNextPath/);
  assert.doesNotMatch(callback, /resolveValidatedNextPath/);
  assert.equal(getSafeNextPath("/my-practices", BUSINESS_TRIAL_RETURN_PATH), "/my-practices");
  assert.equal(getSafeNextPath(BUSINESS_TRIAL_RETURN_PATH), BUSINESS_TRIAL_RETURN_PATH);
  for (const next of [null, "//example.test", "/auth/sign-in"]) {
    assert.equal(getSafeNextPath(next, BUSINESS_TRIAL_RETURN_PATH), BUSINESS_TRIAL_RETURN_PATH);
    assert.equal(getSafeNextPath(next, "/profile"), "/profile");
  }
  assert.match(callback, /business_trial === "1"/);
  const back = read("src/app/(platform)/auth/business-return/page.tsx");
  const confirmAt = back.indexOf("if (!isEmailConfirmed");
  const activateAt = back.indexOf("await activateBusinessTrial");
  assert.ok(confirmAt >= 0 && activateAt > confirmAt, "unconfirmed email never reaches activation");

  async function submit(next: string | null, authError: string | null = null) {
    const box: { trial?: string } = {};
    const previousCorporateDomains = process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS;
    process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS = "example.test";
    try {
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
    } finally {
      if (previousCorporateDomains === undefined) {
        delete process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS;
      } else {
        process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS = previousCorporateDomains;
      }
    }
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
{
  const html = wrap("/guest/coffee", <BusinessAppShell initialGuestLimit="ok"><main>page</main></BusinessAppShell>);
  assert.match(html, /Получить 30 дней бесплатно/, "gift CTA before the meter runs out");
  assert.match(html, /data-testid="biz-connect"/);
  assert.match(html, /30 дней в подарок – полный доступ ко всем функциям/);
  assert.doesNotMatch(html, /30 минут/, "top banner does not mention the 30 minutes yet");
}
{
  const html = wrap("/guest/coffee", <BusinessAppShell initialGuestLimit="exhausted"><main>page</main></BusinessAppShell>);
  assert.match(html, /Гостевые 30 минут закончились/);
  assert.match(html, /data-testid="biz-guest-register"/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/auth\/sign-up\?next=/);
  assert.match(html, /data-testid="biz-connect"/, "Подключить stays");
}
{
  const html = wrap("/guest/coffee", <BusinessSoundStudio playlists={playlists} initialLimit="exhausted" />);
  assert.match(html, /data-testid="biz-sound-exhausted"/);
  assert.match(html, /Зарегистрироваться/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/auth\/sign-up\?next=/);
  assert.match(html, /Подключить/);
}
{
  const workspace = wrap("/workspace", <BusinessAppShell><main>page</main></BusinessAppShell>);
  assert.doesNotMatch(workspace, /biz-guest-status/, "the gift workspace is not the 30-minute guest meter");
}

const workspaceSource = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
const playerSource = read("src/components/business-app/workspace/BusinessCabinetPlayer.tsx");
assert.doesNotMatch(workspaceSource, /799/);
assert.doesNotMatch(workspaceSource, /autoPlay|autoplay/);
assert.doesNotMatch(workspaceSource, /—/);
assert.doesNotMatch(workspaceSource, /email-hash|supabase-store/);
assert.match(playerSource, /--biz-cabinet-player-height/, "the sticky bar reports its height");
assert.match(
  read("src/components/business-app/business-app.css"),
  /padding-bottom:\s*calc\(var\(--biz-bottom-nav-height\) \+ var\(--biz-cabinet-player-height, 4rem\) \+ env\(safe-area-inset-bottom, 0px\)\)/,
  "content clears the measured bar, the mobile nav and the safe area",
);

function model(patch: Partial<WorkspacePageModel>): WorkspacePageModel {
  return {
    spaceId: "cafe",
    spaceTitle: "Кафе, рестораны и отели",
    spaceEnabled: true,
    status: "trial",
    daysLeft: 12,
    endsAtLabel: "12 марта 2026 г., 10:00 МСК",
    endsAt: addGiftPeriod(start).toISOString(),
    priceLabel: formatBusinessMonthlyPrice(),
    periodLabel: BUSINESS_PLAN_PERIOD_LABEL,
    rules: businessGiftRulesText(),
    tracks: [{ audioItemId: TRACK, title: "Утро", durationSeconds: 180, authorId: null, authorName: null, albumTitle: null, shelf: "cafe" }],
    needsVenue: false,
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
  assert.match(html, /aria-label="Закрыть плеер"/);
  assert.match(html, /data-testid="biz-workspace-player-open"/);
  assert.match(html, /business-cabinet-player__cover/);
  assert.doesNotMatch(playerSource, /Сейчас пауза/);
  assert.match(playerSource, /setBarDismissed\(false\)/);
  assert.match(playerSource, /setBarDismissed\(true\)/);
  assert.match(
    read("src/components/business-app/business-app.css"),
    /\.business-cabinet-player__time,\s*\.business-cabinet-player \.business-workspace-volume,\s*\.business-cabinet-player__note \{\s*display: none;/,
  );
  assert.match(read("src/components/business-app/business-app.css"), /\.business-cabinet-player \{\s*[^}]*height: 60px/);
  assert.match(html, /data-testid="biz-cafe-queue"/);
  assert.match(html, /data-testid="biz-cafe-auto"/);
  assert.match(html, />Авто</);
  assert.match(html, /Авто: по часам – изменить/);
  assert.match(html, /href="\/preferences#dayparts"/);
  const playAt = html.indexOf('data-testid="biz-now-play"');
  const feedbackAt = html.indexOf('data-testid="biz-cafe-feedback"');
  const daypartAt = html.indexOf('data-testid="biz-cafe-queue"');
  assert.ok(playAt >= 0 && feedbackAt > playAt && daypartAt > feedbackAt, "feedback sits under play, daypart is a later block");
  assert.doesNotMatch(html, /Спокойнее|Бодрее|biz-cafe-calmer|biz-cafe-livelier/);
  assert.match(html, /Больше такой музыки/);
  assert.match(html, /Меньше такой музыки/);
  assert.match(html, /cafe-queue__glyph/);
  assert.doesNotMatch(html, /—/);
  assert.doesNotMatch(html, /Кафе, рестораны и отели/);
  assert.doesNotMatch(html, /data-testid="biz-workspace-days"|data-testid="biz-workspace-rules"|30 дней в подарок/);
  assert.match(html, /data-testid="biz-workspace-progress"/);
  assert.match(html, /data-testid="biz-workspace-time"/);
  assert.match(html, /0:00/);
  assert.match(html, /Музыка включается после нажатия на круглую кнопку\. Громкость и место в подборке сохраняются\./);
  assert.match(html, /после нажатия на круглую кнопку/);
  assert.doesNotMatch(html, /«Играть»/);
  assert.match(html, /aria-label="Играть"/);
  assert.match(html, /business-play-btn--large/);
  assert.match(html, /business-play-btn--compact/);
  assert.match(html, /aria-label="Следующий трек"/);
  assert.match(html, /title="Следующий трек"/);
  assert.match(read("src/components/business-app/business-app.css"), /\.business-transport--large \.business-next-btn \{[^}]*width: 3\.5rem/);
  assert.match(read("src/components/business-app/business-app.css"), /\.business-transport--compact \.business-next-btn \{[^}]*width: 2\.75rem/);
  assert.doesNotMatch(html, />Играть</);
  assert.doesNotMatch(html, />Следующий</);
  assert.equal(musicPlayerMessage("Проверьте интернет и нажмите «Играть»."), "Проверьте интернет и нажмите круглую кнопку.");
  assert.equal(musicPlayerMessage("Нажмите «Играть», чтобы продолжить."), "Нажмите круглую кнопку, чтобы продолжить.");
  assert.doesNotMatch(workspaceSource, /pauseLabel="Стоп"/);
  assert.match(workspaceSource, /energyOffset: 0/);
  assert.doesNotMatch(workspaceSource, /queue\.prefs\.energyOffset/);
  assert.match(workspaceSource, /boundaryAudioItemId/);
  assert.match(html, /data-testid="biz-workspace-volume"/);
  assert.match(html, /preload="none"/);
  assert.doesNotMatch(html, /autoplay/i);
}
{
  const auto = renderToStaticMarkup(
    <CafeQueueControls mode="auto" effectiveDaypart="morning" onDaypart={() => {}} />,
  );
  assert.match(auto, /Авто: сейчас утро \(07:00–11:00\) – изменить/);
  assert.match(auto, /href="\/preferences#dayparts"/);
  assert.match(auto, /data-testid="biz-cafe-auto"[^>]*aria-pressed="true"/);
  assert.match(auto, /data-testid="biz-cafe-daypart-morning"[^>]*aria-pressed="false"/);
  const manual = renderToStaticMarkup(
    <CafeQueueControls mode="evening" effectiveDaypart="morning" onDaypart={() => {}} />,
  );
  assert.match(manual, /Выбрано вручную – изменить/);
  assert.match(manual, /data-testid="biz-cafe-daypart-evening"[^>]*aria-pressed="true"/);
  assert.match(manual, /data-testid="biz-cafe-auto"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(auto + manual, /—/);
}
{
  const tracks = Array.from({ length: 8 }, (_, index) => ({
    audioItemId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Трек ${index + 1}`,
    durationSeconds: 120,
    authorId: null,
    authorName: null,
    albumTitle: null,
    shelf: "cafe" as const,
  }));
  const many = renderToStaticMarkup(<BusinessWorkspace model={model({ tracks })} />);
  const queueHtml = many.slice(many.indexOf('data-testid="biz-now-queue"'));
  assert.equal((queueHtml.match(/business-atmosphere-track /g) ?? []).length, 3, "only three upcoming rows");
  assert.match(queueHtml, /и ещё 4 трека/);
  assert.doesNotMatch(renderToStaticMarkup(<BusinessWorkspace model={model({})} />), /и ещё/);
}
{
  const settings = renderToStaticMarkup(<BusinessPlayerSettings />);
  assert.match(settings, /id="dayparts"/);
  assert.match(settings, /value="07:00"/);
  assert.match(settings, /value="11:00"/);
  assert.match(settings, /value="16:00"/);
  assert.match(settings, /value="20:00"/);
  assert.match(settings, /Вне трёх интервалов остаётся вечер/);
  assert.match(settings, /data-testid="biz-create-atmosphere"/);
  assert.match(settings, /Создать атмосферу/);
  assert.doesNotMatch(settings, /Атмосфера создана/);
  assert.doesNotMatch(settings, /—/);
  const settingsSource = read("src/components/business-app/BusinessPlayerSettings.tsx");
  assert.match(settingsSource, /AtmosphereAssembling/);
  assert.match(settingsSource, /rebuildFromProfile/);
  assert.match(settingsSource, /Атмосфера создана/);
  assert.match(settingsSource, /Перейти в плеер/);
  assert.match(settingsSource, /markAtmosphereRestart/);
  assert.match(playerSource, /rebuildFromProfile/);
  assert.match(playerSource, /applyAtmosphereQueue/);
  assert.match(playerSource, /peekAtmosphereRestart/);
  assert.match(playerSource, /playingNow/);
  assert.match(playerSource, /playIndex\(start\)/);
  assert.match(workspaceSource, /atmospherePlaybackPlan/);
  assert.match(workspaceSource, /takeAtmosphereRestart/);
  assert.match(playerSource, /boundaryAudioItemId/);
  assert.doesNotMatch(settingsSource, /—/);
}
{
  const html = renderToStaticMarkup(<BusinessWorkspace model={model({ status: "offer", daysLeft: 0, tracks: [] })} />);
  assert.match(html, /data-testid="biz-workspace-offer"/);
  assert.match(html, /Подарочный период закончился 12 марта 2026 г\., 10:00 МСК\. Полный плеер закрыт\./);
  assert.match(html, /href="\/#dostup"/);
  assert.match(html, /Условия и подписка/);
  assert.doesNotMatch(html, /data-testid="biz-workspace-player"/);
  assert.doesNotMatch(html, /Оформить подписку|Кафе, рестораны и отели/);
}
{
  const css = read("src/components/business-app/business-app.css");
  const block = css.slice(css.indexOf("a8240527 – one cabinet"));
  assert.match(block, /@media \(max-width: 639px\)[\s\S]*business-app-guest-bar__actions/);
  assert.match(block, /@media \(max-width: 639px\)[\s\S]*business-workspace-volume/);
  const literals = block.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.deepEqual(literals, []);
}

{
  const html = renderToStaticMarkup(<BusinessWorkspace model={model({ status: "unavailable" })} />);
  assert.match(html, /href="\/music"[^>]*>Перейти и повторить/);
  assert.doesNotMatch(html, /href="\/help"/);
  const back = read("src/app/(platform)/auth/business-return/page.tsx");
  assert.doesNotMatch(back, /href="\/help"/);
  assert.match(back, /href=\{BUSINESS_TRIAL_RETURN_PATH\}/);
  const landing = read("src/components/business/BusinessLandingView.tsx");
  assert.doesNotMatch(landing, /href="#listen"[^>]*>\s*\{BUSINESS_TRIAL_FREE\}/);
  assert.match(landing, /href=\{BUSINESS_TRIAL_SIGN_IN_HREF\}>\s*Уже есть аккаунт – войти/);
  assert.ok(BUSINESS_TRIAL_SIGN_IN_HREF.includes("next=%2Fauth%2Fbusiness-return"));
  assert.match(playerSource, /workspaceItems\(current\.tracks, current\.endsAt\)/);
  assert.match(workspaceSource, /setTimeout\(check, workspaceDeadlineDelay/);
  assert.match(playerSource, /applyManifest\(null\)/);
  assert.doesNotMatch(playerSource, /—/);
  assert.match(read("src/app/api/business/workspace/state/route.ts"), /export async function GET/);
}

const migration = read("supabase/migrations/20270120120000_access_grants_and_workspace.sql");
const migrationSql = migration.replace(/--[^\n]*/g, "");
assert.doesNotMatch(migrationSql, /\b(DELETE|TRUNCATE|DROP)\b/i);
assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.access_grants/);
assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.business_space_admissions/);
// Function bodies persist identities/grants only at runtime; the migration seeds no rows.
assert.doesNotMatch(migrationSql.replace(/\$\$[\s\S]*?\$\$/g, ""), /INSERT INTO/i);
assert.match(migrationSql, /access_grant_identities ENABLE ROW LEVEL SECURITY/);
assert.match(migrationSql, /pg_advisory_xact_lock/);
assert.match(migrationSql, /ON CONFLICT DO NOTHING/);
assert.match(migrationSql, /ORDER BY g\.starts_at, g\.ends_at/);
assert.doesNotMatch(migrationSql, /REFERENCES\s+auth\.users/i);

const loader = read("src/lib/business-workspace/load.server.ts");
assert.match(loader, /selectWorkspaceTracks/);
assert.match(loader, /resolve_business_track_eligibility/);
assert.match(loader, /cover_url, cover_image, updated_at/);
assert.match(loader, /cabinetAlbumCoverUrl/);
assert.match(read("src/lib/business-workspace/model.ts"), /coverUrl\?: string \| null/);
assert.doesNotMatch(read("src/lib/business-workspace/model.ts"), /audio_path|audioPath|signedUrl|createSignedUrl/);
assert.match(loader, /sourcesForSpace/);
assert.match(loader, /acceptWorkspaceCatalogSourceRow/);
assert.match(loader, /businessManualContentGateEnabled/);
assert.match(loader, /business_content_candidate_albums/);
assert.match(loader, /from\("business_space_admissions"\)/);
assert.doesNotMatch(loader, /bag\.decisions|createTtlDecisionCache/);
assert.match(loader, /"UNKNOWN"/);
assert.doesNotMatch(loader, /guest-coffee\/catalog|GUEST_COFFEE_SHELF/);
const signer = read("src/lib/business-workspace/sign.server.ts");
assert.doesNotMatch(signer, /guest-coffee\/catalog|GUEST_COFFEE_SHELF/);
assert.match(signer, /allowed/);

for (const file of [
  "src/lib/access-grants/copy.ts",
  "src/components/business-app/workspace/BusinessWorkspace.tsx",
  "src/app/(platform)/auth/business-return/page.tsx",
  "src/lib/business/plan.ts",
  "src/lib/business-workspace/catalog-sources.ts",
  "src/lib/business-workspace/shelves.ts",
  "src/components/business-app/BusinessOnboardingWizardPage.tsx",
]) {
  const visible = read(file).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  assert.doesNotMatch(visible, /—/, `${file}: en dash only`);
}

const rules = businessGiftRulesText();
assert.match(rules, /30 дней в подарок/);
assert.match(rules, /не становится безлимитной/);
assert.match(rules, /10800|3 часов|300 МБ|5 дорожек/);
assert.doesNotMatch(rules, /—/);

// ---------------------------------------------------------------- cafe cabinet: curated authors, rights gate, venue link
{
  const cafe = sourcesForSpace("cafe");
  assert.deepEqual(cafe.map((source) => source.authorId), [
    JAZZ_RELAX_AUTHOR_ID,
    KOFEYNIK_AUTHOR_ID,
    CHILI_NA_VINILE_AUTHOR_ID,
    OLGA_NEVSKAYA_AUTHOR_ID,
    LARA_LARINA_AUTHOR_ID,
    AURAFON_AUTHOR_ID,
  ]);
  assert.equal(cafe.find((source) => source.authorId === AURAFON_AUTHOR_ID)?.shelf, "other");
  assert.equal(sourcesForSpace("spa").length, 0);
  assert.deepEqual([...WORKSPACE_ATMOSPHERE_SOUNDS].sort(), GUEST_COFFEE_DIRECTIONS.map((row) => row.id).sort());
  assert.doesNotMatch(read("src/lib/business-workspace/catalog-sources.ts"), /\.eq\(["']name|\.eq\(["']slug/);

  function sourceRow(patch: Partial<WorkspaceCatalogSourceRow>): WorkspaceCatalogSourceRow {
    return {
      audioItemId: TRACK,
      authorId: JAZZ_RELAX_AUTHOR_ID,
      authorName: "Автор",
      albumTitle: "Альбом",
      title: "Трек",
      durationSeconds: 120,
      position: 1,
      practiceStatus: "published",
      productKind: "music",
      catalogVisibility: "listed",
      deletedAt: null,
      audioStatus: "published",
      audioPath: "audio/track.mp3",
      hasActiveDelivery: false,
      ...patch,
    };
  }
  const allowed = new Set([JAZZ_RELAX_AUTHOR_ID]);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({}), allowed), true);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ practiceStatus: "draft" }), allowed), false);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ audioStatus: "draft" }), allowed), false);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ catalogVisibility: "unlisted" }), allowed), false);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ productKind: "practice" }), allowed), false);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ deletedAt: "2026-01-01T00:00:00Z" }), allowed), false);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ audioPath: "  ", hasActiveDelivery: false }), allowed), false);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ audioPath: null, hasActiveDelivery: true }), allowed), true);
  assert.equal(acceptWorkspaceCatalogSourceRow(sourceRow({ authorId: LARA_LARINA_AUTHOR_ID }), allowed), false);

  const ordered = orderWorkspaceCatalogRows([
    { authorId: KOFEYNIK_AUTHOR_ID, albumTitle: "Утро", position: 2, audioItemId: "b" },
    { authorId: JAZZ_RELAX_AUTHOR_ID, albumTitle: "Вечер", position: 1, audioItemId: "a" },
    { authorId: JAZZ_RELAX_AUTHOR_ID, albumTitle: "Вечер", position: 0, audioItemId: "c" },
    { authorId: JAZZ_RELAX_AUTHOR_ID, albumTitle: "Вечер", position: 0, audioItemId: "c" },
  ], [JAZZ_RELAX_AUTHOR_ID, KOFEYNIK_AUTHOR_ID]);
  assert.deepEqual(ordered.map((row) => row.audioItemId), ["c", "a", "b"]);

  const admissions = [
    { spaceId: "cafe" as const, audioItemId: "a" },
    { spaceId: "cafe" as const, audioItemId: "b" },
  ];
  assert.deepEqual(selectWorkspaceTracks({
    spaceId: "cafe",
    spaceEnabled: true,
    admissions,
    eligibility: [
      { audioItemId: "a", decision: "ELIGIBLE" },
      { audioItemId: "b", decision: "UNKNOWN" },
    ],
  }), ["a"], "fallback rows still drop UNKNOWN");
  assert.deepEqual(selectWorkspaceTracks({
    spaceId: "cafe",
    spaceEnabled: true,
    admissions,
    eligibility: admissions.map((row) => ({ audioItemId: row.audioItemId, decision: "UNKNOWN" as const })),
  }), [], "no venue means nothing plays");

  const shelfTracks = [
    { authorId: JAZZ_RELAX_AUTHOR_ID },
    { authorId: KOFEYNIK_AUTHOR_ID },
    { authorId: CHILI_NA_VINILE_AUTHOR_ID },
    { authorId: OLGA_NEVSKAYA_AUTHOR_ID },
    { authorId: LARA_LARINA_AUTHOR_ID },
    { authorId: AURAFON_AUTHOR_ID },
  ];
  assert.equal(workspaceAtmosphereStartIndex(shelfTracks, "jazz"), 0);
  assert.equal(workspaceAtmosphereStartIndex(shelfTracks, "rhythm"), 1);
  assert.equal(workspaceAtmosphereStartIndex(shelfTracks, "calm"), 2);
  assert.equal(workspaceAtmosphereStartIndex(shelfTracks, "melodic"), 3);
  assert.equal(workspaceAtmosphereStartIndex(shelfTracks, "other"), 0);
  assert.equal(workspaceShelfTitle({ authorName: "Аурафон", shelf: "other" }), "Аурафон – другая музыка");
  assert.equal(workspaceShelfTitle({ authorName: "Джаз Релакс", shelf: "cafe" }), "Джаз Релакс");
  assert.equal(workspaceShelfTitle({ authorName: "  ", shelf: "cafe" }), null);

  const grouped = groupWorkspaceTracks([
    { audioItemId: "1", title: "Первый", durationSeconds: 1, authorId: JAZZ_RELAX_AUTHOR_ID, authorName: "Джаз Релакс", albumTitle: "Вечер", shelf: "cafe" },
    { audioItemId: "2", title: "Второй", durationSeconds: 1, authorId: JAZZ_RELAX_AUTHOR_ID, authorName: "Джаз Релакс", albumTitle: "Утро", shelf: "cafe" },
    { audioItemId: "3", title: "Третий", durationSeconds: 1, authorId: AURAFON_AUTHOR_ID, authorName: "Аурафон", albumTitle: "Сон", shelf: "other" },
  ]);
  assert.equal(grouped[0]?.title, "Джаз Релакс");
  assert.deepEqual(grouped[0]?.albums.map((album) => album.title), ["Вечер", "Утро"]);
  assert.equal(grouped[1]?.title, "Аурафон – другая музыка");
  assert.equal(grouped[1]?.firstIndex, 2);
  assert.equal(workspaceShelfTrackNumber(grouped[0]!, "1"), 1);
  assert.equal(workspaceShelfTrackNumber(grouped[0]!, "2"), 2);
  assert.equal(workspaceShelfTrackNumber(grouped[1]!, "3"), 1, "each shelf numbers from 1");
  assert.equal(displayWorkspaceTrackTitle({ title: "Утро", albumTitle: "Джаз" }), "Утро");
  assert.equal(displayWorkspaceTrackTitle({ title: "Аудио 8", albumTitle: "Джаз лаунж" }), "Джаз лаунж – 8");
  assert.equal(displayWorkspaceTrackTitle({ title: "Трек 3", practiceTitle: "Ольга" }), "Ольга");
  assert.equal(displayWorkspaceTrackTitle({ title: "Аудио 10", albumTitle: "Аудио 2" }), null);
  assert.equal(displayWorkspaceTrackTitle({ title: "Трек" }), null);
  assert.deepEqual(
    BUSINESS_MOBILE_NAV_ITEMS.map((item) => item.title),
    ["Главная", "Музыка", "Настройка", "Документы", "Профиль"],
  );
  assert.ok(BUSINESS_MOBILE_NAV_ITEMS.length <= 5);
  const secret = "a".repeat(40);
  assert.equal(parseCabinetReportBody({ source: "cabinet", kind: "heartbeat", deviceSecret: secret })?.kind, "heartbeat");
  assert.equal(parseCabinetReportBody({ kind: "heartbeat", deviceSecret: secret }), null);
  const hex = cabinetDeviceSecretHex(secret);
  assert.equal(hex.length, 64);
  assert.equal(cabinetByteaHex(`\\x${hex}`), hex);
  assert.equal(cabinetDeviceClaimOpen(hex, hex, Date.now(), Date.now()), true);
  assert.equal(cabinetDeviceClaimOpen("b".repeat(64), hex, Date.now(), Date.now()), false);
  assert.equal(cabinetDeviceClaimOpen("b".repeat(64), hex, Date.now() - 6 * 60 * 1000, Date.now()), true);

  let clock = 0;
  const cache = createTtlDecisionCache<"ELIGIBLE" | "UNKNOWN">(WORKSPACE_RIGHTS_CACHE_MS, () => clock);
  assert.equal(WORKSPACE_RIGHTS_CACHE_MS, 5 * 60 * 1000);
  assert.ok(WORKSPACE_RIGHTS_CONCURRENCY >= 2);
  cache.set("loc:track", "ELIGIBLE");
  assert.equal(cache.get("loc:track"), "ELIGIBLE");
  clock = WORKSPACE_RIGHTS_CACHE_MS;
  assert.equal(cache.get("loc:track"), null);
  let active = 0;
  let maxActive = 0;
  const pooled = await mapPool([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(pooled, [2, 4, 6, 8]);
  assert.ok(maxActive <= 2 && maxActive >= 1);

  assert.equal(safeBusinessWorkspaceReturn("/workspace?space=cafe"), "/workspace?space=cafe");
  assert.equal(safeBusinessWorkspaceReturn("/workspace?space=cafe&next=https://evil.test"), "/workspace?space=cafe");
  assert.equal(safeBusinessWorkspaceReturn("//evil.test"), null);
  assert.equal(safeBusinessWorkspaceReturn("https://evil.test/workspace"), null);
  assert.equal(safeBusinessWorkspaceReturn("/onboarding"), null);
  assert.equal(safeBusinessWorkspaceReturn("/workspace?space=nope"), null);
  assert.match(businessCabinetOnboardingPath("cafe"), /^\/onboarding\?type=cafe&next=/);
  assert.match(businessOnboardingEntryHref("cafe"), /^https:\/\/business\.audiolad\.ru\/onboarding\?type=cafe&next=/);
  const back = read("src/app/(platform)/auth/business-return/page.tsx");
  assert.ok(back.indexOf("await activateBusinessTrial") < back.indexOf("await loadBusinessOwnerHomeContext"));
  assert.match(back, /businessOnboardingEntryHref\("cafe"\)/);
  assert.match(back, /!domain\.organizationId/);

  const connect = renderToStaticMarkup(<BusinessWorkspace model={model({
    tracks: [],
    needsVenue: true,
    onboardingHref: businessCabinetOnboardingPath("cafe"),
  })} />);
  assert.match(connect, /data-testid="biz-workspace-connect-venue"/);
  assert.match(connect, /Подключить точку/);
  assert.match(connect, /href="\/onboarding\?type=cafe&amp;next=%2Fworkspace%3Fspace%3Dcafe"/);
  assert.doesNotMatch(connect, /Подборка в этом направлении готовится/);

  const groupedHtml = renderToStaticMarkup(<BusinessWorkspace model={model({
    tracks: [
      { audioItemId: TRACK, title: "Утро", durationSeconds: 180, authorId: JAZZ_RELAX_AUTHOR_ID, authorName: "Джаз Релакс", albumTitle: "Мягкий джаз", shelf: "cafe" },
      { audioItemId: "267f8644-4ad1-4bea-9de0-d44f911ae009", title: "Сон", durationSeconds: 90, authorId: AURAFON_AUTHOR_ID, authorName: "Аурафон", albumTitle: "Ночь", shelf: "other", coverUrl: "https://audiolad.ru/storage/v1/object/public/practice-covers/night/xs.webp" },
    ],
  })} />);
  assert.match(groupedHtml, /data-testid="biz-now-playing"/);
  assert.match(groupedHtml, /Сейчас играет/);
  assert.match(groupedHtml, /data-testid="biz-now-cover"/);
  assert.match(groupedHtml, /business-now__cover" data-has-image="false"/);
  const nowCss = read("src/components/business-app/business-app.css");
  assert.match(nowCss, /\.business-now__title \{[^}]*font-size: 1\.3rem/);
  assert.match(nowCss, /-webkit-line-clamp: 2/);
  assert.match(nowCss, /min-width: 900px\) \{\s*\.business-now__cover \{[^}]*width: 120px/);
  assert.match(nowCss, /\.business-now__title \{\s*font-size: 1\.6rem/);
  const covered = renderToStaticMarkup(<BusinessWorkspace model={model({
    tracks: [{ audioItemId: TRACK, title: "Тёплый вечер в Неаполе у моря и длинное название", durationSeconds: 180, authorId: null, authorName: "Кофейник", albumTitle: "Джаз", shelf: "cafe", coverUrl: "https://audiolad.ru/storage/v1/object/public/practice-covers/jazz/xs.webp" }],
  })} />);
  assert.match(covered, /business-now__cover" data-has-image="true" data-testid="biz-now-cover"/);
  assert.match(covered, /practice-covers\/jazz\/xs\.webp/);
  const denied = renderToStaticMarkup(<BusinessWorkspace model={model({
    tracks: [{ audioItemId: TRACK, title: "Без обложки", durationSeconds: 90, authorId: null, authorName: null, albumTitle: null, shelf: "cafe", coverUrl: "https://example.supabase.co/storage/v1/object/sign/practice-audio/track.mp3?token=secret" }],
  })} />);
  const nowCover = denied.slice(denied.indexOf('data-testid="biz-now-cover"'), denied.indexOf('data-testid="biz-now-progress"'));
  assert.doesNotMatch(nowCover, /<img/);
  assert.match(groupedHtml, /Джаз Релакс/);
  assert.match(groupedHtml, /Мягкий джаз/);
  assert.match(groupedHtml, /data-testid="biz-now-queue"/);
  assert.match(groupedHtml, /Дальше в очереди/);
  assert.match(groupedHtml, /Аурафон/);
  assert.match(groupedHtml, /business-atmosphere-track__cover/);
  assert.match(groupedHtml, /loading="lazy"/);
  assert.match(groupedHtml, /practice-covers\/night\/xs\.webp/);
  const queueHtml = groupedHtml.slice(groupedHtml.indexOf('data-testid="biz-now-queue"'));
  assert.doesNotMatch(queueHtml, /business-atmosphere-track__mark/, "the up-next list has no restarting numbers");
  assert.match(groupedHtml, /business-music-stage/);
  assert.match(groupedHtml, /business-track-panel/);
  assert.doesNotMatch(groupedHtml, /token=|practice-audio|object\/sign/);
  const blocked = renderToStaticMarkup(
    <BusinessAtmosphereTrackButton
      title="Тишина"
      subtitle="Альбом без обложки"
      number={1}
      coverUrl="https://example.supabase.co/storage/v1/object/sign/practice-audio/track.mp3?token=secret"
      onClick={() => {}}
    />,
  );
  assert.doesNotMatch(blocked, /<img/);
  assert.match(blocked, /business-atmosphere-track__mark/);
  assert.match(blocked, />1</);
  const playing = renderToStaticMarkup(
    <BusinessAtmosphereTrackButton
      title="Строка за строкой"
      subtitle="Джаз для работы · Джаз Релакс"
      time="2:37"
      number={5}
      current
      playing
      coverUrl="https://audiolad.ru/storage/v1/object/public/practice-covers/jazz/xs.webp"
      onClick={() => {}}
    />,
  );
  assert.match(playing, /data-current="true"/);
  assert.match(playing, /data-playing="true"/);
  assert.match(playing, /♪/);
  assert.match(playing, /loading="lazy"/);
  assert.doesNotMatch(playing, /—/);
  assert.match(groupedHtml, /data-testid="biz-workspace-player"/);
  assert.doesNotMatch(groupedHtml, /«Играть»/);
  assert.doesNotMatch(groupedHtml, /Играть эту подборку/);

  const withPoint: BusinessOwnerHomeContext = {
    status: "authenticated",
    owner: { userId: USER_A, firstName: "Анна" },
    location: {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      name: "Утро",
      businessCategory: "Кафе",
      countryCode: "RU",
      timezone: "Europe/Moscow",
      status: "active",
      defaultZoneId: null,
    },
    organizationName: "Кофейня",
    organizationId: "22222222-2222-4222-8222-222222222222",
    signals: null,
  };
  const cabinetLink = renderToStaticMarkup(
    <AppRouterContext.Provider value={fakeRouter}>
      <PathnameContext.Provider value="/onboarding">
        <BusinessDomainProvider value={withPoint}>
          <BusinessOnboardingWizardPage returnHref="/workspace?space=cafe" />
        </BusinessDomainProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  assert.match(cabinetLink, /data-testid="onboarding-open-cabinet"/);
  assert.match(cabinetLink, /href="\/workspace\?space=cafe"/);
  assert.match(cabinetLink, /Открыть кабинет/);
}

console.log("business-workspace-trial-unit: ok");
}

void main();
