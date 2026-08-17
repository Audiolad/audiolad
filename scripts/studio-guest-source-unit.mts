import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const landing = await read("src/app/(platform)/studio/meditation/page.tsx");
assert.match(landing, /href="\/studio\/try"/);
assert.match(landing, /Попробовать бесплатно/);
assert.doesNotMatch(landing, /скоро появится/);
assert.doesNotMatch(landing, /скоро откроется/);
assert.doesNotMatch(landing, /готовим бесплатный/);
assert.doesNotMatch(landing, /Бесплатный режим скоро/);

const tryPage = await read("src/app/(studio)/studio/try/page.tsx");
assert.match(tryPage, /force-dynamic/);
assert.match(tryPage, /ensureGuestSession/);
assert.match(tryPage, /redirect\("\/studio\/projects"\)/);
assert.match(tryPage, /redirect\("\/studio\/project\/new\?from=try"\)/);
assert.doesNotMatch(tryPage, /\/studio\/live/);

const projectsPage = await read("src/app/(studio)/studio/projects/page.tsx");
assert.match(projectsPage, /requireStudioEditorAccess\("\/studio\/projects"\)/);
assert.match(projectsPage, /accessMode/);
assert.match(projectsPage, /showStudioLauncher/);

const help = await read("src/app/(studio)/studio/help/page.tsx");
assert.match(help, /requireStudioEditorAccess\("\/studio\/help"\)/);
assert.match(help, /index: false/);
assert.match(help, /follow: false/);

const studioPage = await read("src/app/(studio)/studio/page.tsx");
assert.match(studioPage, /requireStudioAuthorAccess\("\/studio"\)/);
const livePage = await read("src/app/(studio)/studio/live/page.tsx");
assert.match(livePage, /requireStudioAuthorAccess\("\/studio\/live"\)/);

const editor = await read("src/components/studio/StudioEditorShell.tsx");
assert.match(editor, /accessMode === "author"/);
assert.match(editor, /В кабинет автора/);
assert.match(editor, /StudioGuestAuthLinks/);
assert.match(editor, /title={label}/);
assert.match(editor, /aria-label={label}/);
assert.match(editor, /role="tooltip"/);
assert.match(editor, /const label = isFadeIn \? "Появление" : "Затухание"/);
assert.doesNotMatch(editor, />Плавное появление</);
assert.match(editor, /grid grid-cols-2 gap-1/);
assert.match(editor, /text-\[11px\] font-medium text-\[#8b95a8\]/);
assert.match(editor, /Удалить дорожку/);

const nav = await read("src/components/studio/StudioChromeNav.tsx");
assert.match(nav, /accessMode === "guest"/);
assert.match(nav, /accessMode === "guest"/);
const gate = await read("src/components/studio/StudioGuestGate.tsx");
assert.match(gate, /Войти/);
assert.match(gate, /Зарегистрироваться/);
assert.match(gate, /\/auth\/sign-in/);
assert.match(gate, /\/auth\/sign-up/);

const routes = await read("src/lib/auth/routes.ts");
assert.doesNotMatch(routes, /"\/studio"/);

const constants = await read("src/lib/analytics/constants.ts");
for (const event of [
  "guest_studio_open",
  "guest_project_created",
  "guest_render_started",
  "guest_render_completed",
  "guest_mp3_downloaded",
  "guest_registration_gate_shown",
  "guest_auth_cta_clicked",
]) {
  assert.match(constants, new RegExp(`"${event}"`));
}

const migration = await read("supabase/migrations/20260817190000_studio_guest_mode.sql");
assert.match(migration, /studio_guest_sessions/);
assert.match(migration, /char_length\(token_hash\) = 64/);
assert.match(migration, /studio_projects_owner_xor_check/);
assert.match(migration, /studio_render_jobs_guest_active_unique/);
assert.match(migration, /studio\/guest\//);
assert.match(migration, /guest_studio_open/);
assert.doesNotMatch(migration, /CREATE POLICY[^\n]*\n\s+ON public\.studio_guest_sessions/);

const cookie = await read("src/lib/studio/guest-policy.ts");
assert.match(cookie, /timingSafeEqual/);
assert.match(cookie, /createGuestToken/);
assert.match(cookie, /hashGuestToken/);

console.log("studio-guest-source-unit: ok");
