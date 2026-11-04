/**
 * «Сохранить часы» feedback (04.11.2026): after a successful save the button turns pine (main CTA)
 * with «✓ Часы сохранены» for 3 s, then goes back. Errors keep the existing alert, a cancelled
 * confirm shows nothing.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import CafeDaypartHoursForm, {
  DAYPART_HOURS_SAVED_LABEL,
  DAYPART_HOURS_SAVED_MS,
  DAYPART_HOURS_SAVE_LABEL,
} from "../src/components/business-app/workspace/CafeDaypartHoursForm";
import { CAFE_DAYPART_HOURS_DEFAULT } from "../src/lib/business-app/cafe-queue/prefs";

assert.equal(DAYPART_HOURS_SAVE_LABEL, "Сохранить часы");
assert.equal(DAYPART_HOURS_SAVED_LABEL, "✓ Часы сохранены");
assert.equal(DAYPART_HOURS_SAVED_MS, 3000);

const html = renderToStaticMarkup(<CafeDaypartHoursForm hours={CAFE_DAYPART_HOURS_DEFAULT} onSave={() => null} />);
assert.match(html, /data-testid="biz-daypart-save"/);
assert.match(html, /business-app-btn-primary/);
assert.doesNotMatch(html, /business-app-btn-cta/);
assert.match(html, /data-state="idle"/);
assert.match(html, />Сохранить часы</);
assert.doesNotMatch(html, /Часы сохранены|Границы сохранены/);
assert.ok(!html.includes("\u2014"), "en dash only");

const form = readFileSync("src/components/business-app/workspace/CafeDaypartHoursForm.tsx", "utf8");
// Saved: pine CTA class, then back after the timer; editing clears it at once.
assert.match(form, /saved \? "business-app-btn-cta" : "business-app-btn-primary"/);
assert.match(form, /setSaved\(true\);\s*savedTimer\.current = window\.setTimeout\(\(\) => \{\s*savedTimer\.current = null;\s*setSaved\(false\);\s*\}, DAYPART_HOURS_SAVED_MS\);/);
// Cancelled confirm (false) shows nothing; an error string shows the alert and no green.
assert.match(form, /if \(result === false\) return;\s*setError\(result\);\s*if \(result !== null\) return;/);
// Only the latest press reports; unmount clears the timer.
assert.match(form, /if \(!mounted\.current \|\| seq !== submitSeq\.current\) return;/);
assert.match(form, /return \(\) => \{\s*mounted\.current = false;\s*if \(savedTimer\.current !== null\) window\.clearTimeout\(savedTimer\.current\);/);

const settings = readFileSync("src/components/business-app/BusinessPlayerSettings.tsx", "utf8");
// «Отмена» in the venue confirm is not a save.
assert.match(settings, /cancel: \(\) => resolve\(false\),/);
assert.doesNotMatch(settings, /cancel: \(\) => resolve\(null\)/);

console.log("business-daypart-hours-saved-unit: ok");
