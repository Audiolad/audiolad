/**
 * One permission table for the two sides of the AudioLad Business cabinet (Sergey 03.11.2026 16:57).
 * Pure / browser-safe: the navigation, the sidebar, every screen and the server guards read the
 * same rows, so the menu and the server can never disagree.
 *
 * Modes:
 * - "owner"   – the owner's own browser (phone or laptop) without a live venue-device cookie,
 *               or the hall device right after the owner re-entered the password (owner unlock).
 * - "point"   – the paired hall device (`al-point`), whatever account is signed in on it.
 * - "preview" – the owner's own browser showing «как видит точка». Same rows as "point"
 *               (the "venue" column), but nothing is sent as the hall device: no point reports.
 *
 * The table is the UI and request policy. The database rules (RLS, SECURITY DEFINER RPCs,
 * membership checks) stay as they are; this table only narrows what the cabinet allows.
 */

export type BusinessCabinetMode = "owner" | "preview" | "point";

/** Which column of the table a mode reads. Preview and point read the same one. */
export type BusinessCabinetSide = "owner" | "venue";

export function businessCabinetSide(mode: BusinessCabinetMode): BusinessCabinetSide {
  return mode === "owner" ? "owner" : "venue";
}

/** "if_allowed" = the owner's «Разрешить менять настройку на точке» switch decides. */
type Rule = boolean | "if_allowed";

export const BUSINESS_CABINET_PERMISSIONS = {
  // Sections (menu items and their pages).
  sectionHome: { owner: true, venue: true },
  sectionMusic: { owner: true, venue: true },
  sectionSettings: { owner: true, venue: "if_allowed" },
  sectionDocuments: { owner: true, venue: true },
  sectionHelp: { owner: true, venue: true },
  sectionProfile: { owner: true, venue: false },
  /** Onboarding and adding a new venue. */
  sectionOnboarding: { owner: true, venue: false },

  // Payment, term and offer.
  accessCard: { owner: true, venue: false },
  accessLine: { owner: true, venue: false },
  payLink: { owner: true, venue: false },
  offerAccept: { owner: true, venue: false },

  // Music screen.
  playPause: { owner: true, venue: true },
  trackRatings: { owner: true, venue: false },
  daypartSettings: { owner: true, venue: false },

  // Settings screen.
  atmosphereSettings: { owner: true, venue: "if_allowed" },
  /** «Пересобрать атмосферу» (Sergey 04.11.2026): a new venue playlist from the 4 × 4 choices. Owner only. */
  atmosphereRebuild: { owner: true, venue: false },
  venueRemote: { owner: true, venue: false },
  deviceManagement: { owner: true, venue: false },

  // Documents.
  inspectorCard: { owner: true, venue: true },
  inspectorQr: { owner: true, venue: true },
  playbackReport: { owner: true, venue: true },
  stickerDownload: { owner: true, venue: false },

  // Home.
  ownerChecklist: { owner: true, venue: false },
  hallControls: { owner: false, venue: true },

  // Account.
  profileEdit: { owner: true, venue: false },
  signOut: { owner: true, venue: false },
  disconnectThisDevice: { owner: false, venue: true },
} as const satisfies Record<string, Record<BusinessCabinetSide, Rule>>;

export type BusinessCabinetPermission = keyof typeof BUSINESS_CABINET_PERMISSIONS;

export type BusinessCabinetModeInput = {
  mode: BusinessCabinetMode;
  /** The owner's switch for the hall device. Ignored on the owner side. */
  pointCanEdit?: boolean;
};

export function businessCabinetCan(input: BusinessCabinetModeInput, permission: BusinessCabinetPermission): boolean {
  const rule: Rule = BUSINESS_CABINET_PERMISSIONS[permission][businessCabinetSide(input.mode)];
  if (rule === "if_allowed") return input.pointCanEdit !== false;
  return rule;
}

export type BusinessCabinetSectionId = "home" | "music" | "settings" | "documents" | "help" | "profile";

const SECTION_PERMISSION: Record<BusinessCabinetSectionId, BusinessCabinetPermission> = {
  home: "sectionHome",
  music: "sectionMusic",
  settings: "sectionSettings",
  documents: "sectionDocuments",
  help: "sectionHelp",
  profile: "sectionProfile",
};

/** Menu order per side. Owner: Главная, Музыка, Настройка, Документы, Профиль. */
const SECTION_ORDER: Record<BusinessCabinetSide, readonly BusinessCabinetSectionId[]> = {
  owner: ["home", "music", "settings", "documents", "profile"],
  venue: ["home", "music", "settings", "documents", "help"],
};

/** The sections the menu shows for this mode, in order (at most five, for the mobile bar). */
export function businessCabinetSections(input: BusinessCabinetModeInput): BusinessCabinetSectionId[] {
  return SECTION_ORDER[businessCabinetSide(input.mode)].filter((id) => businessCabinetCan(input, SECTION_PERMISSION[id]));
}

/**
 * Owner-only pages (business-host public paths). On the venue side they open «Музыка» instead.
 * Keep in sync with the "venue: false" section rows above.
 */
export const BUSINESS_OWNER_ONLY_PATHS: readonly string[] = ["/profile", "/onboarding"];

export function isBusinessOwnerOnlyPath(pathname: string): boolean {
  return BUSINESS_OWNER_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Where a venue-side visitor goes instead of an owner-only page. */
export const BUSINESS_VENUE_FALLBACK_PATH = "/music";

/**
 * Owner unlock on the hall device: the owner re-entered the password on this browser less than
 * this long ago. After that the device is the hall device again, on the next request.
 */
export const BUSINESS_OWNER_UNLOCK_SECONDS = 15 * 60;

type AmrEntry = { method?: unknown; timestamp?: unknown };

/**
 * The end of the owner unlock (unix seconds) from verified JWT claims, or null.
 * Supabase Auth writes `amr` = [{ method: "password", timestamp }] at a password sign-in and keeps
 * that timestamp on token refresh, so only a real password entry starts the window.
 * A timestamp from the future (beyond a minute of clock skew) is not trusted.
 */
export function businessOwnerUnlockUntil(claims: unknown, nowSeconds: number): number | null {
  if (!claims || typeof claims !== "object") return null;
  const amr = (claims as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return null;
  let latest = 0;
  for (const entry of amr as AmrEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.method !== "password") continue;
    if (typeof entry.timestamp !== "number" || !Number.isFinite(entry.timestamp)) continue;
    latest = Math.max(latest, entry.timestamp);
  }
  if (latest <= 0 || latest > nowSeconds + 60) return null;
  const until = latest + BUSINESS_OWNER_UNLOCK_SECONDS;
  return until > nowSeconds ? until : null;
}

export type BusinessCabinetModeFacts = {
  /** Live `al-point` session on this browser. */
  pointAlive: boolean;
  /** Fresh password entry on this browser (see businessOwnerUnlockUntil). */
  ownerUnlocked: boolean;
  /** The owner chose «Как видит точка» in the header (UI cookie). */
  previewChosen: boolean;
  /** Signed-in member with a venue: only they can preview. */
  canPreview: boolean;
};

export function resolveBusinessCabinetMode(facts: BusinessCabinetModeFacts): BusinessCabinetMode {
  if (facts.pointAlive && !facts.ownerUnlocked) return "point";
  if (!facts.pointAlive && facts.previewChosen && facts.canPreview) return "preview";
  return "owner";
}

/**
 * Point reports (the hall player beats, play facts, command acks) go out only from a live
 * device session, never from preview. An owner unlock does not stop them: the music in the hall
 * keeps playing and reporting while the owner looks at the cabinet.
 */
export function businessPointReports(facts: Pick<BusinessCabinetModeFacts, "pointAlive">): boolean {
  return facts.pointAlive;
}

/** Same-site relative path only (no scheme, no //host, no backslash). Anything else gives "/". */
export function safeBusinessNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  if (next.length > 512) return "/";
  return next;
}

/** Public path of the owner password check on the business host. */
export const BUSINESS_OWNER_UNLOCK_PATH = "/owner";
