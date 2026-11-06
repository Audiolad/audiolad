#!/usr/bin/env node
/** Coffee-host auth copy for AudioLad Business (P1-5). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const signUp = readFileSync(join(root, "src/app/(platform)/auth/sign-up/page.tsx"), "utf8");
const signIn = readFileSync(join(root, "src/app/(platform)/auth/sign-in/page.tsx"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(signUp.includes('coffee ? "АудиоЛад Бизнес" : "АудиоЛад"'), "sign-up brand");
assert(signUp.includes("coffee || isBusinessTrialNext(nextParam)"), "sign-up business intro on coffee");
assert(signUp.includes('coffee ? "/documents/business-offer" : "/offer"'), "sign-up business offer link");
assert(!signUp.includes("https://audiolad.ru/offer"), "sign-up no listener offer on coffee");
assert(signUp.includes("Хочу получать новости АудиоЛад Бизнес"), "sign-up business marketing");
assert(!/рекомендации практик/.test(signUp.split("coffee")[1]?.split("От подписки")[0] ?? "") ||
  signUp.includes('? "Хочу получать новости АудиоЛад Бизнес'), "marketing branch for coffee");
assert(!signUp.includes("\u2014"), "sign-up no em dash");
assert(signIn.includes('coffee ? "АудиоЛад Бизнес" : "АудиоЛад"'), "sign-in brand");
assert(signIn.includes("coffee ? BUSINESS_SIGN_IN_INTRO"), "sign-in business intro on coffee");
assert(!signIn.includes("\u2014"), "sign-in no em dash");

console.log("business-auth-coffee-copy-unit: ok");
