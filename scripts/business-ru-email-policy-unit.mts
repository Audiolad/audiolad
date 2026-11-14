// t1446u: new emails in the cafe / Business cabinet – Russian mail services only, like audiolad.ru sign-up.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient, User } from "@supabase/supabase-js";
process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS = "audiolad.ru";
const email = await import("../src/lib/auth/email");
const { linkBusinessLoginEmail } = await import("../src/lib/business-app/login-access");
const policy = JSON.parse(readFileSync("config/email-domain-policy.json", "utf8")) as { personalAllowlist: string[] };

const { isNewEmailDomainAllowed, NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE: MSG, NEW_EMAIL_FIELD_HINT: HINT } = email;
for (const d of policy.personalAllowlist) {
  assert.ok(isNewEmailDomainAllowed(`owner@${d}`), d);
  assert.ok(isNewEmailDomainAllowed(`Owner@${d.toUpperCase()}`, "client"), d);
}
for (const e of ["7234013@gmail.com", "a@googlemail.com", "a@outlook.com", "a@hotmail.com", "a@icloud.com", "a@yahoo.com", "a@proton.me", "a@mail.grokbot.com", "a@yandex.ru.evil.com", "a@sub.yandex.ru", "nodomain", "a@"]) {
  assert.equal(isNewEmailDomainAllowed(e), false, e);
  assert.equal(isNewEmailDomainAllowed(e, "client"), false, e);
}
// Corporate domains: server only, exactly like validateEmailForRegistrationServer.
assert.equal(isNewEmailDomainAllowed("team@audiolad.ru"), true);
assert.equal(isNewEmailDomainAllowed("team@audiolad.ru", "client"), false);
assert.equal(isNewEmailDomainAllowed("team@audiolad.ru"), email.validateEmailForRegistrationServer("team@audiolad.ru").ok);

// Copy: Gmail named, Yandex recommended, en dash only.
assert.match(MSG, /Gmail/); assert.match(MSG, /Яндекс Почту/); assert.match(HINT, /Яндекс Почту/);
for (const t of [MSG, HINT]) { assert.doesNotMatch(t, /—| - /); assert.match(t, /–/); }

// Linking a guest login: gmail refused before any auth call.
const guest = { id: "g", is_anonymous: true, user_metadata: {} } as User;
let calls = 0;
const client = { auth: { updateUser: async () => { calls++; return { data: { user: null }, error: null }; }, refreshSession: async () => ({ error: null }) } } as unknown as Pick<SupabaseClient, "auth">;
const refused = await linkBusinessLoginEmail(client, guest, "Owner@Gmail.com");
assert.deepEqual(refused, { ok: false, code: "receipt_email_domain_not_allowed", error: MSG });
assert.equal(calls, 0);

// Server enforcement in every new-email entry point; never on sign-in / code login / reset.
const read = (p: string) => readFileSync(p, "utf8");
const profile = read("src/app/business-app/profile/actions.ts");
assert.match(profile, /if \(!isNewEmailDomainAllowed\(receiptEmail\)\) \{\s*return \{ ok: false, code: "receipt_email_domain_not_allowed"/);
assert.ok(profile.indexOf("isNewEmailDomainAllowed(receiptEmail)") < profile.indexOf("linkBusinessLoginEmail(supabase, user, receiptEmail)"));
const checkout = read("src/app/api/business/subscription/checkout/route.ts");
assert.match(checkout, /const newEmail = !user\.email\?\.trim\(\) &&\s*\(user\.is_anonymous \|\| \(customerEmail === typedReceiptEmail && customerEmail !== savedReceiptEmail\)\);/);
assert.match(checkout, /if \(newEmail && !isNewEmailDomainAllowed\(customerEmail\)\) \{\s*return NextResponse\.json\(\{ error: "receipt_email_domain_not_allowed" \}, \{ status: 400 \}\);/);
assert.ok(checkout.indexOf("receipt_email_domain_not_allowed") < checkout.indexOf("startTochkaCheckoutForPendingOrder("), "checked before the payment provider");
for (const p of ["src/app/(platform)/auth/sign-in/otp-actions.ts", "src/app/(platform)/auth/forgot-password/actions.ts", "src/components/auth/BusinessEmailCodeSignIn.tsx", "src/components/business-app/BusinessOwnerUnlockForm.tsx"]) {
  assert.doesNotMatch(read(p), /isNewEmailDomainAllowed/, `${p}: existing accounts must keep signing in`);
}
// UI: both cabinet fields show the hint and check before sending.
const form = read("src/components/business-app/profile/BusinessReceiptEmailForm.tsx");
assert.match(form, /if \(!isNewEmailDomainAllowed\(email, "client"\)\) \{ setError\(NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE\); return; \}/);
assert.match(form, /\{NEW_EMAIL_FIELD_HINT\}/);
const card = read("src/components/business-app/BusinessHomeAccessCard.tsx");
assert.match(card, /isNewEmailDomainAllowed\(typedEmail, "client"\)/);
assert.match(card, /data-testid="biz-home-receipt-email-ru-hint">\{NEW_EMAIL_FIELD_HINT\}/);
assert.match(card, /error\.code === "receipt_email_domain_not_allowed"\) \{\s*return <p role="alert" data-testid="biz-home-pay-error">\{NEW_EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE\}/);
console.log("business-ru-email-policy-unit: ok");
