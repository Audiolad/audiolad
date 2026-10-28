#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/20270207130000_business_point_sound_read.sql"),
  "utf8",
);
const applied = migration.split("COMMIT;")[0];
if (!applied.includes("get_business_point_sound_settings")) throw new Error("function");
if (!applied.includes("timezone")) throw new Error("venue timezone");
if (!applied.includes("GRANT EXECUTE ON FUNCTION public.get_business_point_sound_settings(text) TO anon")) throw new Error("anon");
if (applied.includes("DROP TABLE")) throw new Error("drop");
if (/https?:\/\//.test(migration)) throw new Error("link");
console.log("business-point-sound-sql-unit: ok");
