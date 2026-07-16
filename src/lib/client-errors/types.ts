export const CLIENT_ERROR_TYPES = [
  "chunk_load",
  "dynamic_import",
  "hydration",
  "server_action",
  "react_render",
  "other",
] as const;

export type ClientErrorType = (typeof CLIENT_ERROR_TYPES)[number];

export type ClientErrorReport = {
  type: ClientErrorType;
  message: string;
  stack: string | null;
  source: string | null;
  pathname: string;
  href: string;
  userAgent: string;
  online: boolean;
  buildId: string | null;
  hasServiceWorker: boolean;
  timestamp: string;
};
