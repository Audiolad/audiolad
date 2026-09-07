import { createRequire } from "node:module";
import type { ChildProcess } from "node:child_process";

import { AVATAR_HEIC_CONVERT_TIMEOUT_MS } from "@/lib/images/avatar-constants";

const nodeRequire = createRequire(import.meta.url);

export function isHeicLikeMime(
  mime: string | null | undefined,
): boolean {
  const normalized = (mime ?? "").trim().toLowerCase();
  return (
    normalized === "image/heic" ||
    normalized === "image/heif" ||
    normalized === "image/heic-sequence" ||
    normalized === "image/heif-sequence"
  );
}

function resolveHeicWorkerPath(): string {
  const { existsSync } = nodeRequire("node:fs") as typeof import("node:fs");
  const { join } = nodeRequire("node:path") as typeof import("node:path");

  const scriptPath = join(
    /* turbopackIgnore: true */ process.cwd(),
    "src",
    "lib",
    "images",
    "heic-convert-worker.mjs",
  );

  if (!existsSync(scriptPath)) {
    throw new Error("heic_worker_missing");
  }

  return scriptPath;
}

function startHeicChild(scriptPath: string): ChildProcess {
  // createRequire + runtime fork: Next/Turbopack must not rewrite this
  // into a bundler worker (it does that for `new Worker` and static fork()).
  const { fork } = nodeRequire("node:child_process") as typeof import("node:child_process");
  return fork(scriptPath, [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

function killHeicChild(child: ChildProcess) {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGKILL");
}

export type ConvertHeicOptions = {
  /** Test-only: child busy-waits until SIGKILL. */
  hangForTest?: boolean;
};

/**
 * Convert HEIC/HEIF in a child process.
 * After timeout the child is SIGKILL'd — WASM/CPU work actually stops.
 */
export async function convertHeicToJpegBuffer(
  input: Buffer,
  timeoutMs = AVATAR_HEIC_CONVERT_TIMEOUT_MS,
  options?: ConvertHeicOptions,
): Promise<Buffer> {
  const child = startHeicChild(resolveHeicWorkerPath());

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const result = new Promise<Buffer>((resolve, reject) => {
    const finish = (error: Error | null, jpeg?: Buffer) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }

      if (error) {
        reject(error);
        return;
      }

      resolve(jpeg as Buffer);
    };

    timer = setTimeout(() => {
      finish(new Error("heic_convert_timeout"));
      killHeicChild(child);
    }, timeoutMs);

    child.once(
      "message",
      (message: { ok?: boolean; buffer?: Buffer; message?: string }) => {
        if (!message?.ok || !message.buffer) {
          finish(new Error(message?.message || "heic_convert_failed"));
          return;
        }

        const jpeg = Buffer.from(message.buffer);

        if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
          finish(new Error("heic_convert_invalid_output"));
          return;
        }

        finish(null, jpeg);
      },
    );

    child.once("error", (error) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });

    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }

      finish(
        new Error(
          signal === "SIGKILL" ? "heic_convert_timeout" : `heic_convert_exit_${code ?? signal}`,
        ),
      );
    });

    child.send({
      buffer: input,
      hangForTest: options?.hangForTest === true,
    });
  });

  try {
    return await result;
  } finally {
    killHeicChild(child);
  }
}
