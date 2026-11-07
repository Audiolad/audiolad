/** Isolated browser regression: no real pairing API or external sharing calls. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const { outputFiles } = await build({
  stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import Card from "./src/components/business-app/PointPairingCard"; createRoot(document.getElementById("root")).render(<Card locationId="test-hall"/>);', resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
});
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  for (const action of ["show-qr", "copy", "share", "failure", "clipboard-fallback", "share-denied"]) {
    console.log(`pairing browser: ${action}`);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => console.error(error));
    await page.route("https://coffee.audiolad.ru/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.addInitScript(({ action }) => {
      window.calls = [];
      window.shares = [];
      window.copies = [];
      window.targets = [];
      window.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        window.calls.push(payload.action);
        return { json: async () => payload.action === "link" ? { ok: true, linked: false } : action === "failure" ? { ok: false, error: "Не удалось создать код" } : { ok: true, code: "4719", expiresIn: 1200 } };
      };
      Object.defineProperty(navigator, "share", { value: async data => { if (action === "share-denied") throw new DOMException("denied", "NotAllowedError"); window.shares.push(data); } });
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => {
        if (action === "clipboard-fallback") throw new Error("denied");
        window.copies.push(text);
      } } });
      window.open = () => ({ opener: null, location: { replace: url => window.targets.push(url) }, close() {} });
    }, { action });
    await page.goto("https://coffee.audiolad.ru/preferences");
    await page.addScriptTag({ content: outputFiles[0].text });
    for (const id of ["share", "share-hint", "copy", "show-qr"]) await page.getByTestId(`biz-point-${id}`).waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("biz-point-telegram").count(), 0);
    assert.equal(await page.getByTestId("biz-point-mail").count(), 0);
    assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
    assert.equal(await page.getByTestId("biz-point-show-qr").innerText(), "Поделиться через QR-код");
    assert.equal(await page.getByTestId("biz-point-qr").count(), 0);
    const click = action === "failure" ? "show-qr" : action === "clipboard-fallback" ? "copy" : action === "share-denied" ? "share" : action;
    await page.getByTestId(`biz-point-${click}`).click();
    if (action === "failure") {
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByTestId("biz-point-qr").count(), 0);
    } else {
      await page.getByTestId("biz-point-code").waitFor();
      assert.match(await page.getByTestId("biz-point-code").innerText(), /4.*7.*1.*9/);
      if (action === "show-qr") {
        await page.getByTestId("biz-point-qr").waitFor({ state: "visible" });
        assert.equal(await page.getByTestId("biz-point-qr").locator("path,rect").count() > 0, true);
        await page.getByTestId("biz-point-show-qr").click();
      }
      if (action === "share-denied") await page.getByRole("alert").waitFor();
      if (action === "clipboard-fallback") await page.getByTestId("biz-point-copy-hand").waitFor();
      const values = await page.evaluate(() => ({ shares: window.shares, copies: window.copies, targets: window.targets }));
      if (action === "copy") assert.match(values.copies[0], /#4719$/);
      if (action === "share") assert.match(values.shares[0].url, /#4719$/);
      assert.equal(await page.getByTestId("biz-point-link").count(), action === "clipboard-fallback" || action === "share-denied" ? 1 : 0);
      // Replacing a live code still asks, cancelling does not issue another code.
      await page.getByTestId("biz-point-create").click();
      await page.getByRole("dialog").waitFor();
      await page.getByTestId("biz-venue-confirm-no").click();
    }
    assert.equal(await page.evaluate(() => window.calls.filter(x => x === "create").length), 1, "one code, no prerequisite tap or duplicate issue");
    await page.close();
  }
  console.log("business-point-pairing-browser: ok (QR, share, copy, API error, clipboard fallback, share denied)");
} finally {
  await browser.close();
}
