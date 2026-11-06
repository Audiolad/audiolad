/**
 * 253821e0, owner decision 02.11.2026: user-visible Business copy does not mention the grace days
 * after the gift or paid period. The grace logic itself (BUSINESS_GRACE_DAYS, policy.ts) is unchanged.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import BusinessHomeAccessCard from "../src/components/business-app/BusinessHomeAccessCard";
import BusinessHallHome, { businessHallAccessNotice } from "../src/components/business-app/BusinessHallHome";
import { BusinessCabinetModeProvider, BusinessEntryProvider } from "../src/components/business-app/BusinessPointMode";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import * as copy from "../src/lib/access-grants/copy";
import { businessAccessLine } from "../src/lib/access-grants/access-line";
import { gracePlaybackUntil } from "../src/lib/access-grants/policy";
import { BUSINESS_GRACE_DAYS } from "../src/lib/business/plan";
import * as guestCoffee from "../src/lib/business-app/guest-coffee/copy";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";

const FORBIDDEN = /льготн|[её]щ[её] (3|три|\$\{BUSINESS_GRACE_DAYS\}) дн|играет [её]щ[её]|grace period|BUSINESS_GRACE_DAYS\}/iu;

assert.equal(BUSINESS_GRACE_DAYS, 3, "copy-only change: grace duration is unchanged");

// 1. Every exported copy string.
for (const [name, value] of Object.entries(copy)) {
  const text = typeof value === "function" ? String((value as () => unknown)()) : String(value);
  assert.doesNotMatch(text, FORBIDDEN, `copy.${name}`);
}
for (const [name, value] of Object.entries(guestCoffee)) {
  assert.doesNotMatch(JSON.stringify(value) ?? "", FORBIDDEN, `guest coffee ${name}`);
}
assert.equal(copy.BUSINESS_GIFT_CLOSING_NOTE, "После 7 подарочных дней нужна оплата, чтобы музыка продолжала играть.");
assert.equal(copy.BUSINESS_PERIOD_ENDED_PAY_NOTE, "Оплатите, чтобы музыка продолжала играть.");

// 2. Business sources that hold user-facing copy (comments excluded).
const roots = [
  "src/app/business-app",
  "src/app/(venue-licence)",
  "src/app/(platform)/auth/business-return",
  "src/components/business-app",
  "src/components/business",
  "src/lib/business-app",
  "src/lib/business-workspace",
  "src/lib/business",
  "src/lib/access-grants/copy.ts",
  "src/lib/access-grants/access-line.ts",
];
function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.(tsx?|mts)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}
const scanned = roots.flatMap(files);
assert.ok(scanned.length > 50, `scanned ${scanned.length} files`);
for (const file of scanned) {
  const visible = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  assert.doesNotMatch(visible, FORBIDDEN, file);
}

// 3. The grace state renders a neutral line with the pay controls and no countdown.
const END = "2026-11-22T14:11:37.000Z";
const owner: BusinessOwnerHomeContext = {
  status: "authenticated",
  owner: { userId: "owner", firstName: "Анна" },
  organizationId: "org",
  organizationName: "Кафе",
  location: null,
  canPay: true,
  offerAccepted: true,
  signals: null,
};
const grace = { mode: "grace" as const, endsAt: END, graceEndsAt: gracePlaybackUntil(END) };
const html = renderToStaticMarkup(
  <BusinessDomainProvider value={owner}>
    <BusinessChromeAccessProvider value={grace}>
      <BusinessHomeAccessCard />
    </BusinessChromeAccessProvider>
  </BusinessDomainProvider>,
);
assert.match(html, /data-mode="grace"/);
assert.match(html, /Оплатите, чтобы музыка продолжала играть\./);
assert.match(html, /data-testid="biz-home-pay-button"/);
assert.doesNotMatch(html, /[её]щ[её] \d+ (день|дня|дней)|остановится|25 ноября/u, "no grace countdown or stop date");
assert.doesNotMatch(html, FORBIDDEN);
assert.doesNotMatch(html, /\u2014/u, "en dash only");

const line = businessAccessLine(grace);
assert.equal(line, "Срок закончился – нужна оплата");
assert.doesNotMatch(line ?? "", /до \d/u, "the access line shows no grace stop date");

// The real hall function ignores the grace end even when layout supplies it.
for (const graceEndsAt of [grace.graceEndsAt, null, "2099-12-31T23:59:59Z"]) {
  const notice = businessHallAccessNotice({ ...grace, graceEndsAt });
  assert.deepEqual(notice, {
    kind: "grace",
    text: "Попросите владельца продлить доступ.",
  });
  assert.ok(notice);
  assert.doesNotMatch(notice.text, /\d|играет до|\u2014/u);
  assert.doesNotMatch(notice.text, FORBIDDEN);
}
assert.equal(businessHallAccessNotice({ mode: "paid", endsAt: END }), null);
assert.equal(businessHallAccessNotice(null), null);
assert.deepEqual(businessHallAccessNotice({ mode: "none", endsAt: END }), {
  kind: "expired",
  text: "Попросите владельца продлить доступ.",
});

// Render the actual hall in every mode, including a stale signed-in owner on a paired device.
// The device mode wins over domain.canPay, so staff never receive a payment link.
for (const mode of ["point", "preview", "owner"] as const) {
  for (const access of [grace, { mode: "none" as const, endsAt: END }]) {
    for (const canPay of [false, true]) {
      const hall = renderToStaticMarkup(
        <BusinessDomainProvider value={{ ...owner, canPay }}>
          <BusinessCabinetModeProvider value={{
            mode, pointReports: mode === "point", pointCanEdit: false,
            pointVenueName: "Кафе", ownerUnlockUntil: null, canPreview: mode === "preview",
          }}>
            <BusinessEntryProvider initialEntry={mode === "preview" ? "venue" : "person"}>
              <BusinessChromeAccessProvider value={access}>
                <BusinessHallHome />
              </BusinessChromeAccessProvider>
            </BusinessEntryProvider>
          </BusinessCabinetModeProvider>
        </BusinessDomainProvider>,
      );
      assert.match(hall, new RegExp(`data-mode="${mode}"`));
      assert.match(hall, /Попросите владельца продлить доступ\./u);
      assert.doesNotMatch(hall, /2026|22 ноября|25 ноября|14:11|играет до|дополнительн|запасн|период закончился|доступ к музыке закончился|\u2014/iu);
      assert.doesNotMatch(hall, FORBIDDEN);
      if (mode === "point") {
        assert.doesNotMatch(hall, /biz-hall-renew|href="\/profile"|Продлить доступ/u);
      } else {
        assert.match(hall, /href="\/profile"[^>]*class="[^"]*business-app-btn-cta[^>]*data-testid="biz-hall-renew"/u);
        assert.match(hall, /Продлить доступ/u);
      }
    }
  }
}

console.log(`business-no-grace-copy-unit: ok (${scanned.length} files)`);
