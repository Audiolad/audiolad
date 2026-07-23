export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

function parseSmtpPort(portRaw: string | undefined, fallback = 465): number | null {
  if (!portRaw) {
    return fallback;
  }

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  return port;
}

function parseSmtpSecure(secureRaw: string | undefined, port: number): boolean {
  if (secureRaw === "false" || secureRaw === "0") {
    return false;
  }

  if (secureRaw === "true" || secureRaw === "1") {
    return true;
  }

  return port === 465;
}

function buildSmtpConfig(input: {
  host: string;
  portRaw: string | undefined;
  secureRaw: string | undefined;
  user: string;
  password: string;
}): SmtpConfig | null {
  const port = parseSmtpPort(input.portRaw);
  if (port === null) {
    return null;
  }

  return {
    host: input.host,
    port,
    secure: parseSmtpSecure(input.secureRaw, port),
    user: input.user,
    password: input.password,
  };
}

export function getSmtpConfigFromEnv(): SmtpConfig | null {
  const host = process.env.AUDIOLAD_SMTP_HOST?.trim();
  const user = process.env.AUDIOLAD_SMTP_USER?.trim();
  const password = process.env.AUDIOLAD_SMTP_PASS?.trim();

  if (!host || !user || !password) {
    return null;
  }

  return buildSmtpConfig({
    host,
    portRaw: process.env.AUDIOLAD_SMTP_PORT?.trim(),
    secureRaw: process.env.AUDIOLAD_SMTP_SECURE?.trim().toLowerCase(),
    user,
    password,
  });
}

/**
 * Dedicated Timeweb mailbox for author-facing application emails.
 * USER and PASS are required; host/port/secure inherit from primary SMTP when omitted.
 * Never falls back to inbox@ credentials.
 */
export function getAuthorsSmtpConfigFromEnv(): SmtpConfig | null {
  const user = process.env.AUDIOLAD_SMTP_AUTHORS_USER?.trim();
  const password = process.env.AUDIOLAD_SMTP_AUTHORS_PASS?.trim();

  if (!user || !password) {
    return null;
  }

  const host =
    process.env.AUDIOLAD_SMTP_AUTHORS_HOST?.trim() ||
    process.env.AUDIOLAD_SMTP_HOST?.trim();

  if (!host) {
    return null;
  }

  const portRaw =
    process.env.AUDIOLAD_SMTP_AUTHORS_PORT?.trim() ||
    process.env.AUDIOLAD_SMTP_PORT?.trim();

  const secureRaw =
    process.env.AUDIOLAD_SMTP_AUTHORS_SECURE?.trim().toLowerCase() ||
    process.env.AUDIOLAD_SMTP_SECURE?.trim().toLowerCase();

  return buildSmtpConfig({
    host,
    portRaw,
    secureRaw,
    user,
    password,
  });
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfigFromEnv() !== null;
}

export function isAuthorsSmtpConfigured(): boolean {
  return getAuthorsSmtpConfigFromEnv() !== null;
}
