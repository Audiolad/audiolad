/**
 * Isolated HEIC decode in a child process.
 * The parent can SIGKILL this process so a hung WASM conversion
 * actually stops using CPU/RAM (waiting-only timeouts do not).
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.on("message", async (message) => {
  if (message?.hangForTest) {
    for (;;) {
      // Test-only busy-wait until the parent kills this process.
    }
  }

  try {
    const convert = require("heic-convert");
    const converted = await convert({
      buffer: Buffer.from(message.buffer),
      format: "JPEG",
      quality: 0.9,
    });
    process.send?.({ ok: true, buffer: Buffer.from(converted) });
  } catch (error) {
    process.send?.({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
