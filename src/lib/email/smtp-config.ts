export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export function getSmtpConfigFromEnv(): SmtpConfig | null {
  const host = process.env.AUDIOLAD_SMTP_HOST?.trim();
  const user = process.env.AUDIOLAD_SMTP_USER?.trim();
  const password = process.env.AUDIOLAD_SMTP_PASS?.trim();

  if (!host || !user || !password) {
    return null;
  }

  const portRaw = process.env.AUDIOLAD_SMTP_PORT?.trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : 465;

  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const secureRaw = process.env.AUDIOLAD_SMTP_SECURE?.trim().toLowerCase();
  const secure =
    secureRaw === "false" || secureRaw === "0"
      ? false
      : secureRaw === "true" || secureRaw === "1"
        ? true
        : port === 465;

  return {
    host,
    port,
    secure,
    user,
    password,
  };
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfigFromEnv() !== null;
}
