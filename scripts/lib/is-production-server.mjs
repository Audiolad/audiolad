/**
 * Reliable production-server detection for АудиоЛад (audiolad.ru).
 *
 * Override (local dev / CI on the same host):
 *   AUDIOLAD_ALLOW_DEV=1        — allow `npm run dev`
 *   AUDIOLAD_ALLOW_PLAYWRIGHT=1 — allow Playwright/E2E
 *   AUDIOLAD_ALLOW_START=1      — allow manual `npm start` outside PM2
 *
 * Fixture scripts (DB writes):
 *   ALLOW_PRODUCTION_TEST_FIXTURES=true — see scripts/lib/guard-production-fixtures.mjs
 *
 * Explicit production marker:
 *   AUDIOLAD_PRODUCTION_SERVER=1
 *   /var/www/audiolad-deploy/PRODUCTION_SERVER (file)
 *   /var/www/audiolad-deploy/current (deploy layout)
 */
import { existsSync } from "node:fs";

export const PRODUCTION_MARKER =
  process.env.AUDIOLAD_PRODUCTION_MARKER ??
  "/var/www/audiolad-deploy/PRODUCTION_SERVER";

export const DEPLOY_ROOT =
  process.env.AUDIOLAD_DEPLOY_ROOT ?? "/var/www/audiolad-deploy";

const DOC = "docs/operations/production-process-policy.md";

export function isProductionServer() {
  if (process.env.AUDIOLAD_ALLOW_DEV === "1") return false;
  if (process.env.AUDIOLAD_ALLOW_PLAYWRIGHT === "1") return false;
  if (process.env.AUDIOLAD_PRODUCTION_SERVER === "1") return true;
  if (existsSync(PRODUCTION_MARKER)) return true;
  if (existsSync(`${DEPLOY_ROOT}/current`)) return true;
  return false;
}

export function isPm2ProductionStart() {
  return process.env.name === "audiolad" || process.env.pm_id != null;
}

export function isDeployCandidateStart() {
  const port = String(process.env.PORT ?? "3000");
  return port === "3001";
}

export function assertDevAllowed() {
  if (!isProductionServer()) return;
  console.error(
    [
      "",
      "npm run dev запрещён на production-сервере audiolad.ru.",
      "Production работает только через PM2 + next start.",
      "Для локальной разработки используйте отдельную машину или задайте AUDIOLAD_ALLOW_DEV=1 осознанно.",
      `См. ${DOC}`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}

export function assertPlaywrightAllowed() {
  if (!isProductionServer()) return;
  console.error(
    [
      "",
      "Playwright/E2E запрещён на production-сервере.",
      "Браузерные тесты запускайте локально, в CI или на отдельной тестовой среде.",
      "Production smoke — только HTTP (scripts/production-smoke-http.mjs).",
      `См. ${DOC}`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}

export function assertProductionStartAllowed() {
  if (!isProductionServer()) return;
  if (isPm2ProductionStart()) return;
  if (isDeployCandidateStart()) return;
  if (process.env.AUDIOLAD_ALLOW_START === "1") return;

  console.error(
    [
      "",
      "Ручной npm start запрещён на production-сервере.",
      "Production Next.js управляется только PM2 (audiolad).",
      "Deploy-кандidate использует PORT=3001 автоматически.",
      `См. ${DOC}`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}
