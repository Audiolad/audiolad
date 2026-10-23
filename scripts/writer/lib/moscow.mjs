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
  ];
}

// ssh gets a minimal environment, so nothing from the box (tokens, GH_*) can reach the host
// even if an ssh_config sends environment variables.
function ssh(config, command, { input = "", timeoutMs = 120000 } = {}) {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: homedir(), LANG: "C.UTF-8" };
  return run("ssh", [...sshOptions(config), config.host, command], { input, timeoutMs, env });
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
  if (!/^[a-z0-9-]+$/.test(runId) || !/^[a-z0-9-]+$/.test(callName)) throw new Error("bad run id");
  const remoteDir = `/root/writer/runs/${runId}/${callName}`;
  const prepare = ssh(config, `umask 077 && mkdir -p ${remoteDir}`);
  if (prepare.status !== 0) throw new Error(`Москва недоступна: ${prepare.stderr.trim().slice(0, 300)}`);
  for (const [file, name] of [[GENERATOR, "generate.py"], [requestPath, "request.json"]]) {
    const copy = upload(config, file, `${remoteDir}/${name}`);
    if (copy.status !== 0) throw new Error(`Не удалось передать ${basename(file)} на Москву: ${copy.stderr.trim().slice(0, 300)}`);
  }
  const call = ssh(config, `cd ${remoteDir} && python3 generate.py`, { timeoutMs: 20 * 60 * 1000 });
  mkdirSync(localDir, { recursive: true });
  for (const name of ["meta.json", "article.json", "article.txt"]) {
    download(config, `${remoteDir}/${name}`, join(localDir, name));
  }
  const metaPath = join(localDir, "meta.json");
  const meta = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf8"))
    : { ok: false, error: `generate.py: код ${call.status}` };
  const articlePath = join(localDir, "article.json");
  const article = existsSync(articlePath) ? JSON.parse(readFileSync(articlePath, "utf8")) : null;
  return { meta, article, remoteDir };
}
