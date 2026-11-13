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

assert.match(signUp, /coffee \? "АудиоЛад Кофейня" : "АудиоЛад"/, "sign-up brand");
assert.match(signUp, /coffee\s*\?\s*COFFEE_SIGN_UP_INTRO/, "sign-up coffee intro");
assert.match(signUp, /coffee \? "\/documents\/business-offer" : "\/offer"/, "sign-up business offer link");
assert.doesNotMatch(signUp, /https:\/\/audiolad\.ru\/offer/, "sign-up no listener offer on coffee");
assert.match(signUp, /href="\/privacy"/, "sign-up privacy is same-host");
assert.doesNotMatch(signUp, /https:\/\/audiolad\.ru\/privacy/, "sign-up no apex privacy URL");
assert.match(signUp, /Хочу получать новости АудиоЛад Кофейня/, "sign-up coffee marketing");
assert.ok(signUp.includes('? "Хочу получать новости АудиоЛад Кофейня'), "sign-up coffee marketing label");
assert.ok(signUp.includes(': "Хочу получать новости АудиоЛада, рекомендации практик'), "sign-up listener marketing kept");
assert.doesNotMatch(signUp, /\u2014/, "sign-up no em dash");
assert.doesNotMatch(signUp, /Фамилия\s-\sнеобязательно/, "sign-up no hyphen-minus in optional surname");
assert.match(signUp, /Фамилия – необязательно/, "sign-up en dash in optional surname");

assert.match(signIn, /coffee \? "АудиоЛад Кофейня" : "АудиоЛад"/, "sign-in brand");
assert.match(signIn, /coffee \? COFFEE_SIGN_IN_INTRO/, "sign-in coffee intro");
assert.doesNotMatch(signIn, /\u2014/, "sign-in no em dash");

assert.match(intro, /export const BUSINESS_SIGN_IN_INTRO/, "intro export");
assert.match(intro, /export const COFFEE_SIGN_IN_INTRO/, "coffee sign-in intro");
assert.match(intro, /export const COFFEE_SIGN_UP_INTRO/, "coffee sign-up intro");
assert.match(intro, /кабинет АудиоЛад Кофейня/, "coffee intros use coffee brand");
assert.match(intro, /кабинет АудиоЛад Бизнес/, "business intros unchanged");
assert.doesNotMatch(intro, /BUSINESS_SIGN_UP_INTRO[\s\S]{0,200}практик/, "sign-up intro without practices");
assert.doesNotMatch(intro, /BUSINESS_SIGN_IN_INTRO[\s\S]{0,200}практик/, "sign-in intro without practices");
assert.doesNotMatch(intro, /\u2014/, "intro no em dash");

assert.ok(!proxy.includes("COFFEE_ALLOWED_LEGAL_PATHS"), "privacy no longer passes through to purple platform legal page");
const host = readFileSync(join(root, "src/lib/business-app/host.ts"), "utf8");
assert.ok(host.includes('"/privacy": `${BUSINESS_SITE_PATH}/documents/privacy`'), "privacy is a public Business document rewrite");

console.log("business-auth-coffee-copy-unit: ok");
