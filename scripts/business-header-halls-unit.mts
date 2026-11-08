import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessHeaderHallOptions, openBusinessHeaderHall } from "../src/lib/business-app/header-halls";

const halls = [
  { id: "iphone", name: " Айфон ", status: "active" },
  { id: "samsung", name: "Samsung", status: "active" },
];
const options = businessHeaderHallOptions(halls, "iphone", true);
assert.deepEqual(["Сергей", ...options.map((option) => option.label)], ["Сергей", "Айфон", "Samsung"]);
assert.deepEqual(options.map((option) => option.locationId), ["iphone", "samsung"]);
assert.equal(new Set(["person", ...options.map((option) => option.id)]).size, 3);
assert.deepEqual(options.map((option) => option.selected), [true, false]);
assert.deepEqual(businessHeaderHallOptions(halls, "samsung", true).map((option) => option.selected), [false, true]);
assert.ok(businessHeaderHallOptions(halls, "iphone", false).every((option) => !option.selected));
assert.equal(businessHeaderHallOptions([halls[0]], "iphone", true).length, 1);
assert.equal(businessHeaderHallOptions([], "iphone", true).length, 0, "no invented halls or empty add slots");
const duplicate = businessHeaderHallOptions(halls.map((hall) => ({ ...hall, name: "Кофейня" })), "iphone", true);
assert.deepEqual(duplicate.map((option) => option.label), ["Точка 1: Кофейня", "Точка 2: Кофейня"]);
assert.equal(businessHeaderHallOptions([{ ...halls[0], name: " " }], "iphone", true)[0].label, "Кофейня");
assert.equal(businessHeaderHallOptions([{ ...halls[0], status: "inactive" }], "iphone", true)[0].disabled, true);

const calls: string[] = [];
const select = async (id: string) => { calls.push(`select:${id}`); return { ok: true }; };
const switchTo = (entry: string) => { calls.push(`switch:${entry}`); };
assert.equal(await openBusinessHeaderHall(halls[1], "iphone", select, () => switchTo("venue")), true);
assert.deepEqual(calls, ["select:samsung", "switch:venue"], "cookie selection precedes preview navigation");
calls.length = 0;
let finishSelect!: (result: { ok: boolean }) => void;
const delayedSelection = new Promise<{ ok: boolean }>((resolve) => { finishSelect = resolve; });
const opening = openBusinessHeaderHall(halls[1], "iphone", async (id) => {
  calls.push(`select:${id}`);
  return delayedSelection;
}, () => switchTo("venue"));
assert.deepEqual(calls, ["select:samsung"], "preview must wait for server action completion");
finishSelect({ ok: true });
assert.equal(await opening, true);
assert.deepEqual(calls, ["select:samsung", "switch:venue"]);
calls.length = 0;
assert.equal(await openBusinessHeaderHall(halls[0], "iphone", async () => { throw new Error("must not select current hall"); }, () => switchTo("venue")), true);
assert.deepEqual(calls, ["switch:venue"]);
for (const failedSelect of [async () => ({ ok: false }), async () => { throw new Error("network failure"); }]) {
  calls.length = 0;
  assert.equal(await openBusinessHeaderHall(halls[1], "iphone", failedSelect, () => switchTo("venue")), false);
  assert.deepEqual(calls, [], "no preview navigation on failure");
}
calls.length = 0;
assert.equal(await openBusinessHeaderHall({ ...halls[0], status: "inactive" }, "iphone", select, () => switchTo("venue")), false);
assert.deepEqual(calls, [], "inactive halls cannot select or open, including the current one");
// The real component must use the tested helpers and preserve the hall-device early return.
const source = readFileSync("src/components/business-app/BusinessEntrySwitcher.tsx", "utf8");
assert.match(source, /const options: EntryOption\[\] = \[\s*\{\s*id: "person"/);
assert.match(source, /label: person \|\| BUSINESS_OWNER_NAME_PLACEHOLDER/);
assert.match(source, /\.\.\.businessHeaderHallOptions\(halls, domain\.location\.id, venueOn\)\.map/);
const pointHeader = source.slice(source.indexOf('if (cabinet.mode === "point")'), source.indexOf('if (domain.status !== "authenticated"'));
assert.match(pointHeader, /cabinet\.pointVenueName \|\| "Кофейня"/);
assert.match(pointHeader, /BUSINESS_OWNER_UNLOCK_PATH/);
assert.match(pointHeader, /Кабинет владельца/);
assert.doesNotMatch(pointHeader, /role="listbox"|businessHeaderHallOptions|selectBusinessPoint/);
console.log("business-header-halls-unit: all halls, labels, selection order, failures, single hall, point header: PASS");
