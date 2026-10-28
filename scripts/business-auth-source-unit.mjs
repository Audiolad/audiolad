import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = (route) => read(`src/app/(platform)/auth/${route}/page.tsx`);
const signup = page("sign-up");
const signin = page("sign-in");

assert.match(signup, /signUpAction\(\{\s*firstName,\s*lastName,\s*email,\s*password,\s*legalConsent,\s*marketingConsent,\s*next: nextParam,\s*\}\)/);
assert.match(signin, /supabase\.auth\.signInWithPassword\(\{ email, password \}\)/);
assert.match(signin, /getSafeNextPath\(searchParams\.get\("next"\)\)/);
assert.match(signin, /claimPartnerAttributionAction\(\)/);
assert.match(signin, /claimGuestRatingsAction\(\)/);
assert.match(signup, /recordPlatformSignupCompleted\(\)/);
assert.match(signup, /event_name: "signup_started"/);
assert.match(signup, /disabled=\{isLoading \|\| !formState\.isSubmitReady\}/);
assert.doesNotMatch(signup, /supabase\.auth\.signUp/);

// One shared, byte-identical consent block from main 71bd49bc. This pins texts,
// checkbox state/handlers, required-ness and legal destinations for both variants.
const consent = signup.match(/<fieldset\b[\s\S]*?<\/fieldset>/)?.[0];
assert.ok(consent);
assert.equal(createHash("sha256").update(consent).digest("hex"), "a2d5bde999651ebef07ad82e9f95768060da66a1830767109da5e5d9cee8eaee");
assert.equal((consent.match(/type="checkbox"/g) ?? []).length, 2);
assert.match(consent, /checked=\{legalConsent\}/);
assert.match(consent, /checked=\{marketingConsent\}/);
assert.match(consent, /href="\/offer"/);
assert.match(consent, /href="\/privacy"/);
assert.doesNotMatch(consent, /variant/);

for (const route of ["sign-up", "sign-in", "forgot-password", "reset-password"]) {
  const source = page(route);
  assert.match(source, /const variant = useAuthVariant\(\)/);
  assert.match(source, /<AuthFrame variant=\{variant\}>/);
  assert.match(source, /<AuthBrand variant=\{variant\} \/>/);
  assert.match(source, /variant === "ordinary" \? <BottomNav \/> : null/);
  const links = source.match(/buildAuthRouteHref\([\s\S]*?\)\}/g) ?? [];
  assert.ok(links.length > 0);
  for (const link of links) assert.match(link, /authVariantLinkParams\(variant\)/);
  assert.doesNotMatch(source, /—/);
}

assert.match(signup, /registered: "1"/);
assert.match(signup, /fieldErrors\.email === SIGNUP_EXISTING_ACCOUNT_MESSAGE/);
assert.match(signup, /helpArticlePath\(emailNotReceivedArticle\)/);
assert.match(page("forgot-password"), /helpArticlePath\(emailNotReceivedArticle\)/);
assert.match(page("forgot-password"), /requestPasswordRecoveryAction\(\{\s*email,\s*next: nextParam,\s*\}\)/);
assert.match(page("reset-password"), /resetPasswordAction\(\{\s*password,\s*confirmPassword,\s*next: searchParams\.get\("next"\),\s*\}\)/);

const presentation = read("src/components/auth/AuthPresentation.tsx");
assert.match(presentation, /BUSINESS_BRAND_MARK_PATH/);
// Match BusinessBrandLockup: the versioned local asset bypasses image optimisation
// so its query string does not require a global images.localPatterns exception.
const brandImage = presentation.match(/<Image\b[^>]*\bsrc=\{BUSINESS_BRAND_MARK_PATH\}[^>]*\/>/)?.[0];
assert.ok(brandImage, "AuthBrand renders the shared versioned Business mark");
assert.match(brandImage, /\sunoptimized(?=\s|\/)/, "The versioned Business mark must bypass image optimisation");
assert.match(presentation, /BUSINESS_BRAND_NAME/);
assert.match(presentation, /"min-h-screen bg-platform-surface text-\[#25135c\]"/);
assert.match(presentation, /params\.get\("next"\), from: params\.get\("from"\), hostname/);
const layout = read("src/app/(platform)/auth/layout.tsx");
assert.match(layout, /getHostnameFromHeaders\(await headers\(\)\)/);
assert.match(layout, /business-app\/theme\/business-theme\.css/);
const resetLayout = read("src/app/(platform)/auth/reset-password/layout.tsx");
assert.match(resetLayout, /if \(user && hasValidRecoveryIntent\(cookieStore, user.id\)\)/);
assert.match(resetLayout, /<PasswordResetExpired \/>/);
const expired = read("src/components/auth/PasswordResetExpired.tsx");
assert.match(expired, /<AuthFrame variant=\{variant\}>/);
assert.match(expired, /buildAuthRouteHref\("\/auth\/forgot-password", searchParams\.get\("next"\), authVariantLinkParams\(variant\)\)/);
const css = read("src/components/auth/business-auth.module.css");
assert.match(css, /var\(--biz-cream\)/);
assert.match(css, /var\(--biz-coffee\)/);
assert.match(css, /min-height: 44px/);
assert.match(css, /width: 44px/);
assert.doesNotMatch(css, /#[0-9a-f]{3,8}[;)]/i, "Business colours come from shared tokens");
const pkg = JSON.parse(read("package.json"));
assert.ok(pkg.scripts.test.endsWith(" && npm run test:business-auth-variant"));
assert.match(pkg.scripts["test:business-auth-variant"], /business-auth-variant-unit\.mts/);
console.log("business-auth-source-unit: ok");
