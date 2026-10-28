import assert from "node:assert/strict";

import {
  locationSoundFromRow,
  locationSoundRpcArgs,
} from "../src/lib/business-app/location-sound-settings.ts";

const row = locationSoundFromRow({
  location_id: "11111111-1111-4111-8111-111111111111",
  character: "city",
  direction: "rhythm",
  daypart_mode: "evening",
  energy_offset: 15,
  morning_start: "08:00:00",
  morning_end: "12:00:00",
  day_start: "12:00:00",
  day_end: "17:00:00",
  evening_start: "17:00:00",
  evening_end: "21:00:00",
  point_can_edit_settings: false,
  settings_version: 4,
});

assert.ok(row);
assert.equal(row.hours.morning.start, "08:00");
assert.equal(row.pointCanEditSettings, false);
assert.equal(row.settingsVersion, 4);

assert.equal(locationSoundFromRow({ location_id: "x", character: "nope" }), null);
assert.equal(locationSoundFromRow({
  location_id: "11111111-1111-4111-8111-111111111111",
  character: "cozy",
  direction: "jazz",
  daypart_mode: "auto",
  energy_offset: 0,
  morning_start: "11:00",
  morning_end: "07:00",
  day_start: "11:00",
  day_end: "16:00",
  evening_start: "16:00",
  evening_end: "20:00",
  settings_version: 1,
}), null);

const args = locationSoundRpcArgs(row.locationId, row);
assert.equal(args.p_point_can_edit_settings, null);
assert.equal("point_can_edit_settings" in args, false);
assert.equal(args.p_character, "city");

console.log("business-location-sound-settings-unit: ok");
