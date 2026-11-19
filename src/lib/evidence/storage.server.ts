// t1578u: on-disk layout of the evidence tool (outside releases, survives deploys).
//   <root>/extracts/<id>/   signed play-log extracts
//   <root>/keys/            Ed25519 service seal (private key 0600, never sent anywhere)
import "server-only";

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdir, open, readFile, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";

export const EVIDENCE_ROOT_DEFAULT = "/var/lib/audiolad/evidence-matcher";

export function evidenceRoot(env: NodeJS.Dict<string> = process.env): string {
  return resolve(env.AUDIOLAD_EVIDENCE_ROOT?.trim() || EVIDENCE_ROOT_DEFAULT);
}

export const EVIDENCE_ID_RE = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$/;

export function extractsDir(root = evidenceRoot()): string {
  return join(root, "extracts");
}

export function extractDir(id: string, root = evidenceRoot()): string {
  if (!EVIDENCE_ID_RE.test(id)) throw new Error("evidence_bad_id");
  return join(extractsDir(root), id);
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export type SealKey = { privateKey: KeyObject; publicPem: string; fingerprint: string };

/**
 * Loads the service seal, creating it on first use. Creation uses O_EXCL so two requests
 * can never write two different keys. The private key is never logged or returned.
 */
export async function loadOrCreateSealKey(root = evidenceRoot()): Promise<SealKey> {
  const dir = join(root, "keys");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const privPath = join(dir, "seal-ed25519.pem");
  let pem: string;
  try {
    pem = await readFile(privPath, "utf8");
  } catch {
    const pair = generateKeyPairSync("ed25519");
    const out = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    try {
      const fh = await open(privPath, "wx", 0o600);
      try {
        await fh.writeFile(out);
      } finally {
        await fh.close();
      }
      pem = out;
    } catch {
      pem = await readFile(privPath, "utf8");
    }
  }
  const privateKey = createPrivateKey(pem);
  const pub = createPublicKey(privateKey);
  const publicPem = pub.export({ type: "spki", format: "pem" }).toString();
  const der = pub.export({ type: "spki", format: "der" });
  return { privateKey, publicPem, fingerprint: sha256Hex(der) };
}

export function sealBytes(key: SealKey, data: Buffer): Buffer {
  return sign(null, data, key.privateKey);
}
