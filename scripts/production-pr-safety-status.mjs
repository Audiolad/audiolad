#!/usr/bin/env node
/**
 * Maps the trusted guard outcome to a GitHub commit status.
 * Any missing/unexpected result fails closed as an infrastructure error.
 */
import { appendFile } from "node:fs/promises";

export function resolveTrustedCommitStatus({ guardOutcome, guardState }) {
  if (guardOutcome === "success" && guardState === "success") {
    return {
      state: "success",
      description: "SAFE TO CONTINUE REVIEW (not deployment approval)",
    };
  }

  if (guardOutcome === "failure" && guardState === "failure") {
    return {
      state: "failure",
      description: "BLOCK MERGE — see trusted safety summary",
    };
  }

  return {
    state: "error",
    description: "Trusted production lineage check had an internal error",
  };
}

async function main() {
  const result = resolveTrustedCommitStatus({
    guardOutcome: process.env.GUARD_OUTCOME,
    guardState: process.env.GUARD_STATE,
  });
  const output = `state=${result.state}\ndescription=${result.description}\n`;

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
