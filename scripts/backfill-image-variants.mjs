#!/usr/bin/env node
/**
 * Safe idempotent backfill for **practice product cover** variant manifests only.
 *
 * Supported --type: product-cover (default).
 * Follow-up work is required before track/avatar/banner/playlist backfill.
 *
 * Dry-run by default — pass --write plus IMAGE_BACKFILL_ALLOW_WRITE=1 to persist.
 *
 * Examples:
 *   node scripts/backfill-image-variants.mjs --dry-run --type product-cover
 *   IMAGE_BACKFILL_ALLOW_WRITE=1 node scripts/backfill-image-variants.mjs --write --type product-cover --batch-size 5
 *   node scripts/backfill-image-variants.mjs --dry-run --practice-id <uuid>
 */
import { createClient } from "@supabase/supabase-js";

import { processImageForProfile } from "../src/lib/images/process-image.ts";
import { uploadProcessedImageSet } from "../src/lib/images/upload-image-set.ts";
import { parseImageManifest } from "../src/lib/images/image-manifest.ts";
import { getCoverPublicUrl } from "../src/lib/author-products/utils.ts";
import { bootstrapDataWriteScript } from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/backfill-image-variants.mjs";
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

function parseArgs(argv) {
  const args = {
    dryRun: true,
    write: false,
    type: null,
    practiceId: null,
    batchSize: 5,
    pauseMs: 500,
    checkpointPath: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--dry-run") {
      args.dryRun = true;
      args.write = false;
    } else if (token === "--write") {
      args.write = true;
      args.dryRun = false;
    } else if (token === "--type") {
      args.type = argv[++i] ?? null;
    } else if (token === "--practice-id") {
      args.practiceId = argv[++i] ?? null;
    } else if (token === "--batch-size") {
      args.batchSize = Number(argv[++i] ?? 5);
    } else if (token === "--pause-ms") {
      args.pauseMs = Number(argv[++i] ?? 500);
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

async function fetchLegacyCoverBuffer(supabase, coverUrl) {
  const url = coverUrl?.trim();

  if (!url) {
    return null;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`fetch_failed:${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function backfillPracticeCovers(supabase, args) {
  let query = supabase
    .from("practices")
    .select("id, title, cover_url, cover_image, updated_at")
    .not("cover_url", "is", null);

  if (args.practiceId) {
    query = query.eq("id", args.practiceId);
  }

  const { data, error } = await query.limit(args.batchSize);

  if (error) {
    throw error;
  }

  const report = {
    scanned: 0,
    skipped: 0,
    processed: 0,
    failed: 0,
    errors: [],
  };

  for (const row of data ?? []) {
    report.scanned += 1;

    if (parseImageManifest(row.cover_image)?.variants?.sm) {
      report.skipped += 1;
      console.log(`skip ${row.id} — manifest already present`);
      continue;
    }

    try {
      const buffer = await fetchLegacyCoverBuffer(supabase, row.cover_url);

      if (!buffer?.length) {
        report.skipped += 1;
        continue;
      }

      const processed = await processImageForProfile(buffer, null, "product-cover");

      if (!processed.ok) {
        report.failed += 1;
        report.errors.push({ id: row.id, code: processed.code });
        continue;
      }

      if (args.dryRun) {
        report.processed += 1;
        console.log(
          `dry-run ${row.id} "${row.title}" → ${processed.data.variants.length} variants`,
        );
        continue;
      }

      const uploaded = await uploadProcessedImageSet(processed.data, {
        profile: "product-cover",
        bucket: "practice-covers",
        storage: supabase.storage,
        context: { practiceId: row.id },
      });

      if (!uploaded.ok) {
        report.failed += 1;
        report.errors.push({ id: row.id, code: uploaded.code });
        continue;
      }

      const { error: updateError } = await supabase
        .from("practices")
        .update({
          cover_image: uploaded.data.manifest,
          cover_url: getCoverPublicUrl(uploaded.data.primaryDisplayPath),
        })
        .eq("id", row.id);

      if (updateError) {
        report.failed += 1;
        report.errors.push({ id: row.id, code: updateError.message });
        continue;
      }

      report.processed += 1;
      console.log(`write ${row.id} "${row.title}"`);
    } catch (caught) {
      report.failed += 1;
      report.errors.push({
        id: row.id,
        code: caught instanceof Error ? caught.message : String(caught),
      });
    }

    if (args.pauseMs > 0) {
      await sleep(args.pauseMs);
    }
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.type && args.type !== "product-cover") {
    console.error(
      `Unsupported --type ${args.type}. This script currently supports only product-cover.`,
    );
    process.exit(1);
  }

  if (!Number.isFinite(args.batchSize) || args.batchSize <= 0) {
    console.error("--batch-size must be a positive number");
    process.exit(1);
  }

  if (args.write && process.env.IMAGE_BACKFILL_ALLOW_WRITE !== "1") {
    console.error(
      "Refusing --write without IMAGE_BACKFILL_ALLOW_WRITE=1 environment guard",
    );
    process.exit(1);
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? "dry-run" : "write",
        type: args.type ?? "product-cover",
        batchSize: args.batchSize,
      },
      null,
      2,
    ),
  );

  const report = await backfillPracticeCovers(supabase, args);
  console.log(JSON.stringify({ report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
