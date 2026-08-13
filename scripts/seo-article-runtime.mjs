import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_BIN = resolve(ROOT, "node_modules/next/dist/bin/next");
const BUILD_ID_PATH = resolve(ROOT, ".next/BUILD_ID");
const CREATOR_PATH = "/articles/kak-sozdat-svoyu-meditatsiyu";
const CTA_HEADING = "Хотите создать свою медитацию? Выберите, с чего начать.";
const STUDIO_HREF = "https://audiolad.ru/studio/meditation";
const SCHOOL_ORIGIN = "https://school.audiolad.ru";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function reserveLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve a loopback port")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function decodeUnicodeEscapes(value) {
  return value.replace(/\\u([0-9a-f]{4})/gi, (_match, code) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}

async function fetchWhenReady(url, processRef, logs) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (processRef.exitCode !== null) {
      throw new Error(`next start exited early:\n${logs()}`);
    }

    try {
      const response = await fetch(url, {
        headers: { accept: "text/html" },
        signal: AbortSignal.timeout(3_000),
      });

      return response;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`Timed out waiting for ${url}:\n${logs()}`);
}

async function stopServer(processRef) {
  if (processRef.exitCode !== null) {
    return;
  }

  processRef.kill("SIGTERM");

  await Promise.race([
    new Promise((resolveExit) => processRef.once("exit", resolveExit)),
    sleep(5_000),
  ]);

  if (processRef.exitCode === null) {
    processRef.kill("SIGKILL");
  }
}

async function main() {
  assert(
    existsSync(BUILD_ID_PATH),
    "Production build is required. Run `npm run build` first.",
  );

  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const nextProcess = spawn(
    process.execPath,
    [NEXT_BIN, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
          "seo-article-runtime-test-key",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  nextProcess.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  nextProcess.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    const response = await fetchWhenReady(
      `${baseUrl}${CREATOR_PATH}`,
      nextProcess,
      () => output,
    );
    const html = await response.text();
    const renderedHtml = decodeUnicodeEscapes(html);
    const pageHtml = decodeUnicodeEscapes(
      html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
    );

    assert(
      response.status === 200,
      `Creator article returned HTTP ${response.status}:\n${html.slice(0, 1_000)}`,
    );
    const ctaCount = pageHtml.split(CTA_HEADING).length - 1;
    assert(
      ctaCount === 2,
      `Creator article must render two CreatorPathsCta blocks (found ${ctaCount})`,
    );
    assert(
      renderedHtml.includes(STUDIO_HREF),
      "Creator article is missing Studio URL",
    );
    assert(
      renderedHtml.includes(SCHOOL_ORIGIN),
      "Creator article is missing School URL",
    );
    assert(
      renderedHtml.lastIndexOf("Частые вопросы") >
        renderedHtml.lastIndexOf(CTA_HEADING),
      "Creator FAQ must follow the bottom CreatorPathsCta",
    );
    assert(
      !renderedHtml.includes(
        "useArticlePlayback must be used within ArticlePlaybackProvider",
      ),
      "Creator article must not require ArticlePlaybackProvider",
    );

    console.log("seo-article-runtime: OK");
  } finally {
    await stopServer(nextProcess);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
