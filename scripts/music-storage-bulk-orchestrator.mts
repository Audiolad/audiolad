import { loadProductionEnvFromCwd } from "./load-production-env";
import type { BulkStage } from "../src/lib/music-storage/bulk-migration";
import {
  orchestratorPause,
  orchestratorResume,
  orchestratorStart,
  orchestratorStatus,
  orchestratorStop,
  runOrchestratorTick,
} from "../src/lib/music-storage/bulk-orchestrator";

loadProductionEnvFromCwd();

function parseStage(argument: string | undefined): BulkStage {
  if (argument === "copy" || argument === "cutover" || argument === "release-local") return argument;
  throw new Error("usage: music-storage-bulk-orchestrator <copy|cutover|release-local> <status|start|stop|pause|resume|tick>");
}

function parseCommand(argument: string | undefined): string {
  if (!argument) throw new Error("missing command");
  return argument;
}

async function main() {
  const stage = parseStage(process.argv[2]);
  const command = parseCommand(process.argv[3]);
  const resetCursor = process.argv.includes("--reset-cursor");

  if (command === "status") {
    const status = await orchestratorStatus(stage);
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  if (command === "start") {
    console.log(JSON.stringify({ state: orchestratorStart(stage, resetCursor) }, null, 2));
    return;
  }
  if (command === "stop") {
    console.log(JSON.stringify({ state: orchestratorStop() }, null, 2));
    return;
  }
  if (command === "pause") {
    console.log(JSON.stringify({ state: orchestratorPause() }, null, 2));
    return;
  }
  if (command === "resume") {
    console.log(JSON.stringify({ state: orchestratorResume() }, null, 2));
    return;
  }
  if (command === "tick") {
    const tick = await runOrchestratorTick(stage);
    console.log(JSON.stringify(tick, null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

await main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});