/**
 * 8d9cd0af (Sergey 18.10.2026 18:28): the Business status screen shows no per-track list and no
 * per-track wording – one line about automatic inflow, plus short counts once tracks are in.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import BusinessAgreementStatusScreen, {
  BUSINESS_TRACKS_AUTO_LINE,
  businessTrackSummary,
  type BusinessTrackAdmission,
} from "../src/components/author-dashboard/business/BusinessAgreementStatusScreen";

const LINE =
  "После проверки прав все треки аккаунта и всех его авторских пространств попадут в «АудиоЛад Бизнес» автоматически.";
assert.equal(BUSINESS_TRACKS_AUTO_LINE, LINE);

const track = (i: number, over: Partial<BusinessTrackAdmission> = {}): BusinessTrackAdmission => ({
  audioItemId: `t${i}`,
  title: `Уникальный трек ${i}`,
  productTitle: `Альбом ${i}`,
  decision: null,
  reasonCode: null,
  comment: null,
  inBusiness: false,
  ...over,
});
const many = Array.from({ length: 1000 }, (_, i) => track(i, { inBusiness: i % 2 === 0 }));
many[1] = track(1, { decision: "blocked", reasonCode: "other_rightsholder", comment: "секретный комментарий" });
many[3] = track(3, { decision: "proof_requested", reasonCode: "proof_requested" });

assert.deepEqual(businessTrackSummary(many), { inBusiness: 500, restricted: 2 });
assert.deepEqual(businessTrackSummary([]), { inBusiness: 0, restricted: 0 });

const render = (verificationStatus: string | null, tracks: BusinessTrackAdmission[]) =>
  renderToStaticMarkup(
    React.createElement(BusinessAgreementStatusScreen, {
      authorSlug: "a",
      agreement: { accepted: true, version: "2.0" },
      verificationStatus,
      tracks,
    }),
  );

for (const status of [null, "draft", "submitted", "verified"]) {
  const html = render(status, many);
  assert.ok(html.includes(LINE), `auto line shown (${status})`);
  assert.ok(!html.includes("Уникальный трек"), `no track titles (${status})`);
  assert.ok(!html.includes("Альбом 1"), `no product titles (${status})`);
  assert.ok(!html.includes("секретный комментарий"), `no per-track comments (${status})`);
  assert.ok(!html.includes("<ul"), `no list (${status})`);
  assert.ok(!html.includes("3. Треки"), `no «3. Треки» block (${status})`);
  assert.ok(!/Пока не в|Ожидает синхронизации|Проверка одного трека|по любому треку|не подтверждает остальные/.test(html));
  assert.ok(!html.includes("—"), "no em dash");
}

const verified = render("verified", many);
assert.ok(verified.includes("Уже в «АудиоЛад Бизнес» из этого авторского пространства: 500."));
assert.ok(verified.includes("Не допущены или ждут доказательств: 2."));
assert.ok(!render("submitted", many).includes("business-track-summary"), "counts only after verification");
assert.ok(!render("verified", [track(9)]).includes("business-track-summary"), "no counts until tracks are in");
assert.ok(!render("verified", [track(9, { inBusiness: true })]).includes("Не допущены"), "restricted part only when > 0");

const src = readFileSync("src/components/author-dashboard/business/BusinessAgreementStatusScreen.tsx", "utf8");
assert.doesNotMatch(src, /Проверка одного трека|по любому треку|tracks\.map\(/);
assert.doesNotMatch(src, /—/);
// Order on the page: status screen (with the auto line) comes before «Подтверждение правообладателя» form.
const page = readFileSync("src/app/(platform)/author-dashboard/business/page.tsx", "utf8");
assert.ok(page.indexOf("<BusinessAgreementStatusScreen") < page.indexOf("<RightsholderVerificationForm"));

console.log("business-status-no-track-list-unit: ok");
