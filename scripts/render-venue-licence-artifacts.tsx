/**
 * Local previews for task 90d24628. Not a production page.
 * Writes SVG, PDF and PNG of the sticker plus screenshots of the licence card.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";

import VenueLicencePage from "../src/components/business-app/venue-licence/VenueLicencePage";
import { venueLicencePublicUrl } from "../src/lib/business-app/host";
import { sampleVenueLicence, VENUE_LICENCE_SAMPLE_IDS } from "../src/lib/business-app/venue-licence/samples";
import { renderVenueStickerSvg, stickerPageSizeMm, type StickerFormat } from "../src/lib/business-app/venue-licence/sticker";

const outDir = process.env.VENUE_LICENCE_OUT ?? "/opt/cursor/artifacts/venue-licence";
mkdirSync(outDir, { recursive: true });

const logo = readFileSync("public/business/brand/mark-leather.webp").toString("base64");
const logoHref = `data:image/webp;base64,${logo}`;
const sampleUrl = venueLicencePublicUrl(VENUE_LICENCE_SAMPLE_IDS.trial);
const theme = readFileSync("src/components/business-app/theme/business-theme.css", "utf8");
const appCss = readFileSync("src/components/business-app/business-app.css", "utf8");

function stickerHtml(svg: string, format: StickerFormat): string {
  const size = stickerPageSizeMm(format);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${size.width}mm; height: ${size.height}mm; background: #6f4326; }
    svg { display: block; width: ${size.width}mm; height: ${size.height}mm; }
  </style></head><body>${svg}</body></html>`;
}

function pageHtml(id: string, width: number): string {
  const view = sampleVenueLicence(id);
  if (!view) throw new Error(`missing sample ${id}`);
  const body = renderToStaticMarkup(<VenueLicencePage view={view} />).replaceAll(
    'src="/business/brand/mark-leather.webp?v=leather1"',
    `src="${logoHref}"`,
  );
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
    ${theme}
    ${appCss}
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; background: #f7f1e8; }
  </style></head><body><div class="business-app-root" data-biz-theme="jazz-coffee"><div class="business-app-public">${body}</div></div></body></html>`;
}

const statuses = ["trial", "paid", "grace", "expired", "expiredSubscription"] as const;

async function main(): Promise<void> {
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
});

for (const format of ["square80", "a6"] as const) {
  const svg = renderVenueStickerSvg({ publicUrl: sampleUrl, format, logoHref });
  const svgPath = join(outDir, `sticker-${format}.svg`);
  writeFileSync(svgPath, svg);
  const cssPx = Math.round((stickerPageSizeMm(format).width / 25.4) * 96);
  const cssPy = Math.round((stickerPageSizeMm(format).height / 25.4) * 96);
  const page = await browser.newPage({
    viewport: { width: cssPx, height: cssPy },
    deviceScaleFactor: 4,
  });
  await page.setContent(stickerHtml(svg, format), { waitUntil: "load" });
  const size = stickerPageSizeMm(format);
  const pdfPath = join(outDir, `sticker-${format}.pdf`);
  await page.pdf({
    path: pdfPath,
    width: `${size.width}mm`,
    height: `${size.height}mm`,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });
  await page.screenshot({ path: join(outDir, `sticker-${format}.png`) });
  await page.close();
  const pdf = readFileSync(pdfPath);
  const box = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"));
  const widthPt = size.width * 72 / 25.4;
  const heightPt = size.height * 72 / 25.4;
  if (!box) throw new Error(`no MediaBox in ${format}`);
  const gotW = Number(box[1]);
  const gotH = Number(box[2]);
  if (Math.abs(gotW - widthPt) > 1.5 || Math.abs(gotH - heightPt) > 1.5) {
    throw new Error(`${format} MediaBox ${gotW}x${gotH} expected ${widthPt.toFixed(2)}x${heightPt.toFixed(2)}`);
  }
  console.log(format, "pdf", gotW.toFixed(2), gotH.toFixed(2));
}

for (const status of statuses) {
  for (const width of [390, 1280]) {
    const html = pageHtml(VENUE_LICENCE_SAMPLE_IDS[status], width);
    if (width === 1280) writeFileSync(join(outDir, `page-${status}.html`), html);
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(html, { waitUntil: "load" });
    const box = await page.viewportSize();
    await page.screenshot({ path: join(outDir, `page-${status}-${width}.png`), fullPage: true });
    console.log("viewport", status, width, box);
    await page.close();
    console.log("page", status, width);
  }
}

await browser.close();
console.log("wrote", outDir);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
