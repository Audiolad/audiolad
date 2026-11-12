#!/usr/bin/env node
/**
 * Build public/brand/author-default-avatar.png from the official violet lotus mark.
 * The 512px avatar is the same image as public/icon-512.png (render_icons.py /
 * render_logos.py from docs/brand/violet-lotus-source.webp).
 */
import { copyFileSync, statSync } from "node:fs";
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/generate-author-default-avatar.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const OUT = "public/brand/author-default-avatar.png";
const LOGO_SOURCE = "public/icon-512.png";

copyFileSync(LOGO_SOURCE, OUT);
const st = statSync(OUT);
console.log(
  JSON.stringify(
    {
      path: OUT,
      bytes: st.size,
      source: LOGO_SOURCE,
    },
    null,
    2,
  ),
);
