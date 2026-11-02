import { validateEmailForRegistrationServer } from "@/lib/auth/email";
import { getAuthHookSecretFromEnv } from "@/lib/auth/hooks/verify-standard-webhook";
import { createBeforeUserCreatedHandler } from "@/lib/auth/hooks/before-user-created";
import { authorizeBusinessGuestUser, isBusinessGuestAuthEnabled } from "@/lib/auth/business-guest/ticket.server";

export const POST = createBeforeUserCreatedHandler({
  hookSecret: getAuthHookSecretFromEnv,
  guestEnabled: isBusinessGuestAuthEnabled,
  authorizeGuest: authorizeBusinessGuestUser,
  validateEmail: validateEmailForRegistrationServer,
});
