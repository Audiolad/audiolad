import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evaluateSignUpClientFormState } from "../src/lib/auth/sign-up-client-form";
import { extractBusinessFirstName } from "../src/lib/business-app/domain-identity";
import { buildBusinessGreeting } from "../src/lib/business-app/greeting";
import { pointDaypart, pointSoundUpdate, venueMinuteOfDay } from "../src/lib/business-app/point-sound";
import { cafeDaypartAtMinute, CAFE_DAYPART_HOURS_DEFAULT } from "../src/lib/business-app/cafe-queue/prefs";

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
assert.equal(sound?.timezone, "Europe/Moscow");
assert.deepEqual(pointSoundUpdate({ ok: true, found: false }), {
  version: 0,
  pointCanEdit: true,
  character: "cozy",
  direction: "jazz",
  daypartMode: "auto",
  energyOffset: 0,
  hours: {
    morning: { start: "07:00", end: "11:00" },
    day: { start: "11:00", end: "16:00" },
    evening: { start: "16:00", end: "20:00" },
  },
  timezone: "Europe/Moscow",
});
const at = new Date("2026-10-28T06:00:00Z");
assert.equal(pointDaypart({ daypartMode: "auto", hours: CAFE_DAYPART_HOURS_DEFAULT, timezone: "Europe/Moscow" }, at), "morning");
assert.equal(cafeDaypartAtMinute(venueMinuteOfDay("UTC", at), CAFE_DAYPART_HOURS_DEFAULT), "evening");
assert.equal(pointDaypart({ daypartMode: "evening", hours: CAFE_DAYPART_HOURS_DEFAULT, timezone: "UTC" }, at), "evening");

const home = readFileSync(new URL("../src/components/business-app/BusinessHomePage.tsx", import.meta.url), "utf8");
assert.match(home, /Слушать у себя/);
assert.match(home, /VenueControlPanel/);
const panel = readFileSync(new URL("../src/components/business-app/VenueControlPanel.tsx", import.meta.url), "utf8");
assert.match(panel, /Разрешить менять музыку с устройства в заведении/);
assert.match(panel, /Поставить музыку в зале на паузу\?/);
assert.match(panel, /Запретить устройству в зале менять музыку\?/);
assert.match(panel, /Разрешить устройству в зале менять музыку\?/);
assert.match(panel, /commandId/);
assert.match(panel, /Изменить звучание/);
assert.match(panel, /VENUE_SOUND_HREF = "\/preferences\?sound=open"/);
const homePage = readFileSync(new URL("../src/components/business-app/BusinessHomePage.tsx", import.meta.url), "utf8");
assert.match(homePage, /href="\/player"/);
assert.match(homePage, /href="\/help"/);
assert.match(homePage, /Откройте плеер кофейни/);
const player = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
assert.match(player, /keepCurrent: true/);
assert.match(player, /createPointSoundApplier/);
assert.doesNotMatch(player, /seenVersion = sound\.version;\s*return/);
assert.match(player, /inFlight/);
assert.doesNotMatch(panel, /владел/);
const pairing = readFileSync(new URL("../src/components/business-app/PointPairingCard.tsx", import.meta.url), "utf8");
assert.match(pairing, /Получить код для устройства/);
assert.match(pairing, /Отключить устройство/);
const shell = readFileSync(new URL("../src/components/business-app/BusinessAppShell.tsx", import.meta.url), "utf8");
assert.match(shell, /BusinessEntrySwitcher/);
assert.doesNotMatch(shell, /href="\/settings"/);

const switcher = readFileSync(new URL("../src/components/business-app/BusinessEntrySwitcher.tsx", import.meta.url), "utf8");
assert.match(switcher, /aria-haspopup="listbox"/);
assert.match(switcher, /aria-expanded=\{open\}/);
assert.match(switcher, /role="listbox"/);
assert.match(switcher, /role="option"/);
assert.match(switcher, /aria-selected=\{option\.selected\}/);
assert.match(switcher, /case "Escape"/);
assert.match(switcher, /addEventListener\("pointerdown"/);
assert.match(switcher, /setEntry\("person"\)/);
assert.match(switcher, /if \(!point\) setEntry\("venue"\)/);
assert.match(switcher, /Войдите со своего телефона/);
assert.doesNotMatch(switcher, /business-sound-chip/);
assert.doesNotMatch(switcher, /\u2014/);
const bizCss = readFileSync(new URL("../src/components/business-app/business-app.css", import.meta.url), "utf8");
assert.match(bizCss, /\.business-entry-switcher__value \{[^}]*text-overflow: ellipsis/);
assert.match(bizCss, /\.business-entry-switcher__option-label \{[^}]*white-space: normal/);
assert.match(bizCss, /\.business-entry-switcher__menu \{[^}]*max-width: min\(20rem, calc\(100vw - 1\.5rem\)\)/);

console.log("business-owner-point-ui-unit: ok");
