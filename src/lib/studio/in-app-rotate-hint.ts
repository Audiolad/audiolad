export const STUDIO_IN_APP_ROTATE_HINT_DISMISSED_KEY =
  "audiolad.studio.inAppRotateHint.dismissed";

export type StudioInAppRotateHintInput = {
  isInApp?: boolean;
  isStandalone?: boolean;
  isPortrait?: boolean;
  isMobileViewport?: boolean;
  dismissed?: boolean;
};

/**
 * Fail-safe visibility for the Studio in-app/embedded browser hint.
 * Defaults to false when flags are missing. Callers must not invoke this
 * during SSR with live window state — pass explicit booleans instead.
 */
export function shouldShowStudioInAppRotateHint(
  input: StudioInAppRotateHintInput = {},
): boolean {
  if (input.isInApp !== true) {
    return false;
  }

  if (input.isStandalone === true) {
    return false;
  }

  if (input.isPortrait !== true) {
    return false;
  }

  if (input.isMobileViewport !== true) {
    return false;
  }

  if (input.dismissed === true) {
    return false;
  }

  return true;
}
