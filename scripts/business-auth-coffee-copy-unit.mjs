#!/usr/bin/env node
/** Coffee-host auth copy for AudioLad Business (P1-5). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const signUp = readFileSync(join(root, "src/app/(platform)/auth/sign-up/page.tsx"), "utf8");
const signIn = readFileSync(join(root, "src/app/(platform)/auth/sign-in/page.tsx"), "utf8");
const intro = readFileSync(join(root, "src/lib/access-grants/copy.ts"), "utf8");
const proxy = readFileSync(join(root, "src/lib/business-app/proxy-policy.ts"), "utf8");

assert.match(signUp, /coffee \? "АудиоЛад Бизнес" : "АудиоЛад"/, "sign-up brand");
assert.match(signUp, /coffee \|\| isBusinessTrialNext\(nextParam\)/, "sign-up business intro on coffee");
assert.match(signUp, /coffee \? "\/documents\/business-offer" : "\/offer"/, "sign-up business offer link");
assert.doesNotMatch(signUp, /https:\/\/audiolad\.ru\/offer/, "sign-up no listener offer on coffee");
assert.match(signUp, /href="\/privacy"/, "sign-up privacy is same-host");
assert.doesNotMatch(signUp, /https:\/\/audiolad\.ru\/privacy/, "sign-up no apex privacy URL");
assert.match(signUp, /Хочу получать новости АудиоЛад Бизнес/, "sign-up business marketing");
assert.ok(signUp.includes('? "Хочу получать новости АудиоЛад Бизнес'), "sign-up coffee marketing label");
assert.ok(signUp.includes(': "Хочу получать новости АудиоЛада, рекомендации практик'), "sign-up listener marketing kept");
assert.doesNotMatch(signUp, /\u2014/, "sign-up no em dash");
assert.doesNotMatch(signUp, /Фамилия\s-\sнеобязательно/, "sign-up no hyphen-minus in optional surname");
assert.match(signUp, /Фамилия – необязательно/, "sign-up en dash in optional surname");

assert.match(signIn, /coffee \? "АудиоЛад Бизнес" : "АудиоЛад"/, "sign-in brand");
assert.match(signIn, /coffee \? BUSINESS_SIGN_IN_INTRO/, "sign-in business intro on coffee");
assert.doesNotMatch(signIn, /\u2014/, "sign-in no em dash");

assert.match(intro, /export const BUSINESS_SIGN_IN_INTRO/, "intro export");
assert.doesNotMatch(intro, /BUSINESS_SIGN_UP_INTRO[\s\S]{0,200}практик/, "sign-up intro without practices");
assert.doesNotMatch(intro, /BUSINESS_SIGN_IN_INTRO[\s\S]{0,200}практик/, "sign-in intro without practices");
assert.doesNotMatch(intro, /\u2014/, "intro no em dash");

assert.ok(proxy.includes('COFFEE_ALLOWED_LEGAL_PATHS'), "legal paths export");
assert.ok(proxy.includes('"/privacy"'), "coffee allows /privacy");
assert.ok(
  proxy.includes("COFFEE_ALLOWED_LEGAL_PATHS as readonly string[]).includes(pathname)"),
  "privacy checked in coffee pass_through",
);

console.log("business-auth-coffee-copy-unit: ok");
