// Moscow transport: only request.json and generate.py go to the host; only the
// extracted article and usage metadata come back. GitHub credentials never leave the box
// (no agent forwarding, no env), and the Cloud.ru key never leaves the Moscow host.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { run } from "./util.mjs";

const GENERATOR = new URL("../remote/generate.py", import.meta.url).pathname;

function settings() {
  return {
    host: process.env.WRITER_MOSCOW_HOST ?? "root@72.56.232.160",
    key: process.env.WRITER_SSH_KEY ?? join(homedir(), ".ssh/id_ed25519_audiolad"),
    knownHosts: process.env.WRITER_SSH_KNOWN_HOSTS ?? join(homedir(), ".ssh/known_hosts_audiolad"),
  };
}

function sshOptions(config) {
  return [
    "-i", config.key,
    "-o", `UserKnownHostsFile=${config.knownHosts}`,
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ForwardAgent=no",
    "-o", "ForwardX11=no",
    "-o", "StrictHostKeyChecking=yes",
    // A dead or half-closed connection is detected in about a minute instead of hanging.
    "-o", "ConnectTimeout=20",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=4",
  ];
}

// ssh gets a minimal environment, so nothing from the box (tokens, GH_*) can reach the host
// even if an ssh_config sends environment variables.
function ssh(config, command, { input = "", timeoutMs = 120000 } = {}) {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: homedir(), LANG: "C.UTF-8" };
  // SIGKILL: a wrapper that ignores SIGTERM must not outlive its timeout.
  return run("ssh", [...sshOptions(config), config.host, command], { input, timeoutMs, env, killSignal: "SIGKILL" });
}

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(sleepBuffer, 0, 0, ms);
}

export const GENERATE_TIMEOUT_MS = 20 * 60 * 1000;
export const POLL_INTERVAL_MS = 10 * 1000;
const POLL_SSH_TIMEOUT_MS = 60 * 1000;

/**
 * Starts generate.py detached on the host and polls for its exit-code marker with short ssh
 * calls. No ssh session stays open for the whole generation, so a finished remote call is
 * picked up within one poll interval even if an ssh client hangs after the remote side exits
 * (seen on the box: a 20-minute wait after a finished call). Returns { status, timedOut }.
 */
export function runDetached(remoteDir, { sshCall, sleep = sleepSync, now = Date.now, timeoutMs = GENERATE_TIMEOUT_MS, pollMs = POLL_INTERVAL_MS } = {}) {
  const start = sshCall(
    `cd ${remoteDir} && rm -f exit.code exit.code.tmp && ` +
      `(setsid nohup sh -c 'python3 generate.py > generate.log 2>&1; echo $? > exit.code.tmp && mv exit.code.tmp exit.code' ` +
      "</dev/null >/dev/null 2>&1 &) && echo started",
    { timeoutMs: POLL_SSH_TIMEOUT_MS },
  );
  if (start.status !== 0 || !start.stdout.includes("started")) return { status: start.status || 1, timedOut: false, error: start.stderr.trim().slice(0, 300) };
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    sleep(pollMs);
    const poll = sshCall(`cat ${remoteDir}/exit.code 2>/dev/null || true`, { timeoutMs: POLL_SSH_TIMEOUT_MS });
    const code = poll.status === 0 ? poll.stdout.trim() : "";
    if (/^\d+$/.test(code)) return { status: Number(code), timedOut: false };
  }
  return { status: 124, timedOut: true };
}

// File transfer over ssh stdin/stdout (no scp dependency on the box).
function upload(config, localPath, remotePath) {
  return ssh(config, `umask 077 && cat > ${remotePath}`, { input: readFileSync(localPath) });
}

function download(config, remotePath, localPath) {
  const result = ssh(config, `test -f ${remotePath} && cat ${remotePath}`);
  if (result.status === 0) writeFileSync(localPath, result.stdout);
  return result.status === 0;
}

/**
 * Executes one generation call on the Moscow host.
 * Returns { meta, article } where article is the parsed model JSON or null.
 */
export function generateOnMoscow(runId, callName, requestPath, localDir) {
  const config = settings();
  const sshCall = (command, options) => ssh(config, command, options);
  if (!/^[a-z0-9-]+$/.test(runId) || !/^[a-z0-9-]+$/.test(callName)) throw new Error("bad run id");
  const remoteDir = `/root/writer/runs/${runId}/${callName}`;
  const prepare = ssh(config, `umask 077 && mkdir -p ${remoteDir}`);
  if (prepare.status !== 0) throw new Error(`Москва недоступна: ${prepare.stderr.trim().slice(0, 300)}`);
  for (const [file, name] of [[GENERATOR, "generate.py"], [requestPath, "request.json"]]) {
    const copy = upload(config, file, `${remoteDir}/${name}`);
    if (copy.status !== 0) throw new Error(`Не удалось передать ${basename(file)} на Москву: ${copy.stderr.trim().slice(0, 300)}`);
  }
  const call = runDetached(remoteDir, { sshCall });
  mkdirSync(localDir, { recursive: true });
  for (const name of ["meta.json", "article.json", "article.txt"]) {
    download(config, `${remoteDir}/${name}`, join(localDir, name));
  }
  const metaPath = join(localDir, "meta.json");
  const meta = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf8"))
    : { ok: false, error: call.timedOut ? "generate.py: нет результата за 20 минут" : `generate.py: код ${call.status}` };
  const articlePath = join(localDir, "article.json");
  const article = existsSync(articlePath) ? JSON.parse(readFileSync(articlePath, "utf8")) : null;
  return { meta, article, remoteDir };
}
