import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateSignUpClientFormState } from "../src/lib/auth/sign-up-client-form";
import { extractBusinessFirstName } from "../src/lib/business-app/domain-identity";
import { buildBusinessGreeting } from "../src/lib/business-app/greeting";
import { pointSoundUpdate } from "../src/lib/business-app/point-sound";

assert.equal(extractBusinessFirstName({}), "");
assert.match(buildBusinessGreeting(""), /Добр/);
assert.doesNotMatch(buildBusinessGreeting(""), /владел/);

const listener = evaluateSignUpClientFormState(
  { firstName: "Анна", lastName: "", email: "anna@yandex.ru", password: "password123", legalConsent: true },
  {},
  { submitAttempted: true },
);
assert.equal(listener.isSubmitReady, false);

const trial = evaluateSignUpClientFormState(
  { firstName: "Анна", lastName: "", email: "anna@yandex.ru", password: "password123", legalConsent: true },
  {},
  { submitAttempted: true },
  { lastNameOptional: true },
);
assert.equal(trial.isSubmitReady, true);
assert.equal(trial.lastNameErrorMessage, null);

const sound = pointSoundUpdate({
  ok: true,
  found: true,
  character: "cozy",
  direction: "jazz",
  daypart_mode: "auto",
  energy_offset: 0,
  morning_start: "07:00",
  morning_end: "11:00",
  day_start: "11:00",
  day_end: "16:00",
  evening_start: "16:00",
  evening_end: "20:00",
  point_can_edit_settings: true,
  settings_version: 2,
});
assert.equal(sound?.version, 2);
assert.equal(pointSoundUpdate({ ok: true, found: false }), null);

const home = readFileSync(new URL("../src/components/business-app/BusinessHomePage.tsx", import.meta.url), "utf8");
assert.match(home, /Слушать у себя/);
assert.match(home, /VenueControlPanel/);
const panel = readFileSync(new URL("../src/components/business-app/VenueControlPanel.tsx", import.meta.url), "utf8");
assert.match(panel, /Разрешить менять музыку с устройства в заведении/);
assert.match(panel, /Поставить музыку в зале на паузу\?/);
assert.match(panel, /Запретить устройству в зале менять музыку\?/);
assert.doesNotMatch(panel, /владел/);
const pairing = readFileSync(new URL("../src/components/business-app/PointPairingCard.tsx", import.meta.url), "utf8");
assert.match(pairing, /Получить код для устройства/);
assert.match(pairing, /Отключить устройство/);
const shell = readFileSync(new URL("../src/components/business-app/BusinessAppShell.tsx", import.meta.url), "utf8");
assert.match(shell, /BusinessEntrySwitcher/);
assert.doesNotMatch(shell, /href="\/settings"/);

console.log("business-owner-point-ui-unit: ok");
