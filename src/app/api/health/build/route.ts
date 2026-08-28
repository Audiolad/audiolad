import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

type BuildHealthResponse = {
  status: "ok";
  buildId: string | null;
  deployCommit: string | null;
  processStartedAt: string;
  nodeEnv: string;
  cwd: string;
  pid: number;
};

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

async function readBuildId(): Promise<string | null> {
  try {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    const buildId = (await readFile(buildIdPath, "utf8")).trim();

    return buildId || null;
  } catch {
    return null;
  }
}

export async function readDeployCommit(
  cwd = process.cwd(),
): Promise<string | null> {
  try {
    const deployCommit = (await readFile(path.join(cwd, ".deploy-commit"), "utf8")).trim();

    return FULL_GIT_SHA.test(deployCommit) ? deployCommit.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const payload: BuildHealthResponse = {
    status: "ok",
    buildId: await readBuildId(),
    deployCommit: await readDeployCommit(),
    processStartedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    nodeEnv: process.env.NODE_ENV ?? "development",
    cwd: process.cwd(),
    pid: process.pid,
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
